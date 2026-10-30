/**
 * Study tools that work offline on the device: the grade calculator ("what do I need on the final?")
 * and the weekly timetable helpers.
 */
import { ratingOf, round1, type GradeRating } from './gradebook';

export interface CalcPart {
  name: string;
  /** Marks this part is out of. */
  max: number;
  /** Marks earned so far, or null when the part is still to come (e.g. the final exam). */
  earned: number | null;
}

export interface CalcResult {
  /** Earned on the parts that have a mark. */
  earned: number;
  /** Out of the parts that have a mark. */
  gradedMax: number;
  /** Full total (all parts). */
  total: number;
  /** Percentage on graded parts so far (null before any mark). */
  percentSoFar: number | null;
  ratingSoFar: GradeRating | null;
  /** Marks still available on the parts without a mark. */
  remaining: number;
  /** Marks needed on the remaining parts to reach the pass mark; 0 = already safe; null = impossible. */
  neededToPass: number | null;
  /** Same for the target (when one is set). */
  neededForTarget: number | null;
  /** Best and worst final result if the remaining parts go perfectly or get zero. */
  best: number;
  worst: number;
}

/** Totals the parts and works out what is still needed on the parts that have no mark yet. */
export function calculateGrade(parts: CalcPart[], opts: { passMarks: number; target?: number | null }): CalcResult {
  const clean = parts.filter((p) => p.max > 0);
  const total = round1(clean.reduce((n, p) => n + p.max, 0));
  const graded = clean.filter((p) => p.earned !== null);
  const earned = round1(graded.reduce((n, p) => n + Math.min(p.max, Math.max(0, p.earned!)), 0));
  const gradedMax = round1(graded.reduce((n, p) => n + p.max, 0));
  const remaining = round1(total - gradedMax);
  const need = (goal: number) => {
    const n = round1(goal - earned);
    if (n <= 0) return 0;
    return n > remaining ? null : n;
  };
  const percentSoFar = gradedMax > 0 ? round1((earned / gradedMax) * 100) : null;
  const passPercent = total > 0 ? (opts.passMarks / total) * 100 : 50;
  return {
    earned,
    gradedMax,
    total,
    percentSoFar,
    ratingSoFar: percentSoFar === null ? null : ratingOf(percentSoFar, passPercent),
    remaining,
    neededToPass: need(opts.passMarks),
    neededForTarget: opts.target == null ? null : need(opts.target),
    best: round1(earned + remaining),
    worst: earned,
  };
}

/** 0 = Sunday … 6 = Saturday (same as Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimetableSlot {
  day: Weekday;
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Slots sorted by day then start time; the week starts on `firstDay` (Saturday in much of the Arab world). */
export function sortSlots<T extends TimetableSlot>(slots: T[], firstDay: Weekday = 6): T[] {
  const order = (d: number) => (d - firstDay + 7) % 7;
  return [...slots].sort((a, b) => order(a.day) - order(b.day) || minutes(a.start) - minutes(b.start));
}

/** Today's slots in order, plus which one is happening now and which is next. */
export function todaySlots<T extends TimetableSlot>(slots: T[], now: Date): { items: T[]; current: T | null; next: T | null } {
  const day = now.getDay() as Weekday;
  const t = now.getHours() * 60 + now.getMinutes();
  const items = slots.filter((s) => s.day === day).sort((a, b) => minutes(a.start) - minutes(b.start));
  const current = items.find((s) => minutes(s.start) <= t && t < minutes(s.end)) ?? null;
  const next = items.find((s) => minutes(s.start) > t) ?? null;
  return { items, current, next };
}

/** Two slots on the same day overlap. */
export function overlaps(a: TimetableSlot, b: TimetableSlot): boolean {
  return a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}
