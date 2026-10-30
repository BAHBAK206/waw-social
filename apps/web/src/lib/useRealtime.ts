import { useEffect, useRef } from 'react';
import type { Frame } from '@qubedu/api-client';
import { realtime } from './api';
import { useSession } from './session';

/** Subscribes to a realtime channel while mounted (no-op for guests / when channel is null). */
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
