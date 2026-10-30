import { createApi, RealtimeClient } from '@qubedu/api-client';
import type { UploadResultDto } from '@qubedu/shared';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useAppearance } from './appearance';
import { cacheMe, trackingFetch } from './network';
import { useSession } from './session';

const REFRESH_KEY = 'qubedu.refresh';

/** Dev builds on a phone reach the API on the same LAN host that serves the bundle. */
function resolveBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const extra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:8787';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host && host !== 'localhost') return `http://${host}:8787`;
  if (__DEV__ && Platform.OS === 'android') return extra.replace('localhost', '10.0.2.2');
  return extra;
}

export const API_URL = resolveBaseUrl();

/** True when this phone holds a sign-in that has not been revoked (it may still need a connection to refresh). */
export async function hasSavedSession() {
  return !!(await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null));
}

export const api = createApi({
  baseUrl: API_URL,
  platform: 'mobile',
  fetchImpl: trackingFetch(API_URL),
  language: () => useAppearance.getState().appearance.language,
  tokenStore: {
    getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
    setRefreshToken: async (token) => {
      if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
      else await SecureStore.deleteItemAsync(REFRESH_KEY);
    },
  },
  onAuthChange: (me) => {
    const wasSignedIn = useSession.getState().status === 'authed';
    useSession.getState().setMe(me);
    void cacheMe(me);
    if (me) realtime.connect();
    else realtime.disconnect();
    // A fresh sign-in (not a token refresh) registers this phone for notifications.
    if (me && !wasSignedIn) void import('./push').then((m) => m.onSignedInPush());
    // Downloads and queued offline actions belong to one person on this phone.
    if (me) void import('./downloads').then((m) => m.keepOnlyFor(me.id));
  },
});

export const realtime = new RealtimeClient({
  url: () => {
    const base = useSession.getState().config?.realtimeUrl;
    if (base) return base;
    return `${API_URL.replace(/^http/, 'ws')}/ws`;
  },
  token: () => api.http.token,
});

/** Absolute URL for files served by the API. */
export function fileUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|file:|data:)/.test(url)) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Multipart upload of a local file (React Native FormData takes `{ uri, name, type }`). Retries once after a token refresh. */
export async function uploadFile(file: PickedFile, purpose: string) {
  const send = async () => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    form.append('purpose', purpose);
    return fetch(api.http.url('/uploads'), {
      method: 'POST',
      headers: { authorization: `Bearer ${api.http.token ?? ''}`, 'x-client': 'mobile', 'x-requested-with': 'qubedu' },
      body: form,
    });
  };
  let res = await send();
  if (res.status === 401 && (await api.http.refresh())) res = await send();
  const body = (await res.json().catch(() => null)) as UploadResultDto & { error?: { code?: string } };
  if (!res.ok) throw new Error(body?.error?.code ?? `upload_${res.status}`);
  return body;
}
