import { FEATURES, type FeatureCategory, type FeatureId } from './features';
import type { AccountType } from './roles';

/**
 * One menu model for the web sidebar, the tools hub and the mobile hub, so every
 * screen sits in the same section everywhere. Items follow this order inside
 * their section (see FEATURES[].category).
 */
export const NAV_ORDER: readonly FeatureId[] = [
  'home',
  'feed',
  'services',
  'school',
  'schools',
  'grades',
  'classes',
  'catalog',
  'certificates',
  'curriculum',
  'academic',
  'exams',
  'quiz',
  'library',
  'watch',
  'shorts',
  'lab',
  'events',
  'assistant',
  'ai',
  'chat',
  'groups',
  'communities',
  'people',
  'explore',
  'league',
  'leaderboard',
  'timetable',
  'calculator',
  'workspace',
  'forms',
  'organizer',
  'settings',
  'profile',
  'family',
  'saved',
  'studio',
  'help',
  'about',
  'privacy',
  'terms',
  'contact',
];

/**
 * Who sees a page in the menus. Pages stay reachable by link (permissions are
 * enforced by the server); this only keeps each account's menu focused.
 */
const AUDIENCE: Partial<Record<FeatureId, readonly AccountType[]>> = {
  grades: ['student', 'parent'],
  certificates: ['student'],
  academic: ['student', 'teacher'],
  exams: ['student'],
  lab: ['student', 'teacher'],
  league: ['student'],
  leaderboard: ['student', 'teacher'],
  studio: ['student', 'teacher'],
  family: ['student', 'parent'],
  catalog: ['student', 'teacher', 'parent'],
};

export function shownTo(id: FeatureId, accountType: AccountType | null | undefined): boolean {
  const who = AUDIENCE[id];
  return !who || !accountType || who.includes(accountType);
}

/** Phone bottom bar (web) per account type. */
export const BOTTOM_NAV_BY_ACCOUNT: Record<AccountType | 'guest', readonly FeatureId[]> = {
  student: ['home', 'school', 'academic', 'chat', 'profile'],
  teacher: ['home', 'school', 'quiz', 'chat', 'profile'],
  parent: ['home', 'family', 'grades', 'chat', 'profile'],
  guest: ['home', 'quiz', 'catalog', 'library', 'help'],
};

export function categoryOf(id: FeatureId): FeatureCategory {
  return FEATURES.find((f) => f.id === id)!.category;
}

/** Feature ids in menu order for one section, filtered for the account. */
export function sectionItems(category: FeatureCategory, accountType: AccountType | null | undefined): FeatureId[] {
  return NAV_ORDER.filter((id) => categoryOf(id) === category && shownTo(id, accountType));
}
