import { addDays } from './dates';

export const MOODS = [1, 2, 3, 4, 5] as const;
export type Mood = (typeof MOODS)[number];

/**
 * Worrying low mood: three days in a row (today and the two before) at 1–2, or four low days in the last seven.
 * Days without a check-in break a streak but never count as low.
 */
export function lowMoodAlert(checks: { day: string; mood: number }[], today: string): boolean {
  const low = new Set(checks.filter((c) => c.mood <= 2).map((c) => c.day));
  if ([0, 1, 2].every((i) => low.has(addDays(today, -i)))) return true;
  return [0, 1, 2, 3, 4, 5, 6].filter((i) => low.has(addDays(today, -i))).length >= 4;
}

/** Minutes left today (never below zero); null when there is no limit. */
export function remainingMinutes(limit: number | null, used: number, bonus: number): number | null {
  if (!limit) return null;
  return Math.max(0, limit + bonus - used);
}

export const TIME_LIMIT_CHOICES = [30, 45, 60, 90, 120, 180] as const;
export const EXTRA_TIME_CHOICES = [15, 30, 60] as const;

export const COMPLAINT_CATEGORIES = ['bullying', 'harassment', 'safety', 'other'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
/** These go to the school's administrators at once as urgent. */
export const URGENT_COMPLAINTS: readonly ComplaintCategory[] = ['safety', 'harassment'];
