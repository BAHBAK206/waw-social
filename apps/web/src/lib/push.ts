import { api } from './api';

export type BrowserPushState = 'unsupported' | 'denied' | 'off' | 'on';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  // The worker is only registered in production builds; give it a moment on first load.
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  return reg ?? null;
}

export async function browserPushState(): Promise<BrowserPushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Asks the browser for permission and registers this browser for notifications. */
export async function enableBrowserPush(): Promise<BrowserPushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const { enabled, vapidPublicKey } = await api.me.pushKey();
  if (!enabled || !vapidPublicKey) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
  if (!json.keys) return 'off';
  await api.me.registerPush({ kind: 'web', token: json.endpoint, keys: json.keys });
  return 'on';
}

export async function disableBrowserPush(): Promise<BrowserPushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.me.unregisterPush(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return supported() ? 'off' : 'unsupported';
}

/** After sign-in: if this browser already allowed notifications, make sure the server knows it belongs to this account. */
export async function refreshBrowserPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    const json = sub?.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } } | undefined;
    if (json?.keys) await api.me.registerPush({ kind: 'web', token: json.endpoint, keys: json.keys });
  } catch {
    /* best effort */
  }
}

/** Before signing out: this browser stops receiving this account's notifications (it keeps its permission). */
export async function forgetBrowserPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api.me.unregisterPush(sub.endpoint);
  } catch {
    /* best effort */
  }
}
