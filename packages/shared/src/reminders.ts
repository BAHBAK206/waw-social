/** Quick choices for "remind me": a moment in local time (the device's own clock), always in the future. */
export type ReminderPreset = 'inOneHour' | 'tonight' | 'tomorrow' | 'inThreeDays' | 'nextWeek';

export function reminderTime(preset: ReminderPreset, now = new Date()): number {
  const d = new Date(now);
  switch (preset) {
    case 'inOneHour':
      return now.getTime() + 3_600_000;
    case 'tonight':
      d.setHours(20, 0, 0, 0);
      // After 7 pm "tonight" would be too soon: use tomorrow evening.
      if (d.getTime() - now.getTime() < 3_600_000) d.setDate(d.getDate() + 1);
      return d.getTime();
    case 'tomorrow':
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    case 'inThreeDays':
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    case 'nextWeek':
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
  }
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = ['inOneHour', 'tonight', 'tomorrow', 'inThreeDays', 'nextWeek'];
