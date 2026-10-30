import { describe, expect, it } from 'vitest';
import { REMINDER_PRESETS, reminderTime } from './reminders';

describe('reminder presets', () => {
  it('are always in the future and land on friendly hours', () => {
    const morning = new Date(2026, 9, 29, 10, 0);
    const late = new Date(2026, 9, 29, 22, 30);
    for (const now of [morning, late]) for (const p of REMINDER_PRESETS) expect(reminderTime(p, now)).toBeGreaterThan(now.getTime() + 3_000_000);
    expect(new Date(reminderTime('tonight', morning)).getHours()).toBe(20);
    expect(new Date(reminderTime('tonight', morning)).getDate()).toBe(29);
    expect(new Date(reminderTime('tonight', late)).getDate()).toBe(30);
    expect(new Date(reminderTime('tomorrow', late))).toEqual(new Date(2026, 9, 30, 9, 0));
    expect(new Date(reminderTime('nextWeek', morning))).toEqual(new Date(2026, 10, 5, 9, 0));
  });
});
