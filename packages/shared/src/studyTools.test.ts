import { describe, expect, it } from 'vitest';
import { calculateGrade, overlaps, sortSlots, todaySlots } from './studyTools';

describe('grade calculator', () => {
  it('works out what is needed on the final exam', () => {
    // Out of 60: homework 10 + monthly tests 20 + final 30; pass mark 30.
    const r = calculateGrade(
      [
        { name: 'Homework', max: 10, earned: 8 },
        { name: 'Monthly tests', max: 20, earned: 14 },
        { name: 'Final', max: 30, earned: null },
      ],
      { passMarks: 30, target: 51 },
    );
    expect(r).toMatchObject({ earned: 22, gradedMax: 30, total: 60, remaining: 30, neededToPass: 8, neededForTarget: 29, best: 52, worst: 22 });
    expect(r.percentSoFar).toBeCloseTo(73.3, 1);
    expect(r.ratingSoFar).toBe('good');
  });

  it('says when the pass mark is already safe or out of reach', () => {
    expect(
      calculateGrade(
        [
          { name: 'A', max: 50, earned: 45 },
          { name: 'B', max: 50, earned: null },
        ],
        { passMarks: 40 },
      ).neededToPass,
    ).toBe(0);
    expect(
      calculateGrade(
        [
          { name: 'A', max: 80, earned: 10 },
          { name: 'B', max: 20, earned: null },
        ],
        { passMarks: 50 },
      ).neededToPass,
    ).toBeNull();
  });
});

describe('timetable', () => {
  const slots = [
    { day: 0 as const, start: '10:00', end: '10:45', title: 'Math' },
    { day: 0 as const, start: '08:00', end: '08:45', title: 'Arabic' },
    { day: 6 as const, start: '09:00', end: '09:45', title: 'Science' },
  ];
  it('orders the week from Saturday and finds the current and next class', () => {
    expect(sortSlots(slots).map((s) => s.title)).toEqual(['Science', 'Arabic', 'Math']);
    const sunday830 = new Date(2026, 9, 25, 8, 30); // a Sunday
    const t = todaySlots(slots, sunday830);
    expect(t.items.map((s) => s.title)).toEqual(['Arabic', 'Math']);
    expect(t.current?.title).toBe('Arabic');
    expect(t.next?.title).toBe('Math');
  });
  it('detects overlapping classes', () => {
    expect(overlaps({ day: 1, start: '08:00', end: '09:00' }, { day: 1, start: '08:30', end: '09:30' })).toBe(true);
    expect(overlaps({ day: 1, start: '08:00', end: '09:00' }, { day: 1, start: '09:00', end: '09:30' })).toBe(false);
  });
});
