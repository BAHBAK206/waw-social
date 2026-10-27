import type { Status } from '@qubedu/api-client';
import type { Me, PublicConfigDto } from '@qubedu/shared';
import { create } from 'zustand';
import { useAppearance } from './appearance';

export type SessionStatus = 'loading' | 'guest' | 'authed';

interface SessionState {
  status: SessionStatus;
  me: Me | null;
  config: PublicConfigDto | null;
  configError: boolean;
  realtimeStatus: Status;
  setMe: (me: Me | null) => void;
  patchMe: (patch: Partial<Me>) => void;
  setConfig: (config: PublicConfigDto | null, error?: boolean) => void;
  setRealtimeStatus: (s: Status) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  me: null,
  config: null,
  configError: false,
  realtimeStatus: 'idle',
  setMe: (me) => {
    const prev = get().me;
    // The server profile is the source of truth for appearance once signed in.
    if (me && (!prev || prev.id !== me.id)) useAppearance.getState().replace(me.appearance);
    set({ me, status: me ? 'authed' : 'guest' });
  },
  patchMe: (patch) => {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
  setConfig: (config, error = false) => set({ config, configError: error }),
  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),
}));

export const useMe = () => useSession((s) => s.me);
export const useIsAuthed = () => useSession((s) => s.status === 'authed');
