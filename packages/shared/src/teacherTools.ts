import { normalizeSearch } from './text';

/* ───────── Paper grading from a photo ───────── */

export interface PaperKeyItem {
  label: string;
  /** Words or short answers that show the student got it (any of them, or `needed` of them). */
  accepted: string[];
  points: number;
  /** How many accepted answers must appear for full marks (default 1). */
  needed?: number;
}

export interface PaperMark {
  label: string;
  points: number;
  awarded: number;
  matched: string[];
}

const stripPunct = (s: string) =>
  normalizeSearch(s)
    .replace(/[.,;:!?؟،"'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Suggests marks for a paper from its text (read from a photo or typed): an item earns full points when enough of
 * its accepted answers appear, a share of the points when only some do, nothing otherwise. The teacher reviews and
 * changes every mark before saving.
 */
export function suggestPaperMarks(text: string, key: PaperKeyItem[]): { items: PaperMark[]; total: number; max: number } {
  const hay = ` ${stripPunct(text)} `;
  const items = key.map((k): PaperMark => {
    const accepted = k.accepted.map((a) => stripPunct(a)).filter(Boolean);
    const matched = accepted.filter((a) => hay.includes(` ${a} `) || (a.length > 3 && hay.includes(a)));
    const needed = Math.max(1, Math.min(k.needed ?? 1, accepted.length || 1));
    const share = Math.min(1, matched.length / needed);
    const awarded = Math.round(k.points * share * 2) / 2;
    return { label: k.label, points: k.points, awarded, matched: k.accepted.filter((a) => matched.includes(stripPunct(a))) };
  });
  return { items, total: items.reduce((n, i) => n + i.awarded, 0), max: items.reduce((n, i) => n + i.points, 0) };
}

/* ───────── Lesson plan timeline ───────── */

export type LessonSection = 'warmup' | 'explain' | 'practice' | 'assess' | 'wrapup';
const SPLIT: Record<LessonSection, number> = { warmup: 0.1, explain: 0.3, practice: 0.35, assess: 0.15, wrapup: 0.1 };

/** Splits the lesson time into its parts (minutes are whole numbers and add up to the total). */
export function lessonTimeline(totalMinutes: number): { key: LessonSection; minutes: number }[] {
  const total = Math.max(20, Math.min(180, Math.round(totalMinutes)));
  const keys = Object.keys(SPLIT) as LessonSection[];
  const rows = keys.map((key) => ({ key, minutes: Math.max(2, Math.round(total * SPLIT[key])) }));
  const diff = total - rows.reduce((n, r) => n + r.minutes, 0);
  rows[2]!.minutes += diff; // practice absorbs rounding
  return rows;
}

/* ───────── Tiered worksheets ───────── */

export type Tier = 'easy' | 'medium' | 'advanced';

/**
 * Sorts questions into three tiers by their difficulty label; questions without a label are spread evenly so every
 * tier gets work. `perTier` caps how many each tier gets.
 */
export function tierQuestions<T extends { level?: string | null }>(questions: T[], perTier: number): Record<Tier, T[]> {
  const out: Record<Tier, T[]> = { easy: [], medium: [], advanced: [] };
  const unlabeled: T[] = [];
  for (const q of questions) {
    if (q.level === 'easy') out.easy.push(q);
    else if (q.level === 'medium') out.medium.push(q);
    else if (q.level === 'hard') out.advanced.push(q);
    else unlabeled.push(q);
  }
  const order: Tier[] = ['easy', 'medium', 'advanced'];
  unlabeled.forEach((q, i) => out[order[i % 3]!].push(q));
  for (const t of order) out[t] = out[t].slice(0, perTier);
  return out;
}
