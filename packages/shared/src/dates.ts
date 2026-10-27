/** Returns YYYY-MM-DD for the given instant in an IANA time zone. */
export function dayKey(date: Date | number = Date.now(), timeZone = 'UTC'): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export interface StreakUpdate {
  streak: number;
  lastDay: string;
  changed: boolean;
}

/** Daily streak: same day → unchanged, consecutive day → +1, gap → reset to 1. */
export function nextStreak(current: number, lastDay: string | null, today: string): StreakUpdate {
  if (lastDay === today) return { streak: Math.max(1, current), lastDay: today, changed: false };
  if (lastDay && addDays(lastDay, 1) === today) return { streak: current + 1, lastDay: today, changed: true };
  return { streak: 1, lastDay: today, changed: true };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
