import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Me, PublicConfigDto } from '@qubedu/shared';
import { AppState } from 'react-native';
import { create } from 'zustand';

/** Whether the last request to our server failed for lack of a connection. */
export const useNetwork = create<{ offline: boolean }>(() => ({ offline: false }));

const listeners = new Set<() => void>();
/** Runs `fn` each time the connection comes back. Returns an unsubscribe function. */
export function onReconnect(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let probe: ReturnType<typeof setInterval> | null = null;
let probeUrl = '';

export function markOnline() {
  if (!useNetwork.getState().offline) return;
  useNetwork.setState({ offline: false });
  if (probe) clearInterval(probe);
  probe = null;
  for (const fn of listeners) fn();
}

export function markOffline() {
  if (useNetwork.getState().offline) return;
  useNetwork.setState({ offline: true });
  // Check now and then (and whenever the app comes back to the foreground) until the server answers.
  if (!probe && probeUrl) probe = setInterval(() => void checkConnection(), 20_000);
}

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(probeUrl, { method: 'GET' });
    if (res.ok) markOnline();
    return res.ok;
  } catch {
    return false;
  }
}

/** A fetch that keeps `useNetwork` up to date: any answer from the server means online, a thrown error means offline. */
export function trackingFetch(baseUrl: string): typeof fetch {
  probeUrl = `${baseUrl.replace(/\/$/, '')}/health`;
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && useNetwork.getState().offline) void checkConnection();
  });
  return async (input, init) => {
    try {
      const res = await fetch(input, init);
      markOnline();
      return res;
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') markOffline();
      throw err;
    }
  };
}

/* The last known profile and site settings, so the app opens without a connection. */
const ME_KEY = 'qubedu.cache.me';
const CONFIG_KEY = 'qubedu.cache.config';

export async function cacheMe(me: Me | null) {
  try {
    if (me) await AsyncStorage.setItem(ME_KEY, JSON.stringify(me));
    else await AsyncStorage.removeItem(ME_KEY);
  } catch {
    /* storage full or unavailable: the cache is optional */
  }
}

export async function cachedMe(): Promise<Me | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

export async function cacheConfig(config: PublicConfigDto) {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config)).catch(() => undefined);
}

export async function cachedConfig(): Promise<PublicConfigDto | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as PublicConfigDto) : null;
  } catch {
    return null;
  }
}
