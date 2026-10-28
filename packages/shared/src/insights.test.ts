import { describe, expect, it } from 'vitest';
import { riskOf, type StudentSignals } from './insights';

const fine: StudentSignals = {
  inactiveDays: 1,
  minutesThisWeek: 120,
  minutesLastWeek: 100,
  missing: 0,
  lateRecent: 0,
  gradeAvg: 82,
  gradePrevAvg: 80,
  absences30: 0,
  quizAvg: 75,
};

describe('riskOf', () => {
  it('leaves a steady student alone', () => {
    expect(riskOf(fine)).toEqual({ level: 'ok', reasons: [] });
  });
  it('flags slipping students with every reason, worst first', () => {
    expect(riskOf({ ...fine, missing: 1, gradeAvg: 60, gradePrevAvg: 80 })).toEqual({
      level: 'watch',
      reasons: ['missingWork', 'lowGrades', 'gradesDropping'],
    });
    const r = riskOf({ ...fine, inactiveDays: 20, missing: 4, minutesThisWeek: 0, minutesLastWeek: 200 });
    expect(r.level).toBe('high');
    expect(r.reasons.slice(0, 2)).toEqual(['inactive', 'missingWork']);
    expect(r.reasons).toContain('studyDrop');
  });
  it('treats a student who never came as inactive', () => {
    expect(riskOf({ ...fine, inactiveDays: null }).level).toBe('high');
  });
});
