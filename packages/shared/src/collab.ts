import { addDays } from './dates';
import type { GradeLevel } from './stages';

/** Monday (YYYY-MM-DD) of the week a day falls in: weeks for goals and challenges run Monday to Sunday. */
export function weekStartOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export interface ClassScore {
  courseId: string;
  title: string;
  students: number;
  minutes: number;
}

export interface ClassStanding extends ClassScore {
  rank: number;
  /** Average minutes per student: classes of different sizes compete fairly. */
  average: number;
}

/** Ranks classes by average study minutes per student (empty classes last); ties share a rank. */
export function rankClasses(scores: ClassScore[]): ClassStanding[] {
  const rows = scores
    .map((s) => ({ ...s, average: s.students ? Math.round((s.minutes / s.students) * 10) / 10 : 0 }))
    .sort((a, b) => b.average - a.average || b.minutes - a.minutes || a.title.localeCompare(b.title));
  let rank = 0;
  let last: number | null = null;
  return rows.map((r, i) => {
    if (last === null || r.average !== last) rank = i + 1;
    last = r.average;
    return { ...r, rank };
  });
}

/** Senior students (last two secondary years, university) may offer to help juniors in a subject. */
const MENTOR_LEVELS: readonly GradeLevel[] = ['s2', 's3', 'uni', 'adult'];
export const canMentor = (gradeLevel: string | null | undefined, accountType: string): boolean =>
  accountType === 'teacher' || MENTOR_LEVELS.includes(gradeLevel as GradeLevel);
