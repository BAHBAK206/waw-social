import type { Kv } from './kv';

export const REALTIME_CHANNEL = 'qubedu:rt';

export interface RealtimeEvent {
  channels: string[];
  event: string;
  data: unknown;
  /** Optional: do not deliver to this user (e.g. the sender's own echo). */
  exceptUser?: string;
}

export interface Realtime {
  publish(channels: string | string[], event: string, data: unknown, exceptUser?: string): Promise<void>;
}

export const ch = {
  user: (id: string) => `user:${id}`,
  conv: (id: string) => `conv:${id}`,
  group: (id: string) => `group:${id}`,
  live: (id: string) => `live:${id}`,
  course: (id: string) => `course:${id}`,
  site: () => 'site',
};

export interface RealtimeOptions {
  /** Hub base URL for direct HTTP delivery; only used when the Kv is in-memory (no Redis to fan out through). */
  hubUrl?: string;
  internalToken?: string;
  fetch?: typeof fetch;
}

export function createRealtime(kv: Kv, onError: (err: unknown) => void, options: RealtimeOptions = {}): Realtime {
  const direct = kv.kind === 'memory' && options.hubUrl ? options.hubUrl.replace(/\/$/, '') + '/internal/publish' : null;
  const doFetch = options.fetch ?? fetch;
  return {
    async publish(channels, event, data, exceptUser) {
      const payload: RealtimeEvent = { channels: Array.isArray(channels) ? channels : [channels], event, data, exceptUser };
      const body = JSON.stringify(payload);
      try {
        await kv.publish(REALTIME_CHANNEL, body);
        if (direct) {
          const res = await doFetch(direct, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-internal-token': options.internalToken ?? '' },
            body,
            signal: AbortSignal.timeout(2000),
          });
          if (!res.ok) throw new Error(`hub publish failed: ${res.status}`);
        }
      } catch (err) {
        onError(err);
      }
    },
  };
}
