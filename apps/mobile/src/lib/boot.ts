import { api, hasSavedSession, realtime } from './api';
import { cacheConfig, cachedConfig, cachedMe, onReconnect, useNetwork } from './network';
import { flushOutbox, startOutbox } from './outbox';
import { onAppearanceChange, syncDirection, useAppearance } from './appearance';
import { wirePushTaps } from './push';
import { queryClient } from './query';
import { useSession } from './session';
import { channels } from './useRealtime';

let started = false;
let pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

async function loadConfig(attempt = 0): Promise<void> {
  try {
    const config = await api.config();
    useSession.getState().setConfig(config);
    void cacheConfig(config);
  } catch {
    if (!useSession.getState().config) {
      const saved = await cachedConfig();
      if (saved) useSession.getState().setConfig(saved);
    }
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
  // No connection at launch: open with the last known profile instead of the sign-in screen,
  // and finish signing in when the connection returns.
  let offlineSession = false;
  if (!me && useNetwork.getState().offline && (await hasSavedSession())) {
    me = await cachedMe();
    offlineSession = !!me;
  }
  useSession.getState().setMe(me);
  onReconnect(() => {
    void (async () => {
      if (offlineSession) {
        offlineSession = false;
        const fresh = await api.auth.restore().catch(() => null);
        if (!fresh) {
          // Still unreachable: try again on the next reconnect. A revoked sign-in has already signed the app out.
          if (useNetwork.getState().offline) offlineSession = true;
          return;
        }
      }
      if (!useSession.getState().config) void loadConfig();
      await flushOutbox();
      void queryClient.invalidateQueries();
    })();
  });
  startOutbox();
  if (me) {
    useAppearance.getState().replace(me.appearance);
    syncDirection(me.appearance.language);
    if (!offlineSession) realtime.connect();
  }
  wirePushTaps();
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
