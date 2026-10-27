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

export function createRealtime(kv: Kv, onError: (err: unknown) => void): Realtime {
  return {
    async publish(channels, event, data, exceptUser) {
      const payload: RealtimeEvent = { channels: Array.isArray(channels) ? channels : [channels], event, data, exceptUser };
      try {
        await kv.publish(REALTIME_CHANNEL, JSON.stringify(payload));
      } catch (err) {
        onError(err);
      }
    },
  };
}
