import type { FeatureId } from './features';

/**
 * Help guides shown in the help center, on each page's help button, and fed to
 * the local assistant. Text lives in @qubedu/i18n (GUIDES); this is the shape.
 * `detailed` guides cover the complex features with tips and per-role notes.
 */
export interface GuideMeta {
  id: GuideId;
  /** The page the guide explains (for the "open" link and the per-page help button). */
  feature: FeatureId;
  detailed: boolean;
}

export const GUIDE_LIST = [
  { id: 'school', feature: 'school', detailed: true },
  { id: 'grades', feature: 'grades', detailed: true },
  { id: 'family', feature: 'family', detailed: true },
  { id: 'safety', feature: 'settings', detailed: true },
  { id: 'verification', feature: 'settings', detailed: true },
  { id: 'classes', feature: 'classes', detailed: true },
  { id: 'academic', feature: 'academic', detailed: true },
  { id: 'assistant', feature: 'assistant', detailed: true },
  { id: 'quiz', feature: 'quiz', detailed: true },
  { id: 'curriculum', feature: 'curriculum', detailed: true },
  { id: 'schools', feature: 'schools', detailed: true },
  { id: 'banks', feature: 'quiz', detailed: true },
  { id: 'catalog', feature: 'catalog', detailed: true },
  { id: 'tools', feature: 'services', detailed: true },
  { id: 'home', feature: 'home', detailed: false },
  { id: 'feed', feature: 'feed', detailed: false },
  { id: 'watch', feature: 'watch', detailed: false },
  { id: 'shorts', feature: 'shorts', detailed: false },
  { id: 'lab', feature: 'lab', detailed: false },
  { id: 'library', feature: 'library', detailed: false },
  { id: 'events', feature: 'events', detailed: false },
  { id: 'chat', feature: 'chat', detailed: false },
  { id: 'groups', feature: 'groups', detailed: false },
  { id: 'communities', feature: 'communities', detailed: false },
  { id: 'people', feature: 'people', detailed: false },
  { id: 'league', feature: 'league', detailed: false },
  { id: 'saved', feature: 'saved', detailed: false },
  { id: 'review', feature: 'review', detailed: false },
  { id: 'mentors', feature: 'mentors', detailed: false },
  { id: 'study-pack', feature: 'study-pack', detailed: false },
  { id: 'glossary', feature: 'glossary', detailed: false },
  { id: 'organizer', feature: 'organizer', detailed: false },
  { id: 'forms', feature: 'forms', detailed: false },
  { id: 'workspace', feature: 'workspace', detailed: false },
  { id: 'certificates', feature: 'certificates', detailed: false },
  { id: 'studio', feature: 'studio', detailed: false },
  { id: 'settings', feature: 'settings', detailed: false },
] as const satisfies readonly { id: string; feature: FeatureId; detailed: boolean }[];

export type GuideId = (typeof GUIDE_LIST)[number]['id'];
export const GUIDE_IDS: readonly GuideId[] = GUIDE_LIST.map((g) => g.id);

/** The guide for a page, if there is one (used by the per-page help button). */
export function guideForFeature(feature: FeatureId | null | undefined): GuideId | null {
  if (!feature) return null;
  if (feature === 'exams') return 'academic';
  if (feature === 'ai') return 'assistant';
  if (feature === 'leaderboard') return 'league';
  if (feature === 'timetable' || feature === 'calculator') return 'tools';
  const g = GUIDE_LIST.find((x) => x.feature === feature && x.id === feature) ?? GUIDE_LIST.find((x) => x.feature === feature);
  return g?.id ?? null;
}
