/**
 * Subject grading: each class is one subject with a code (e.g. MATH-3), a total ("out of 60", "out of 80", 100…),
 * a pass mark, and components that share the total (homework 10, monthly tests 20, final exam 30…).
 */

export type ComponentSource = 'assignments' | 'manual' | 'attendance';
export const COMPONENT_SOURCES: readonly ComponentSource[] = ['assignments', 'manual', 'attendance'];

export type GradeRating = 'excellent' | 'veryGood' | 'good' | 'pass' | 'fail';

export interface ComponentScore {
  /** Marks this component is out of. */
  max: number;
  /** Marks earned, or null when nothing is graded yet. */
  earned: number | null;
}

export interface SubjectResult {
  /** Marks earned out of `max` (only components with a score count toward `earned`). */
  score: number;
  max: number;
  /** Marks of the components that have a score (what the percentage is based on so far). */
  gradedMax: number;
  /** Percentage of graded work, 0–100, or null when nothing is graded. */
  percent: number | null;
  /** Projected pass/fail on graded work so far; null when nothing is graded. */
  passed: boolean | null;
  rating: GradeRating | null;
  /** All components graded. */
  complete: boolean;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rating bands used by most Arabic school systems (ممتاز / جيد جدًا / جيد / مقبول / ضعيف). */
export function ratingOf(percent: number, passPercent = 50): GradeRating {
  if (percent < passPercent) return 'fail';
  if (percent >= 85) return 'excellent';
  if (percent >= 75) return 'veryGood';
  if (percent >= 65) return 'good';
  return 'pass';
}

/**
 * Totals one subject. Ungraded components are left out of the percentage (so a student's standing is fair mid-term),
 * but `max` stays the full subject total.
 */
export function subjectResult(input: { maxMarks: number; passMarks: number; components: ComponentScore[] }): SubjectResult {
  const graded = input.components.filter((c) => c.earned !== null && c.max > 0);
  const score = round1(graded.reduce((n, c) => n + Math.min(c.max, Math.max(0, c.earned!)), 0));
  const gradedMax = round1(graded.reduce((n, c) => n + c.max, 0));
  const passPercent = input.maxMarks > 0 ? (input.passMarks / input.maxMarks) * 100 : 50;
  const percent = gradedMax > 0 ? round1((score / gradedMax) * 100) : null;
  return {
    score,
    max: input.maxMarks,
    gradedMax,
    percent,
    passed: percent === null ? null : percent >= passPercent,
    rating: percent === null ? null : ratingOf(percent, passPercent),
    complete: input.components.length > 0 && graded.length === input.components.length,
  };
}

/** A component fed by assignments: earned/possible scaled to the component's marks. */
export function scaleTo(max: number, earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  return round1((Math.max(0, earned) / possible) * max);
}

/** Overall result across subjects that count in the total (e.g. religion often doesn't). */
export function overallResult(subjects: { result: SubjectResult; countsInTotal: boolean }[]) {
  const counted = subjects.filter((s) => s.countsInTotal && s.result.percent !== null);
  const score = round1(counted.reduce((n, s) => n + s.result.score, 0));
  const max = round1(counted.reduce((n, s) => n + s.result.gradedMax, 0));
  const fullMax = round1(subjects.filter((s) => s.countsInTotal).reduce((n, s) => n + s.result.max, 0));
  const percent = max > 0 ? round1((score / max) * 100) : null;
  return {
    score,
    max,
    fullMax,
    percent,
    rating: percent === null ? null : ratingOf(percent),
    failed: subjects.filter((s) => s.result.passed === false).length,
  };
}

/** Course grading settings shown to everyone in the class. */
export interface CourseGradingDto {
  subjectCode: string | null;
  maxMarks: number;
  passMarks: number;
  countsInTotal: boolean;
  term: string | null;
}

export interface GradeComponentDto {
  id: string;
  name: string;
  maxMarks: number;
  source: ComponentSource;
  position: number;
}
