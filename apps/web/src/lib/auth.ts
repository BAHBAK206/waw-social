import type { Me } from '@qubedu/shared';
import { api, realtime } from './api';
import { forgetBrowserPush, refreshBrowserPush } from './push';
import { queryClient } from './query';
import { useSession } from './session';
import { celebrate, useUi } from './ui';

/** Runs after login, registration or session restore. */
export async function afterSignIn(me: Me) {
  realtime.connect();
  try {
    const res = await api.me.checkin();
    if (res.changed) useSession.getState().patchMe({ streak: res.streak });
    if (res.newAchievements.length) celebrate({ newAchievements: res.newAchievements });
  } catch {
    /* non-critical */
  }
  if (!me.onboardingDone) useUi.getState().set({ onboardingOpen: true });
  void refreshBrowserPush();
}

export async function signOut(everywhere = false) {
  await forgetBrowserPush();
  try {
    if (everywhere) await api.auth.logoutAll();
    else await api.auth.logout();
  } finally {
    realtime.disconnect();
    queryClient.clear();
    useSession.getState().setMe(null);
  }
}

/** Keeps the realtime connection's token fresh; access tokens live 15 minutes. */
export function startTokenKeepAlive() {
  const id = setInterval(
    () => {
      if (useSession.getState().status === 'authed') void api.http.refresh().then(() => realtime.reauth());
    },
    10 * 60 * 1000,
  );
  return () => clearInterval(id);
}
