import type { Frame } from '@qubedu/api-client';
import { useEffect, useRef } from 'react';
import { realtime } from './api';
import { useSession } from './session';

export function useRealtimeChannel(channel: string | null, handler: (frame: Frame) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const authed = useSession((s) => s.status === 'authed');
  useEffect(() => {
    if (!channel || !authed) return;
    realtime.connect();
    return realtime.subscribe(channel, (f) => ref.current(f));
  }, [channel, authed]);
}

export const channels = {
  user: (id: string) => `user:${id}`,
  conv: (id: string) => `conv:${id}`,
  group: (id: string) => `group:${id}`,
};
