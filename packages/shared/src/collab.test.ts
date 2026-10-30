import { describe, expect, it } from 'vitest';
import { canMentor, rankClasses, weekStartOf } from './collab';

describe('collab', () => {
  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-10-28')).toBe('2026-10-26'); // Wednesday
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week before
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });
  it('ranks classes by average per student, sharing ranks on ties', () => {
    const r = rankClasses([
      { courseId: 'a', title: 'A', students: 10, minutes: 500 },
      { courseId: 'b', title: 'B', students: 2, minutes: 120 },
      { courseId: 'c', title: 'C', students: 4, minutes: 200 },
      { courseId: 'd', title: 'D', students: 0, minutes: 0 },
    ]);
    expect(r.map((x) => [x.courseId, x.rank, x.average])).toEqual([
      ['b', 1, 60],
      ['a', 2, 50],
      ['c', 2, 50],
      ['d', 4, 0],
    ]);
  });
  it('lets only seniors and teachers mentor', () => {
    expect(canMentor('s3', 'student')).toBe(true);
    expect(canMentor('uni', 'student')).toBe(true);
    expect(canMentor('m2', 'student')).toBe(false);
    expect(canMentor(null, 'student')).toBe(false);
    expect(canMentor(null, 'teacher')).toBe(true);
  });
});
