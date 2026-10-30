/**
 * Curriculum map, question bank and exam logic shared by the server and the apps.
 *
 * Curriculum: subject → unit → lesson → objective. Questions, quizzes and lessons are tagged with a node, and mastery is
 * measured per objective.
 */

export type CurriculumKind = 'subject' | 'unit' | 'lesson' | 'objective';
export const CURRICULUM_KINDS: readonly CurriculumKind[] = ['subject', 'unit', 'lesson', 'objective'];
/** Which kind may sit under which. */
export const CHILD_KIND: Record<CurriculumKind, CurriculumKind | null> = { subject: 'unit', unit: 'lesson', lesson: 'objective', objective: null };

/** Curriculum systems (national programmes). "general" is for anything else. */
export const CURRICULUM_SYSTEMS = ['general', 'eg', 'sa', 'ae', 'jo', 'ma', 'dz', 'tn', 'igcse', 'ib'] as const;
export type CurriculumSystem = (typeof CURRICULUM_SYSTEMS)[number];

/** Bloom's taxonomy, from recall to creation. */
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export const ITEM_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type ItemDifficulty = (typeof ITEM_DIFFICULTIES)[number];

/* ───────────── Exam blueprints ───────────── */

export interface BlueprintRule {
  objectiveId?: string | null;
  difficulty?: ItemDifficulty | null;
  bloom?: BloomLevel | null;
  count: number;
}

export interface BankItem {
  id: string;
  /** The objective and every ancestor (lesson, unit, subject) so a rule on a unit matches its objectives. */
  path: string[];
  difficulty: ItemDifficulty | null;
  bloom: BloomLevel | null;
}

/** Small deterministic PRNG (mulberry32) so a student's exam can be rebuilt from its seed. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWith<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks questions for one student: each rule takes `count` random items that match it and were not picked by an earlier
 * rule. Returns the ids and, per rule, how many could not be filled (the bank is too small).
 */
export function pickFromBlueprint(items: readonly BankItem[], rules: readonly BlueprintRule[], seed: string): { ids: string[]; missing: number[] } {
  const rand = seededRandom(seed);
  const used = new Set<string>();
  const ids: string[] = [];
  const missing: number[] = [];
  for (const r of rules) {
    const pool = items.filter(
      (it) =>
        !used.has(it.id) &&
        (!r.objectiveId || it.path.includes(r.objectiveId)) &&
        (!r.difficulty || it.difficulty === r.difficulty) &&
        (!r.bloom || it.bloom === r.bloom),
    );
    const take = shuffleWith(pool, rand).slice(0, r.count);
    for (const t of take) {
      used.add(t.id);
      ids.push(t.id);
    }
    missing.push(Math.max(0, r.count - take.length));
  }
  return { ids: shuffleWith(ids, rand), missing };
}

/* ───────────── Option shuffling ───────────── */

/** A random order for a question's options: display position i shows original option perm[i]. */
export function optionPermutation(count: number, rand: () => number): number[] {
  return shuffleWith(
    Array.from({ length: count }, (_, i) => i),
    rand,
  );
}

/** Options in the order the student sees them. */
export function permuteOptions<T>(options: readonly T[], perm: readonly number[] | undefined): T[] {
  if (!perm || perm.length !== options.length) return [...options];
  return perm.map((i) => options[i]!);
}

/** A displayed answer (index or indices) → the original option indices used for grading. */
export function unpermuteAnswer<T>(given: T, perm: readonly number[] | undefined): T {
  if (!perm) return given;
  if (typeof given === 'number') return (perm[given] ?? -1) as T;
  if (Array.isArray(given) && given.every((g) => typeof g === 'number')) return (given as number[]).map((g) => perm[g] ?? -1) as T;
  return given;
}

/* ───────────── Item analysis ───────────── */

export interface ItemStats {
  questionId: string;
  answered: number;
  /** Share who got it right (0–1); the classic "difficulty index". */
  p: number | null;
  /** Upper 27% minus lower 27% (by total score) who got it right (−1…1). */
  discrimination: number | null;
  difficulty: ItemDifficulty | null;
  quality: 'good' | 'fair' | 'poor' | null;
}

/**
 * Classic test item analysis from submitted attempts (each with its total % and which questions were right).
 * Needs at least 5 answers per item to say anything.
 */
export function itemAnalysis(attempts: readonly { pct: number; items: Record<string, boolean> }[], questionIds: readonly string[]): ItemStats[] {
  const sorted = [...attempts].sort((a, b) => b.pct - a.pct);
  const k = Math.max(1, Math.round(sorted.length * 0.27));
  const upper = sorted.slice(0, k);
  const lower = sorted.slice(-k);
  const rate = (group: readonly { items: Record<string, boolean> }[], id: string) => {
    const seen = group.filter((a) => id in a.items);
    return seen.length ? seen.filter((a) => a.items[id]).length / seen.length : null;
  };
  return questionIds.map((id) => {
    const seen = attempts.filter((a) => id in a.items);
    if (seen.length < 5) return { questionId: id, answered: seen.length, p: null, discrimination: null, difficulty: null, quality: null };
    const p = seen.filter((a) => a.items[id]).length / seen.length;
    const u = rate(upper, id);
    const l = rate(lower, id);
    const d = u === null || l === null ? null : Math.round((u - l) * 100) / 100;
    return {
      questionId: id,
      answered: seen.length,
      p: Math.round(p * 100) / 100,
      discrimination: d,
      difficulty: p >= 0.8 ? 'easy' : p <= 0.3 ? 'hard' : 'medium',
      quality: d === null ? null : d >= 0.3 ? 'good' : d >= 0.2 ? 'fair' : 'poor',
    };
  });
}

/* ───────────── Learning plan ───────────── */

export type ObjectiveStatus = 'mastered' | 'learning' | 'weak' | 'new';

/** Status from a mastery score (0–100) and how many questions back it. */
export function objectiveStatus(mastery: number | null, evidence: number): ObjectiveStatus {
  if (mastery === null || evidence === 0) return 'new';
  if (mastery >= 80 && evidence >= 3) return 'mastered';
  if (mastery < 50 && evidence >= 2) return 'weak';
  return 'learning';
}

/**
 * The next objectives to study, in curriculum order: weak ones first, then those being learned, then new ones.
 * Mastered objectives are skipped.
 */
export function nextObjectives<T extends { id: string; status: ObjectiveStatus }>(ordered: readonly T[], limit = 3): T[] {
  const rank: Record<ObjectiveStatus, number> = { weak: 0, learning: 1, new: 2, mastered: 9 };
  return ordered
    .map((o, i) => ({ o, i }))
    .filter((x) => x.o.status !== 'mastered')
    .sort((a, b) => rank[a.o.status] - rank[b.o.status] || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.o);
}
