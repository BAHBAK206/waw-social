import { addDays } from './dates';

/** Adds months to a day (YYYY-MM-DD), keeping the day of the month when it exists (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Splits a fee into equal monthly instalments (any remainder goes to the first ones, one cent each). */
export function instalmentSchedule(totalCents: number, count: number, firstDue: string): { no: number; amountCents: number; dueDay: string }[] {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  const base = Math.floor(totalCents / n);
  let rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { no: i + 1, amountCents: base + extra, dueDay: addMonths(firstDue, i) };
  });
}

/** An invoice needs a reminder when it is unpaid and due within `ahead` days (or already late), and was not reminded recently. */
export function needsFeeReminder(
  inv: { status: string; dueDay: string; lastRemindedAt: number | null },
  today: string,
  now = Date.now(),
  ahead = 3,
  everyDays = 3,
): boolean {
  if (inv.status !== 'pending') return false;
  if (inv.dueDay > addDays(today, ahead)) return false;
  return inv.lastRemindedAt === null || now - inv.lastRemindedAt >= everyDays * 86_400_000;
}

export interface SlotRow {
  id: string;
  courseId: string;
  section: string | null;
  teacherId: string;
  room: string;
  day: number;
  start: string;
  end: string;
}

export interface SlotConflict {
  kind: 'teacher' | 'room' | 'section';
  a: string;
  b: string;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const overlap = (a: SlotRow, b: SlotRow) => a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);

/** Double bookings in a school timetable: one teacher, one room or one section in two lessons at the same time. */
export function timetableConflicts(rows: SlotRow[]): SlotConflict[] {
  const out: SlotConflict[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.courseId === b.courseId || !overlap(a, b)) continue;
      if (a.teacherId === b.teacherId) out.push({ kind: 'teacher', a: a.id, b: b.id });
      if (a.room && a.room.trim().toLowerCase() === b.room.trim().toLowerCase()) out.push({ kind: 'room', a: a.id, b: b.id });
      if (a.section && a.section === b.section) out.push({ kind: 'section', a: a.id, b: b.id });
    }
  }
  return out;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  kind: 'rating' | 'text';
}

export interface SurveySummary {
  responses: number;
  questions: { id: string; text: string; kind: 'rating' | 'text'; average: number | null; counts: number[]; texts: string[] }[];
}

/** Averages (1–5), a count per rating, and the written answers of a survey (no names are ever part of it). */
export function summarizeSurvey(questions: SurveyQuestion[], answers: Record<string, string | number>[]): SurveySummary {
  return {
    responses: answers.length,
    questions: questions.map((q) => {
      const counts = [0, 0, 0, 0, 0];
      const texts: string[] = [];
      let sum = 0;
      let n = 0;
      for (const a of answers) {
        const v = a[q.id];
        if (q.kind === 'rating' && typeof v === 'number' && v >= 1 && v <= 5) {
          counts[Math.round(v) - 1]! += 1;
          sum += v;
          n += 1;
        } else if (q.kind === 'text' && typeof v === 'string' && v.trim()) texts.push(v.trim());
      }
      return { ...q, average: n ? Math.round((sum / n) * 10) / 10 : null, counts, texts };
    }),
  };
}
