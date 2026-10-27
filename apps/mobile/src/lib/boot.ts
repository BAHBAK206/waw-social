import { api, realtime } from './api';
import { onAppearanceChange, syncDirection, useAppearance } from './appearance';
import { queryClient } from './query';
import { useSession } from './session';
import { channels } from './useRealtime';

let started = false;
let pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

async function loadConfig(attempt = 0): Promise<void> {
  try {
    useSession.getState().setConfig(await api.config());
  } catch {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return loadConfig(attempt + 1);
    }
  }
}

/** Restores the session, loads site config and wires realtime events to caches. Safe to call once. */
export async function boot() {
  if (started) return;
  started = true;
  const config = loadConfig();
  let me = null;
  try {
    me = await api.auth.restore();
  } catch {
    me = null;
  }
  useSession.getState().setMe(me);
  if (me) {
    useAppearance.getState().replace(me.appearance);
    syncDirection(me.appearance.language);
    realtime.connect();
  }
  await config;

  onAppearanceChange((patch) => {
    if (useSession.getState().status !== 'authed') return;
    pending = { ...pending, ...patch };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const appearance = pending;
      pending = {};
      void api.me.prefs({ appearance }).catch(() => undefined);
    }, 600);
  });

  realtime.onAny((frame) => {
    if (frame.type !== 'event') return;
    const s = useSession.getState();
    if (frame.event === 'notification') {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (s.me) s.patchMe({ unreadNotifications: s.me.unreadNotifications + 1 });
    } else if (frame.event === 'conversation:updated') {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
}

export { channels };
