import type { PomodoroSessionDto } from '@qubedu/shared';
import { create } from 'zustand';
import { api } from './api';
import { currentT } from './i18n';
import { queryClient, qk } from './query';
import { useSession } from './session';
import { celebrate, toast, toastError } from './ui';

export type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';
export const DEFAULT_MINUTES: Record<PomodoroMode, number> = { focus: 25, shortBreak: 5, longBreak: 15 };

interface PomodoroState {
  mode: PomodoroMode;
  minutes: Record<PomodoroMode, number>;
  /** Server session for focus mode (duration enforced by the API). */
  session: PomodoroSessionDto | null;
  /** Local timer for breaks. */
  breakEndsAt: number | null;
  /** Remaining ms when paused (breaks only; focus sessions cannot be paused server-side). */
  pausedRemaining: number | null;
  label: string;
  sound: boolean;
  loaded: boolean;
  busy: boolean;
  setMode: (m: PomodoroMode) => void;
  setMinutes: (m: PomodoroMode, v: number) => void;
  setLabel: (v: string) => void;
  setSound: (v: boolean) => void;
  load: () => Promise<void>;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  tick: () => void;
}

function chime() {
  try {
    const ctx = new AudioContext();
    const notes = [660, 880, 990];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* audio unavailable */
  }
}

let completing = false;

export const usePomodoro = create<PomodoroState>((set, get) => ({
  mode: 'focus',
  minutes: { ...DEFAULT_MINUTES },
  session: null,
  breakEndsAt: null,
  pausedRemaining: null,
  label: '',
  sound: true,
  loaded: false,
  busy: false,
  setMode: (mode) => {
    if (get().session || get().breakEndsAt) return;
    set({ mode, pausedRemaining: null });
  },
  setMinutes: (m, v) => set({ minutes: { ...get().minutes, [m]: Math.max(1, Math.min(m === 'focus' ? 120 : 60, Math.round(v))) } }),
  setLabel: (label) => set({ label }),
  setSound: (sound) => set({ sound }),
  load: async () => {
    if (get().loaded || useSession.getState().status !== 'authed') return;
    try {
      const { session } = await api.pomodoro.active();
      set({ session, loaded: true, mode: session ? 'focus' : get().mode });
    } catch {
      set({ loaded: true });
    }
  },
  start: async () => {
    const { mode, minutes, label, pausedRemaining } = get();
    if (mode !== 'focus') {
      set({ breakEndsAt: Date.now() + (pausedRemaining ?? minutes[mode] * 60_000), pausedRemaining: null });
      return;
    }
    set({ busy: true });
    try {
      const session = await api.pomodoro.start(minutes.focus, label.trim() || undefined);
      set({ session });
    } catch (e) {
      toastError(e);
    } finally {
      set({ busy: false });
    }
  },
  cancel: async () => {
    const { session } = get();
    set({ breakEndsAt: null, pausedRemaining: null });
    if (!session) return;
    set({ session: null });
    await api.pomodoro.cancel(session.id).catch(() => undefined);
  },
  pause: () => {
    const { breakEndsAt } = get();
    if (breakEndsAt) set({ pausedRemaining: Math.max(0, breakEndsAt - Date.now()), breakEndsAt: null });
  },
  resume: () => {
    const { pausedRemaining } = get();
    if (pausedRemaining !== null) set({ breakEndsAt: Date.now() + pausedRemaining, pausedRemaining: null });
  },
  tick: () => {
    const { session, breakEndsAt, sound } = get();
    const now = Date.now();
    if (breakEndsAt && now >= breakEndsAt) {
      set({ breakEndsAt: null, mode: 'focus' });
      if (sound) chime();
      toast(currentT().t('academic.focus.focus'), 'info');
    }
    if (session && now >= session.endsAt && !completing) {
      completing = true;
      void api.pomodoro
        .complete(session.id)
        .then((res) => {
          if (sound) chime();
          toast(currentT().t('academic.focus.completed', { xp: res.xpEarned }));
          celebrate(res);
          useSession.getState().patchMe({ todayMinutes: res.todayMinutes });
          void queryClient.invalidateQueries({ queryKey: qk.dashboard });
          void queryClient.invalidateQueries({ queryKey: ['pomodoro'] });
          set({ session: null, mode: 'shortBreak' });
        })
        .catch((e) => {
          toastError(e);
          set({ session: null });
        })
        .finally(() => {
          completing = false;
        });
    }
  },
}));

/** Remaining ms for whatever is currently running (or the configured length when idle). */
export function remainingMs(s: PomodoroState, now = Date.now()): number {
  if (s.session) return Math.max(0, s.session.endsAt - now);
  if (s.breakEndsAt) return Math.max(0, s.breakEndsAt - now);
  if (s.pausedRemaining !== null) return s.pausedRemaining;
  return s.minutes[s.mode] * 60_000;
}

export function totalMs(s: PomodoroState): number {
  if (s.session) return s.session.minutes * 60_000;
  return s.minutes[s.mode] * 60_000;
}

export function isRunning(s: PomodoroState) {
  return !!s.session || !!s.breakEndsAt;
}
