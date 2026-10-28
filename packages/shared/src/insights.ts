/**
 * "Needs help" signals for a student, shared by the teacher's class insights and the parent's weekly view.
 * Each reason is a code the apps translate; the level is the worst of them.
 */
export interface StudentSignals {
  /** Days since the student last opened Qubedu (null = never). */
  inactiveDays: number | null;
  minutesThisWeek: number;
  minutesLastWeek: number;
  /** Published assignments past their due date without a submission. */
  missing: number;
  lateRecent: number;
  /** Average grade in percent of the last graded work (null = none yet). */
  gradeAvg: number | null;
  /** Earlier average, to see a drop (null = not enough history). */
  gradePrevAvg: number | null;
  absences30: number;
  quizAvg: number | null;
}

export type RiskReason = 'inactive' | 'studyDrop' | 'missingWork' | 'lowGrades' | 'gradesDropping' | 'absences' | 'lowQuizzes' | 'oftenLate';
export type RiskLevel = 'ok' | 'watch' | 'high';

export function riskOf(s: StudentSignals): { level: RiskLevel; reasons: RiskReason[] } {
  const high: RiskReason[] = [];
  const watch: RiskReason[] = [];
  if (s.inactiveDays === null || s.inactiveDays >= 14) high.push('inactive');
  else if (s.inactiveDays >= 7) watch.push('inactive');
  if (s.missing >= 3) high.push('missingWork');
  else if (s.missing >= 1) watch.push('missingWork');
  if (s.gradeAvg !== null && s.gradeAvg < 50) high.push('lowGrades');
  else if (s.gradeAvg !== null && s.gradeAvg < 65) watch.push('lowGrades');
  if (s.gradeAvg !== null && s.gradePrevAvg !== null && s.gradePrevAvg - s.gradeAvg >= 15) watch.push('gradesDropping');
  if (s.absences30 >= 4) high.push('absences');
  else if (s.absences30 >= 2) watch.push('absences');
  if (s.minutesLastWeek >= 60 && s.minutesThisWeek < s.minutesLastWeek * 0.4) watch.push('studyDrop');
  if (s.quizAvg !== null && s.quizAvg < 50) watch.push('lowQuizzes');
  if (s.lateRecent >= 3) watch.push('oftenLate');
  return { level: high.length ? 'high' : watch.length ? 'watch' : 'ok', reasons: [...high, ...watch] };
}
