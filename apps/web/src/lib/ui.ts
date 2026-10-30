import { ACHIEVEMENTS, levelFromXp, type XpRewardMeta } from '@qubedu/shared';
import { create } from 'zustand';
import { currentT, errorMessage } from './i18n';
import { useSession } from './session';

export type ToastKind = 'ok' | 'err' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the dialog shows an input and resolves with its value. */
  input?: { label: string; defaultValue?: string; type?: string; placeholder?: string };
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (value: string | boolean | null) => void;
}

export interface Reward {
  id: number;
  xp: number;
  levelUp: number | null;
  achievements: string[];
}

export interface FlashcardContext {
  deck?: string;
  courseId?: string | null;
}

interface UiState {
  toasts: Toast[];
  confirm: PendingConfirm | null;
  rewards: Reward[];
  paletteOpen: boolean;
  notificationsOpen: boolean;
  pomodoroOpen: boolean;
  flashcards: FlashcardContext | null;
  onboardingOpen: boolean;
  zen: boolean;
  navOpen: boolean;
  report: { targetType: string; targetId: string } | null;
  /** Conversation currently open in the chat page (its messages do not count as unread). */
  activeConversationId: string | null;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

export const useUi = create<UiState>((set) => ({
  toasts: [],
  confirm: null,
  rewards: [],
  paletteOpen: false,
  notificationsOpen: false,
  pomodoroOpen: false,
  flashcards: null,
  onboardingOpen: false,
  zen: false,
  navOpen: false,
  report: null,
  activeConversationId: null,
  set: (patch) => set(patch),
}));

let seq = 1;

export function toast(text: string, kind: ToastKind = 'ok', ms = 3500) {
  const id = seq++;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
}

export function toastError(err: unknown) {
  toast(errorMessage(err), 'err', 5000);
}

export function confirmDialog(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirm: { ...req, resolve: (v) => resolve(v === true) } }));
}

export function promptDialog(req: ConfirmRequest & { input: NonNullable<ConfirmRequest['input']> }): Promise<string | null> {
  return new Promise((resolve) => useUi.setState({ confirm: { ...req, resolve: (v) => resolve(typeof v === 'string' ? v : null) } }));
}

/** Shows XP / level / achievement feedback from any API response that carries it and keeps the profile in sync. */
export function celebrate(meta: Partial<XpRewardMeta> & { newAchievements?: string[] }) {
  const xp = meta.xpEarned ?? 0;
  const achievements = (meta.newAchievements ?? []).filter((a) => ACHIEVEMENTS.some((d) => d.id === a));
  const session = useSession.getState();
  if (session.me && typeof meta.xpAfter === 'number') {
    session.patchMe({ xp: meta.xpAfter, level: meta.levelAfter ?? levelFromXp(meta.xpAfter) });
  }
  if (session.me && achievements.length) {
    const now = Date.now();
    const have = new Set(session.me.achievements.map((a) => a.id));
    session.patchMe({ achievements: [...session.me.achievements, ...achievements.filter((a) => !have.has(a)).map((id) => ({ id, unlockedAt: now }))] });
  }
  if (!xp && !achievements.length && !meta.levelUp) return;
  const id = seq++;
  const reward: Reward = { id, xp, levelUp: meta.levelUp ? (meta.levelAfter ?? null) : null, achievements };
  useUi.setState((s) => ({ rewards: [...s.rewards, reward] }));
  setTimeout(() => useUi.setState((s) => ({ rewards: s.rewards.filter((r) => r.id !== id) })), 4200);
}

export function achievementName(id: string): string {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return id;
  const items = currentT().dict.achievements.items as unknown as Record<string, readonly [string, string]>;
  return items[def.key]?.[0] ?? id;
}
