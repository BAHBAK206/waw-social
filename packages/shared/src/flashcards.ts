/** SM-2 style scheduler with four explainable ratings. Runs on the server. */
export type FlashcardRating = 'again' | 'unsure' | 'know' | 'easy';
export const FLASHCARD_RATINGS: readonly FlashcardRating[] = ['again', 'unsure', 'know', 'easy'];

export interface SchedulerState {
  level: number;
  ease: number;
  repetitions: number;
  lapses: number;
  intervalDays: number;
  dueAt: number;
  lastReviewedAt: number | null;
}

export const FLASHCARD_MAX_LEVEL = 5;
export const FLASHCARD_MAX_INTERVAL_DAYS = 365;
export const FLASHCARD_AGAIN_DELAY_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.5;
export const DEFAULT_EASE = 2.5;

const clampInterval = (v: number) => (Number.isFinite(v) ? Math.max(1, Math.min(FLASHCARD_MAX_INTERVAL_DAYS, Math.round(v))) : 1);
const clampEase = (v: number) => (Number.isFinite(v) ? Math.max(MIN_EASE, Math.min(MAX_EASE, v)) : DEFAULT_EASE);

export function initialSchedulerState(now = Date.now()): SchedulerState {
  return { level: 0, ease: DEFAULT_EASE, repetitions: 0, lapses: 0, intervalDays: 0, dueAt: now, lastReviewedAt: null };
}

export function rateCard(state: SchedulerState, rating: FlashcardRating, now = Date.now()): SchedulerState {
  let { level, repetitions, lapses, intervalDays } = state;
  let ease = clampEase(state.ease);
  let dueAt: number;
  if (rating === 'again') {
    level = 0;
    repetitions = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalDays = 0;
    dueAt = now + FLASHCARD_AGAIN_DELAY_MS;
  } else if (rating === 'unsure') {
    ease = Math.max(MIN_EASE, ease - 0.15);
    intervalDays = Math.min(FLASHCARD_MAX_INTERVAL_DAYS, Math.round(Math.max(0.5, (intervalDays || 0.5) * 1.2) * 2) / 2);
    dueAt = now + intervalDays * DAY_MS;
  } else {
    repetitions += 1;
    if (rating === 'easy') {
      ease = Math.min(MAX_EASE, ease + 0.15);
      intervalDays = repetitions === 1 ? 4 : repetitions === 2 ? 7 : clampInterval((intervalDays || 3) * (ease + 0.15));
      level = Math.min(FLASHCARD_MAX_LEVEL, level + 2);
    } else {
      intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : clampInterval((intervalDays || 3) * ease);
      level = Math.min(FLASHCARD_MAX_LEVEL, level + 1);
    }
    intervalDays = clampInterval(intervalDays);
    dueAt = now + intervalDays * DAY_MS;
  }
  return { level, ease: Math.round(ease * 100) / 100, repetitions, lapses, intervalDays, dueAt, lastReviewedAt: now };
}
