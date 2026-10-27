import { normalizeSearch } from '@qubedu/shared';

export type StoredAnswer = number | number[] | string[];
export type GivenAnswer = number | number[] | string | null | undefined;

export interface GradableQuestion {
  id: string;
  type: 'mc' | 'tf' | 'multi' | 'short';
  answer: StoredAnswer;
  points: number;
  topic: string | null;
  explanation: string | null;
}

export function isCorrect(q: GradableQuestion, given: GivenAnswer): boolean {
  if (given === null || given === undefined) return false;
  switch (q.type) {
    case 'mc':
    case 'tf':
      return typeof given === 'number' && given === q.answer;
    case 'multi': {
      if (!Array.isArray(given) || !Array.isArray(q.answer)) return false;
      const a = [...new Set(given as number[])].sort((x, y) => x - y);
      const b = [...new Set(q.answer as number[])].sort((x, y) => x - y);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    case 'short': {
      if (typeof given !== 'string' || !Array.isArray(q.answer)) return false;
      const g = normalizeSearch(given).replace(/[.,!?؟،]/g, '');
      return (q.answer as string[]).some((acc) => normalizeSearch(String(acc)).replace(/[.,!?؟،]/g, '') === g);
    }
    default:
      return false;
  }
}

export interface GradeResult {
  correct: number;
  total: number;
  pct: number;
  perfect: boolean;
  wrongIds: string[];
  breakdown: { questionId: string; correct: boolean; given: GivenAnswer; answer: StoredAnswer; explanation: string | null }[];
  topicStats: { topic: string; correct: number; total: number; pct: number }[];
}

export function grade(questions: GradableQuestion[], answers: GivenAnswer[]): GradeResult {
  let earned = 0;
  let possible = 0;
  let correct = 0;
  const wrongIds: string[] = [];
  const topics = new Map<string, { correct: number; total: number }>();
  const breakdown = questions.map((q, i) => {
    const given = answers[i] ?? null;
    const ok = isCorrect(q, given);
    possible += q.points;
    if (ok) {
      earned += q.points;
      correct += 1;
    } else wrongIds.push(q.id);
    if (q.topic) {
      const t = topics.get(q.topic) ?? { correct: 0, total: 0 };
      t.total += 1;
      if (ok) t.correct += 1;
      topics.set(q.topic, t);
    }
    return { questionId: q.id, correct: ok, given, answer: q.answer, explanation: q.explanation };
  });
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  return {
    correct,
    total: questions.length,
    pct,
    perfect: questions.length > 0 && correct === questions.length,
    wrongIds,
    breakdown,
    topicStats: [...topics.entries()].map(([topic, t]) => ({ topic, ...t, pct: Math.round((t.correct / t.total) * 100) })),
  };
}

/** Deterministic Fisher–Yates using a seed string (stable order per attempt). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
