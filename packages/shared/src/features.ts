/**
 * Registry of product surfaces that the root administrator can control.
 * Modes: enabled · locked (visible, shows message) · hidden (removed from navigation)
 * · page-disabled (discoverable, but entering is blocked even via deep link).
 */
export type FeatureMode = 'enabled' | 'locked' | 'hidden' | 'page-disabled';
export const FEATURE_MODES: readonly FeatureMode[] = ['enabled', 'locked', 'hidden', 'page-disabled'];
export type FeatureKind = 'page' | 'action';
export type FeatureCategory = 'main' | 'classroom' | 'study' | 'ai' | 'community' | 'tools' | 'me' | 'help';
/** Menu order on the web sidebar, the tools hub and the mobile hub. */
export const FEATURE_CATEGORIES: readonly FeatureCategory[] = ['main', 'classroom', 'study', 'ai', 'community', 'tools', 'me', 'help'];

export interface FeatureDef {
  id: string;
  kind: FeatureKind;
  category: FeatureCategory;
  route?: string;
  icon: string;
  /** Requires sign-in to open. */
  auth?: boolean;
}

export const FEATURES = [
  { id: 'home', kind: 'page', category: 'main', route: '/', icon: 'home' },
  { id: 'feed', kind: 'page', category: 'main', route: '/feed', icon: 'newspaper', auth: true },
  { id: 'explore', kind: 'page', category: 'community', route: '/explore', icon: 'compass', auth: true },
  { id: 'events', kind: 'page', category: 'study', route: '/events', icon: 'calendar-days', auth: true },
  { id: 'studio', kind: 'page', category: 'me', route: '/studio', icon: 'chart-column', auth: true },
  { id: 'quiz', kind: 'page', category: 'study', route: '/quiz', icon: 'list-checks' },
  { id: 'watch', kind: 'page', category: 'study', route: '/watch', icon: 'clapperboard' },
  { id: 'shorts', kind: 'page', category: 'study', route: '/shorts', icon: 'film' },
  { id: 'lab', kind: 'page', category: 'study', route: '/lab', icon: 'audio-lines', auth: true },
  { id: 'ai', kind: 'page', category: 'ai', route: '/ai', icon: 'sparkles', auth: true },
  { id: 'assistant', kind: 'page', category: 'ai', route: '/assistant', icon: 'bot', auth: true },
  { id: 'forms', kind: 'page', category: 'tools', route: '/forms', icon: 'clipboard-list' },
  { id: 'library', kind: 'page', category: 'study', route: '/library', icon: 'library' },
  { id: 'workspace', kind: 'page', category: 'tools', route: '/workspace', icon: 'file-text', auth: true },
  { id: 'curriculum', kind: 'page', category: 'study', route: '/curriculum', icon: 'map', auth: true },
  { id: 'academic', kind: 'page', category: 'study', route: '/academic', icon: 'graduation-cap', auth: true },
  { id: 'review', kind: 'page', category: 'study', route: '/review', icon: 'repeat', auth: true },
  { id: 'study-pack', kind: 'page', category: 'study', route: '/study-pack', icon: 'notebook-pen', auth: true },
  { id: 'glossary', kind: 'page', category: 'study', route: '/glossary', icon: 'book-a', auth: true },
  { id: 'school', kind: 'page', category: 'classroom', route: '/school', icon: 'school', auth: true },
  { id: 'teacher-tools', kind: 'page', category: 'classroom', route: '/teacher-tools', icon: 'clipboard-pen', auth: true },
  { id: 'schools', kind: 'page', category: 'classroom', route: '/schools', icon: 'building', auth: true },
  { id: 'grades', kind: 'page', category: 'classroom', route: '/grades', icon: 'clipboard-check', auth: true },
  { id: 'fees', kind: 'page', category: 'classroom', route: '/fees', icon: 'wallet', auth: true },
  { id: 'catalog', kind: 'page', category: 'classroom', route: '/courses', icon: 'store' },
  { id: 'classes', kind: 'page', category: 'classroom', route: '/classes', icon: 'video', auth: true },
  { id: 'exams', kind: 'page', category: 'study', route: '/academic?tab=exams', icon: 'calendar-clock', auth: true },
  { id: 'people', kind: 'page', category: 'community', route: '/people', icon: 'users', auth: true },
  { id: 'mentors', kind: 'page', category: 'community', route: '/mentors', icon: 'hand-helping', auth: true },
  { id: 'league', kind: 'page', category: 'community', route: '/league', icon: 'medal', auth: true },
  { id: 'leaderboard', kind: 'page', category: 'community', route: '/people?tab=leaderboard', icon: 'trophy', auth: true },
  { id: 'groups', kind: 'page', category: 'community', route: '/groups', icon: 'users-round', auth: true },
  { id: 'communities', kind: 'page', category: 'community', route: '/communities', icon: 'globe', auth: true },
  { id: 'chat', kind: 'page', category: 'community', route: '/chat', icon: 'message-circle', auth: true },
  { id: 'live', kind: 'page', category: 'classroom', route: '/live/:roomId', icon: 'radio', auth: true },
  { id: 'saved', kind: 'page', category: 'me', route: '/saved', icon: 'bookmark', auth: true },
  { id: 'profile', kind: 'page', category: 'me', route: '/profile', icon: 'user', auth: true },
  { id: 'organizer', kind: 'page', category: 'tools', route: '/organizer', icon: 'list-todo', auth: true },
  { id: 'family', kind: 'page', category: 'me', route: '/family', icon: 'heart-handshake', auth: true },
  { id: 'certificates', kind: 'page', category: 'classroom', route: '/certificates', icon: 'award', auth: true },
  { id: 'timetable', kind: 'page', category: 'tools', route: '/timetable', icon: 'calendar-range', auth: true },
  { id: 'calculator', kind: 'page', category: 'tools', route: '/calculator', icon: 'calculator' },
  { id: 'settings', kind: 'page', category: 'tools', route: '/settings', icon: 'settings', auth: true },
  { id: 'services', kind: 'page', category: 'main', route: '/services', icon: 'layout-grid' },
  { id: 'help', kind: 'page', category: 'help', route: '/help', icon: 'life-buoy' },
  { id: 'about', kind: 'page', category: 'help', route: '/about', icon: 'info' },
  { id: 'privacy', kind: 'page', category: 'help', route: '/privacy', icon: 'shield' },
  { id: 'terms', kind: 'page', category: 'help', route: '/terms', icon: 'scroll-text' },
  { id: 'contact', kind: 'page', category: 'help', route: '/contact', icon: 'mail' },
  { id: 'stories', kind: 'action', category: 'community', icon: 'aperture' },
  { id: 'video-upload', kind: 'action', category: 'community', icon: 'upload' },
  { id: 'polls', kind: 'action', category: 'community', icon: 'vote' },
  { id: 'daily-challenge', kind: 'action', category: 'study', icon: 'flame' },
  { id: 'search', kind: 'action', category: 'tools', icon: 'search' },
  { id: 'notifications', kind: 'action', category: 'tools', icon: 'bell' },
  { id: 'pomodoro', kind: 'action', category: 'study', icon: 'timer' },
  { id: 'focus-mode', kind: 'action', category: 'study', icon: 'focus' },
  { id: 'flashcards', kind: 'action', category: 'study', icon: 'layers' },
  { id: 'theme', kind: 'action', category: 'tools', icon: 'palette' },
  { id: 'zen', kind: 'action', category: 'tools', icon: 'moon-star' },
  { id: 'share', kind: 'action', category: 'tools', icon: 'share-2' },
  { id: 'live-camera', kind: 'action', category: 'classroom', icon: 'camera' },
  { id: 'live-microphone', kind: 'action', category: 'classroom', icon: 'mic' },
  { id: 'live-screen-share', kind: 'action', category: 'classroom', icon: 'monitor-up' },
  { id: 'live-whiteboard', kind: 'action', category: 'classroom', icon: 'pen-tool' },
  { id: 'live-record', kind: 'action', category: 'classroom', icon: 'circle-dot' },
  { id: 'live-chat', kind: 'action', category: 'classroom', icon: 'messages-square' },
  { id: 'live-hand', kind: 'action', category: 'classroom', icon: 'hand' },
  { id: 'workspace-import', kind: 'action', category: 'tools', icon: 'upload' },
  { id: 'workspace-export', kind: 'action', category: 'tools', icon: 'download' },
] as const satisfies readonly FeatureDef[];

export type FeatureId = (typeof FEATURES)[number]['id'];
export const FEATURE_IDS: readonly FeatureId[] = FEATURES.map((f) => f.id);
const FEATURE_ID_SET = new Set<string>(FEATURE_IDS);

export interface FeatureControl {
  mode: FeatureMode;
  message: string;
}
export type FeatureControlMap = Partial<Record<FeatureId, FeatureControl>>;

export function isFeatureId(id: string): id is FeatureId {
  return FEATURE_ID_SET.has(id);
}

/** Keeps only known ids and valid modes; trims messages. Used on both client and server. */
export function normalizeFeatureControls(value: unknown): FeatureControlMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: FeatureControlMap = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isFeatureId(id) || !raw || typeof raw !== 'object') continue;
    const mode = (raw as { mode?: unknown }).mode;
    if (typeof mode !== 'string' || !FEATURE_MODES.includes(mode as FeatureMode)) continue;
    const message = (raw as { message?: unknown }).message;
    out[id] = { mode: mode as FeatureMode, message: typeof message === 'string' ? message.trim().slice(0, 420) : '' };
  }
  return out;
}

export function featureMode(map: FeatureControlMap, id: FeatureId): FeatureMode {
  return map[id]?.mode ?? 'enabled';
}

/**
 * Every feature that governs a location, most specific first. Child tabs and
 * nested routes inherit their parent page so deep links cannot bypass a block.
 */
export function featureIdsForLocation(pathname: string, search = ''): FeatureId[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const ids: FeatureId[] = [];
  if (path === '/academic' && params.get('tab') === 'exams') ids.push('exams');
  if (path === '/people' && params.get('tab') === 'leaderboard') ids.push('leaderboard');
  if (/^\/live\/[^/]+$/.test(path)) ids.push('live', 'classes');
  const pages = FEATURES.filter(
    (f): f is Extract<(typeof FEATURES)[number], { route: string }> => f.kind === 'page' && 'route' in f && !f.route.includes(':') && !f.route.includes('?'),
  ).sort((a, b) => b.route.length - a.route.length);
  const parent = pages.find((f) => f.route === path || (f.route !== '/' && path.startsWith(`${f.route}/`)));
  if (parent && !ids.includes(parent.id)) ids.push(parent.id);
  return ids;
}

export function firstBlockedFeature(ids: readonly FeatureId[], map: FeatureControlMap): FeatureId | null {
  return ids.find((id) => featureMode(map, id) !== 'enabled') ?? null;
}
