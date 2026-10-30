import type { Me, PublicConfigDto } from '@qubedu/shared';
import { create } from 'zustand';

export type SessionStatus = 'loading' | 'guest' | 'authed';

interface SessionState {
  status: SessionStatus;
  me: Me | null;
  config: PublicConfigDto | null;
  setMe: (me: Me | null) => void;
  patchMe: (patch: Partial<Me>) => void;
  setConfig: (config: PublicConfigDto | null) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  me: null,
  config: null,
  setMe: (me) => set({ me, status: me ? 'authed' : 'guest' }),
  patchMe: (patch) => {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
  setConfig: (config) => set({ config }),
}));
