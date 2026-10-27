export interface AchievementDef {
  id: string;
  icon: string;
  /** i18n key under `achievements.<id>` */
  key: string;
}

export const ACHIEVEMENTS = [
  { id: 'ach_quiz1', icon: '🎯', key: 'quiz1' },
  { id: 'ach_quiz10', icon: '🏅', key: 'quiz10' },
  { id: 'ach_streak3', icon: '🔥', key: 'streak3' },
  { id: 'ach_streak7', icon: '⚡', key: 'streak7' },
  { id: 'ach_streak30', icon: '🌟', key: 'streak30' },
  { id: 'ach_xp100', icon: '⭐', key: 'xp100' },
  { id: 'ach_xp500', icon: '💎', key: 'xp500' },
  { id: 'ach_xp1000', icon: '🏆', key: 'xp1000' },
  { id: 'ach_friend1', icon: '🤝', key: 'friend1' },
  { id: 'ach_grp1', icon: '👥', key: 'grp1' },
  { id: 'ach_pomo1', icon: '⏱️', key: 'pomo1' },
  { id: 'ach_pomo10', icon: '🧠', key: 'pomo10' },
  { id: 'ach_perfect1', icon: '👑', key: 'perfect1' },
  { id: 'ach_post1', icon: '✍️', key: 'post1' },
  { id: 'ach_cards50', icon: '🃏', key: 'cards50' },
] as const satisfies readonly AchievementDef[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export interface AchievementStats {
  quizCount: number;
  streak: number;
  xp: number;
  followingCount: number;
  groupCount: number;
  pomodoroCount: number;
  perfectCount: number;
  postCount: number;
  cardReviews: number;
}

const RULES: Record<AchievementId, (s: AchievementStats) => boolean> = {
  ach_quiz1: (s) => s.quizCount >= 1,
  ach_quiz10: (s) => s.quizCount >= 10,
  ach_streak3: (s) => s.streak >= 3,
  ach_streak7: (s) => s.streak >= 7,
  ach_streak30: (s) => s.streak >= 30,
  ach_xp100: (s) => s.xp >= 100,
  ach_xp500: (s) => s.xp >= 500,
  ach_xp1000: (s) => s.xp >= 1000,
  ach_friend1: (s) => s.followingCount >= 1,
  ach_grp1: (s) => s.groupCount >= 1,
  ach_pomo1: (s) => s.pomodoroCount >= 1,
  ach_pomo10: (s) => s.pomodoroCount >= 10,
  ach_perfect1: (s) => s.perfectCount >= 1,
  ach_post1: (s) => s.postCount >= 1,
  ach_cards50: (s) => s.cardReviews >= 50,
};

/** Returns achievements newly earned given current stats and already-unlocked ids. */
export function evaluateAchievements(stats: AchievementStats, unlocked: Iterable<string>): AchievementId[] {
  const have = new Set(unlocked);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && RULES[a.id](stats)).map((a) => a.id);
}

export function isAchievementId(id: string): id is AchievementId {
  return ACHIEVEMENTS.some((a) => a.id === id);
}
