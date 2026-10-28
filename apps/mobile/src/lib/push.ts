import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { api } from './api';
import { appPath } from './links';
import { currentT } from './i18n';
import { useSession } from './session';

export type PhonePushState = 'unsupported' | 'denied' | 'off' | 'on';

let currentToken: string | null = null;

// While the app is open, new notifications still show as a banner (the realtime badge updates too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: currentT().t('settings.push.title'),
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#6c5ce7',
  });
}

export async function phonePushState(): Promise<PhonePushState> {
  if (!Device.isDevice || !projectId()) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'denied') return 'denied';
  return status === 'granted' && currentToken ? 'on' : 'off';
}

/**
 * Registers this phone for the signed-in account. `ask` shows the system permission prompt;
 * without it, only refreshes a permission the person already gave.
 */
export async function registerPhonePush(ask: boolean): Promise<PhonePushState> {
  try {
    // Push tokens need a real device and the EAS project id (set by `eas init` / `eas build`).
    if (!Device.isDevice || !projectId()) return 'unsupported';
    await ensureChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return status === 'denied' ? 'denied' : 'off';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await api.me.registerPush({ kind: 'expo', token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    currentToken = token;
    return 'on';
  } catch {
    return ask ? 'unsupported' : 'off';
  }
}

const ASKED_KEY = 'qubedu.push.asked';

/** After sign-in: asks for permission once per install, then keeps the token registered to whoever is signed in. */
export async function onSignedInPush() {
  const { getItemAsync, setItemAsync } = await import('expo-secure-store');
  const asked = await getItemAsync(ASKED_KEY).catch(() => null);
  if (!asked) await setItemAsync(ASKED_KEY, '1').catch(() => undefined);
  await registerPhonePush(!asked);
}

/** Stops this phone from receiving the current account's notifications (call before signing out). */
export async function unregisterPhonePush() {
  const token = currentToken;
  currentToken = null;
  if (token) await api.me.unregisterPush(token).catch(() => undefined);
}

function openFromNotification(response: Notifications.NotificationResponse | null) {
  const link = (response?.notification.request.content.data as { link?: string } | undefined)?.link;
  if (!link || useSession.getState().status !== 'authed') return;
  const path = appPath(link);
  router.push((path ?? `/web?path=${encodeURIComponent(link)}`) as never);
}

let wired = false;
/** Opens the right screen when a notification is tapped (including the one that launched the app). */
export function wirePushTaps() {
  if (wired) return;
  wired = true;
  Notifications.addNotificationResponseReceivedListener(openFromNotification);
  // The app may still be mounting its screens when it was launched from a notification.
  void Notifications.getLastNotificationResponseAsync().then((r) => setTimeout(() => openFromNotification(r), 600));
}
