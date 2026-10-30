/** Realtime channel names (mirror services/api/src/lib/realtime.ts). */
export const ch = {
  user: (id: string) => `user:${id}`,
  conv: (id: string) => `conv:${id}`,
  group: (id: string) => `group:${id}`,
  live: (id: string) => `live:${id}`,
  course: (id: string) => `course:${id}`,
  site: () => 'site',
};
