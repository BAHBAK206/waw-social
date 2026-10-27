/**
 * Progression model. XP is cumulative; level thresholds widen gradually:
 * threshold(L) = 25·L·(L+1) − 50 (level 1 starts at 0 XP).
 */
export type RankKey = 'starter' | 'learner' | 'advanced' | 'expert' | 'star' | 'legend';

export interface XpProgress {
  xp: number;
  level: number;
  rank: RankKey;
  currentThreshold: number;
  nextThreshold: number;
  inLevel: number;
  needed: number;
  /** 0..100 */
  progress: number;
}

export function normalizeXp(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(n)));
}

export function xpThreshold(level: number): number {
  const n = Math.max(1, Math.trunc(Number.isFinite(level) ? level : 1));
  return n === 1 ? 0 : 25 * n * (n + 1) - 50;
}

export function levelFromXp(xp: number): number {
  const safe = normalizeXp(xp);
  let level = Math.floor((Math.sqrt((8 * (safe + 50)) / 25 + 1) - 1) / 2);
  if (level < 1) level = 1;
  while (xpThreshold(level + 1) <= safe) level += 1;
  while (level > 1 && xpThreshold(level) > safe) level -= 1;
  return level;
}

export function rankForLevel(level: number): RankKey {
  if (level >= 50) return 'legend';
  if (level >= 30) return 'star';
  if (level >= 20) return 'expert';
  if (level >= 10) return 'advanced';
  if (level >= 5) return 'learner';
  return 'starter';
}

export function xpProgress(xp: number): XpProgress {
  const safe = normalizeXp(xp);
  const level = levelFromXp(safe);
  const currentThreshold = xpThreshold(level);
  const nextThreshold = xpThreshold(level + 1);
  const span = nextThreshold - currentThreshold;
  const inLevel = Math.max(0, safe - currentThreshold);
  return {
    xp: safe,
    level,
    rank: rankForLevel(level),
    currentThreshold,
    nextThreshold,
    inLevel,
    needed: Math.max(0, nextThreshold - safe),
    progress: span > 0 ? Math.min(100, Math.max(0, (inLevel / span) * 100)) : 100,
  };
}

/** XP rewards. Values match the original product rules. */
export const XP_RULES = {
  pomodoroComplete: 5,
  dailyChallengeDefault: 10,
  dailyChallengeMax: 100,
  adaptiveDailyCap: 50,
  perfectBonus: 10,
  postCreate: 0,
} as const;

/** XP granted for a new personal best on a quiz. */
export function xpForQuizScore(pct: number, perfect: boolean): number {
  const base = pct >= 80 ? 20 : pct >= 60 ? 12 : pct >= 40 ? 6 : 3;
  return base + (perfect ? XP_RULES.perfectBonus : 0);
}

export interface XpRewardMeta {
  xpEarned: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  levelUp: boolean;
}

export function xpRewardMeta(xpBefore: number, xpAfter: number, xpEarned: number): XpRewardMeta {
  const before = normalizeXp(xpBefore);
  const after = Math.max(before, normalizeXp(xpAfter));
  const levelBefore = levelFromXp(before);
  const levelAfter = levelFromXp(after);
  return { xpEarned: normalizeXp(xpEarned), xpBefore: before, xpAfter: after, levelBefore, levelAfter, levelUp: levelAfter > levelBefore };
}
