/**
 * School stages from first year of primary to university, and the age groups that decide which protections apply.
 * p = primary (ابتدائي), m = middle / preparatory (إعدادي), s = secondary (ثانوي).
 */
export type GradeLevel = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'm1' | 'm2' | 'm3' | 's1' | 's2' | 's3' | 'uni' | 'adult';
export const GRADE_LEVELS: readonly GradeLevel[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 's1', 's2', 's3', 'uni', 'adult'];

export type Stage = 'primary' | 'middle' | 'secondary' | 'university' | 'adult';
export const STAGES: Record<Stage, readonly GradeLevel[]> = {
  primary: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  middle: ['m1', 'm2', 'm3'],
  secondary: ['s1', 's2', 's3'],
  university: ['uni'],
  adult: ['adult'],
};

export const stageOf = (g: GradeLevel): Stage => (Object.keys(STAGES) as Stage[]).find((s) => STAGES[s].includes(g))!;

/** Usual age at the start of the year (used only when the birth year is unknown). */
export const TYPICAL_AGE: Record<GradeLevel, number | null> = {
  p1: 6,
  p2: 7,
  p3: 8,
  p4: 9,
  p5: 10,
  p6: 11,
  m1: 12,
  m2: 13,
  m3: 14,
  s1: 15,
  s2: 16,
  s3: 17,
  uni: 18,
  adult: null,
};

export const CHILD_AGE = 13;
export const ADULT_AGE = 18;

/** child: under 13 · teen: 13–17 · adult. */
export type AgeTier = 'child' | 'teen' | 'adult';

export function ageTier(input: { birthYear?: number | null; gradeLevel?: string | null; accountType?: string | null }, now = new Date()): AgeTier {
  const ages: number[] = [];
  if (typeof input.birthYear === 'number') ages.push(now.getUTCFullYear() - input.birthYear);
  // A school year says nothing about teachers' and parents' own age; their birth year still counts.
  const student = input.accountType !== 'teacher' && input.accountType !== 'parent';
  const typical = student && input.gradeLevel && input.gradeLevel in TYPICAL_AGE ? TYPICAL_AGE[input.gradeLevel as GradeLevel] : null;
  if (typical !== null) ages.push(typical);
  // Unknown age counts as adult (both are asked at sign-up and in settings); when both are known the younger wins.
  if (!ages.length) return 'adult';
  const age = Math.min(...ages);
  return age < CHILD_AGE ? 'child' : age < ADULT_AGE ? 'teen' : 'adult';
}

/** What a linked parent can turn on or off for a student under 18. */
export interface ParentalControls {
  /** Who can message them: only their classes (classmates, teachers) or also people they already know (follows, groups). */
  messages: 'classes' | 'known';
  /** Posting publicly in the study hall, stories and lessons (posting in their classes and groups is always allowed). */
  publicPosts: boolean;
  /** Joining study groups and communities by themselves. */
  joinGroups: boolean;
  /** The AI tutor and study assistant. */
  ai: boolean;
}

export const PARENTAL_CONTROL_KEYS = ['messages', 'publicPosts', 'joinGroups', 'ai'] as const;

const OPEN: ParentalControls = { messages: 'known', publicPosts: true, joinGroups: true, ai: true };

/** Under 13: classes only until a parent decides otherwise. 13–17: open, a parent can tighten. */
export function defaultControls(tier: AgeTier): ParentalControls {
  if (tier === 'child') return { messages: 'classes', publicPosts: false, joinGroups: false, ai: true };
  return { ...OPEN };
}

export function effectiveControls(tier: AgeTier, stored: Partial<ParentalControls> | null | undefined): ParentalControls {
  if (tier === 'adult') return { ...OPEN };
  const d = defaultControls(tier);
  const s = stored ?? {};
  return {
    messages: s.messages === 'classes' || s.messages === 'known' ? s.messages : d.messages,
    publicPosts: typeof s.publicPosts === 'boolean' ? s.publicPosts : d.publicPosts,
    joinGroups: typeof s.joinGroups === 'boolean' ? s.joinGroups : d.joinGroups,
    ai: typeof s.ai === 'boolean' ? s.ai : d.ai,
  };
}
