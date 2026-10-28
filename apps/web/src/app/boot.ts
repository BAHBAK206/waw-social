import { ch } from './channels';
import { api, realtime, sendOnHide } from '@/lib/api';
import { afterSignIn } from '@/lib/auth';
import { onAppearanceChange } from '@/lib/appearance';
import { queryClient, qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/ui';

async function loadConfig(attempt = 0): Promise<void> {
  try {
    useSession.getState().setConfig(await api.config());
  } catch {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return loadConfig(attempt + 1);
    }
    useSession.getState().setConfig(null, true);
  }
}

let appearanceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAppearance: Record<string, unknown> = {};

/** Sends queued appearance changes now; `keepalive` lets the request outlive a closing tab. */
function flushAppearance(keepalive = false) {
  if (appearanceTimer) clearTimeout(appearanceTimer);
  appearanceTimer = null;
  const appearance = pendingAppearance;
  pendingAppearance = {};
  if (!Object.keys(appearance).length || useSession.getState().status !== 'authed') return;
  if (keepalive) {
    sendOnHide('PATCH', '/me/prefs', { appearance });
  } else {
    void api.me.prefs({ appearance }).catch(() => undefined);
  }
}

/** Loads config + session, wires realtime events to caches and syncs appearance changes to the profile. */
export async function boot() {
  const configP = loadConfig();
  let me = null;
  // Opened from the mobile app with a one-time handoff code: sign in with it and drop it from the URL.
  const handoff = new URLSearchParams(location.search).get('handoff');
  if (handoff) {
    const url = new URL(location.href);
    url.searchParams.delete('handoff');
    history.replaceState(history.state, '', url.toString());
    try {
      me = await api.auth.redeemHandoff(handoff);
    } catch {
      me = null;
    }
  }
  try {
    me ??= await api.auth.restore();
  } catch {
    me = null;
  }
  useSession.getState().setMe(me);
  await configP;
  if (me) void afterSignIn(me);

  onAppearanceChange((patch) => {
    if (useSession.getState().status !== 'authed') return;
    pendingAppearance = { ...pendingAppearance, ...patch };
    if (appearanceTimer) clearTimeout(appearanceTimer);
    appearanceTimer = setTimeout(() => flushAppearance(), 400);
  });
  window.addEventListener('pagehide', () => flushAppearance(true));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAppearance(true));

  realtime.onAny((frame) => {
    if (frame.type !== 'event') return;
    const session = useSession.getState();
    switch (frame.event) {
      case 'notification': {
        void queryClient.invalidateQueries({ queryKey: qk.notifications });
        if (session.me) session.patchMe({ unreadNotifications: session.me.unreadNotifications + 1 });
        break;
      }
      case 'conversation:updated': {
        void queryClient.invalidateQueries({ queryKey: qk.conversations });
        const data = frame.data as { conversationId?: string; senderId?: string } | undefined;
        const viewing = useUi.getState().activeConversationId;
        if (session.me && data?.senderId !== session.me.id && data?.conversationId !== viewing) {
          session.patchMe({ unreadMessages: session.me.unreadMessages + 1 });
        }
        break;
      }
      case 'config:changed':
        if (frame.channel === ch.site()) void loadConfig();
        break;
    }
  });
}
