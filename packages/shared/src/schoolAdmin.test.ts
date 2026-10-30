import { describe, expect, it } from 'vitest';
import { addMonths, instalmentSchedule, needsFeeReminder, summarizeSurvey, timetableConflicts } from './schoolAdmin';

describe('instalments', () => {
  it('adds months without overflowing short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('splits a fee so the instalments add up', () => {
    const s = instalmentSchedule(1000_00 + 2, 3, '2026-09-01');
    expect(s.map((x) => x.amountCents)).toEqual([33_334, 33_334, 33_334]);
    expect(s.reduce((n, x) => n + x.amountCents, 0)).toBe(100_002);
    expect(s.map((x) => x.dueDay)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(instalmentSchedule(100, 1, '2026-09-01')).toHaveLength(1);
    expect(instalmentSchedule(100, 99, '2026-09-01')).toHaveLength(12);
  });
  it('reminds about invoices due soon or late, not too often', () => {
    const now = Date.UTC(2026, 8, 10);
    const inv = (dueDay: string, last: number | null, status = 'pending') => ({ status, dueDay, lastRemindedAt: last });
    expect(needsFeeReminder(inv('2026-09-12', null), '2026-09-10', now)).toBe(true);
    expect(needsFeeReminder(inv('2026-09-20', null), '2026-09-10', now)).toBe(false);
    expect(needsFeeReminder(inv('2026-09-01', now - 86_400_000), '2026-09-10', now)).toBe(false);
    expect(needsFeeReminder(inv('2026-09-01', now - 4 * 86_400_000), '2026-09-10', now)).toBe(true);
    expect(needsFeeReminder(inv('2026-09-01', null, 'paid'), '2026-09-10', now)).toBe(false);
  });
});

describe('timetable conflicts', () => {
  const row = (id: string, over: Partial<Parameters<typeof timetableConflicts>[0][number]>) => ({
    id,
    courseId: id,
    section: '5A',
    teacherId: `t-${id}`,
    room: `R${id}`,
    day: 1,
    start: '09:00',
    end: '09:45',
    ...over,
  });
  it('finds a teacher, room or section in two lessons at once', () => {
    const c = timetableConflicts([
      row('a', { teacherId: 'T' }),
      row('b', { teacherId: 'T', section: '5B', room: 'X' }),
      row('c', { section: '5B', room: 'X', start: '09:30', end: '10:00' }),
    ]);
    expect(c).toEqual(
      expect.arrayContaining([
        { kind: 'teacher', a: 'a', b: 'b' },
        { kind: 'room', a: 'b', b: 'c' },
        { kind: 'section', a: 'b', b: 'c' },
      ]),
    );
    expect(c).toHaveLength(3);
  });
  it('lets lessons that only touch or are on other days coexist', () => {
    expect(
      timetableConflicts([row('a', { teacherId: 'T' }), row('b', { teacherId: 'T', start: '09:45', end: '10:30' }), row('c', { teacherId: 'T', day: 2 })]),
    ).toEqual([]);
  });
});

describe('summarizeSurvey', () => {
  it('averages ratings and collects written answers', () => {
    const qs = [
      { id: 'q1', text: 'Clean?', kind: 'rating' as const },
      { id: 'q2', text: 'Comments', kind: 'text' as const },
    ];
    const s = summarizeSurvey(qs, [{ q1: 5, q2: 'Great' }, { q1: 3, q2: '  ' }, { q1: 9 }]);
    expect(s.responses).toBe(3);
    expect(s.questions[0]).toMatchObject({ average: 4, counts: [0, 0, 1, 0, 1] });
    expect(s.questions[1]!.texts).toEqual(['Great']);
  });
});
