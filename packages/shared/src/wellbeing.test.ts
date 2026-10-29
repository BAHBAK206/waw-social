import { describe, expect, it } from 'vitest';
import { lowMoodAlert, remainingMinutes } from './wellbeing';

describe('lowMoodAlert', () => {
  const t = '2026-10-29';
  it('flags three low days in a row', () => {
    expect(
      lowMoodAlert(
        [
          { day: '2026-10-29', mood: 2 },
          { day: '2026-10-28', mood: 1 },
          { day: '2026-10-27', mood: 2 },
        ],
        t,
      ),
    ).toBe(true);
  });
  it('does not flag a gap or a normal day in between', () => {
    expect(
      lowMoodAlert(
        [
          { day: '2026-10-29', mood: 2 },
          { day: '2026-10-28', mood: 3 },
          { day: '2026-10-27', mood: 1 },
        ],
        t,
      ),
    ).toBe(false);
    expect(
      lowMoodAlert(
        [
          { day: '2026-10-29', mood: 1 },
          { day: '2026-10-27', mood: 1 },
          { day: '2026-10-26', mood: 1 },
        ],
        t,
      ),
    ).toBe(false);
  });
  it('flags four low days in a week even when not consecutive', () => {
    const days = ['2026-10-29', '2026-10-27', '2026-10-25', '2026-10-24'].map((day) => ({ day, mood: 2 }));
    expect(lowMoodAlert(days, t)).toBe(true);
    expect(lowMoodAlert(days.slice(0, 3), t)).toBe(false);
  });
});

describe('remainingMinutes', () => {
  it('counts down with bonus time and never goes negative', () => {
    expect(remainingMinutes(60, 20, 0)).toBe(40);
    expect(remainingMinutes(60, 70, 0)).toBe(0);
    expect(remainingMinutes(60, 70, 15)).toBe(5);
    expect(remainingMinutes(null, 500, 0)).toBeNull();
  });
});
