import { addDays, daysBetween } from './dates';

export type PlanBlockKind = 'exam' | 'assignment' | 'task' | 'review' | 'session';

export interface PlanBlock {
  kind: PlanBlockKind;
  title: string;
  minutes: number;
  refId?: string;
  dueDay?: string;
}

export interface PlanDay {
  day: string;
  blocks: PlanBlock[];
  minutes: number;
}

export interface PlannerInput {
  today: string;
  horizonDays?: number;
  dailyBudgetMinutes?: number;
  exams: { id: string; subject: string; day: string }[];
  assignments: { id: string; title: string; dueDay: string; releaseDay?: string | null }[];
  tasks: { id: string; title: string; dueDay: string | null; done: boolean }[];
  dueCards: number;
  sessions?: { id: string; title: string; day: string; minutes: number }[];
}

export interface WeeklyPlan {
  days: PlanDay[];
  overflow: PlanBlock[];
  budget: number;
}

/**
 * Deterministic weekly study planner. Scheduled sessions are fixed; then
 * flashcard review, assignment preparation (25 min, the day before due),
 * exam preparation (30 min blocks, denser near the exam), and tasks (15 min).
 * Everything respects a per-day budget; what does not fit goes to overflow.
 */
export function buildWeeklyPlan(input: PlannerInput): WeeklyPlan {
  const horizon = Math.max(1, Math.min(14, input.horizonDays ?? 7));
  const budget = Math.max(15, Math.min(600, input.dailyBudgetMinutes ?? 90));
  const days: PlanDay[] = Array.from({ length: horizon }, (_, i) => ({ day: addDays(input.today, i), blocks: [], minutes: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const overflow: PlanBlock[] = [];

  const place = (block: PlanBlock, preferred: string[], force = false) => {
    for (const day of preferred) {
      const slot = byDay.get(day);
      if (!slot) continue;
      if (force || slot.minutes + block.minutes <= budget) {
        slot.blocks.push(block);
        slot.minutes += block.minutes;
        return true;
      }
    }
    overflow.push(block);
    return false;
  };

  for (const s of input.sessions ?? []) {
    place({ kind: 'session', title: s.title, minutes: s.minutes, refId: s.id, dueDay: s.day }, [s.day], true);
  }

  if (input.dueCards > 0) {
    const minutes = Math.min(20, Math.max(5, Math.ceil(input.dueCards / 4)));
    for (const d of days) place({ kind: 'review', title: 'flashcards', minutes }, [d.day]);
  }

  const sortedAssignments = [...input.assignments].sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  for (const a of sortedAssignments) {
    const offset = daysBetween(input.today, a.dueDay);
    if (offset < 0 || offset >= horizon + 1) continue;
    const earliest = a.releaseDay && a.releaseDay > input.today ? a.releaseDay : input.today;
    const candidates: string[] = [];
    for (let i = Math.min(offset - 1, horizon - 1); i >= 0; i--) {
      const day = addDays(input.today, i);
      if (day >= earliest) candidates.push(day);
    }
    if (offset === 0) candidates.unshift(input.today);
    place({ kind: 'assignment', title: a.title, minutes: 25, refId: a.id, dueDay: a.dueDay }, candidates);
  }

  for (const e of [...input.exams].sort((a, b) => a.day.localeCompare(b.day))) {
    const offset = daysBetween(input.today, e.day);
    if (offset < 0 || offset > 21) continue;
    const blocks = offset <= 3 ? Math.max(1, offset) : offset <= 7 ? 3 : 2;
    const window: string[] = [];
    for (let i = Math.min(offset - 1, horizon - 1); i >= 0; i--) window.push(addDays(input.today, i));
    if (offset === 0) window.push(input.today);
    for (let b = 0; b < blocks; b++) {
      const rotated = window.slice(b % Math.max(1, window.length)).concat(window.slice(0, b % Math.max(1, window.length)));
      place({ kind: 'exam', title: e.subject, minutes: 30, refId: e.id, dueDay: e.day }, rotated);
    }
  }

  for (const t of input.tasks) {
    if (t.done || !t.dueDay) continue;
    const offset = daysBetween(input.today, t.dueDay);
    if (offset < 0 || offset >= horizon) continue;
    const candidates = [t.dueDay];
    for (let i = offset - 1; i >= 0; i--) candidates.push(addDays(input.today, i));
    place({ kind: 'task', title: t.title, minutes: 15, refId: t.id, dueDay: t.dueDay }, candidates);
  }

  return { days, overflow, budget };
}
