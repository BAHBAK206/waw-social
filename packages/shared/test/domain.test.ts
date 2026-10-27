import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildWeeklyPlan,
  computeMastery,
  dayKey,
  evaluateAchievements,
  featureIdsForLocation,
  firstBlockedFeature,
  hasPermission,
  initialSchedulerState,
  levelFromXp,
  nextStreak,
  normalizeFeatureControls,
  normalizeSearch,
  passwordStrength,
  quizInputSchema,
  rateCard,
  xpForQuizScore,
  xpProgress,
  xpThreshold,
} from '../src';

describe('xp', () => {
  it('thresholds match the original progression', () => {
    expect(xpThreshold(1)).toBe(0);
    expect(xpThreshold(2)).toBe(100);
    expect(xpThreshold(3)).toBe(250);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(249)).toBe(2);
    expect(levelFromXp(250)).toBe(3);
    expect(levelFromXp(Number.NaN)).toBe(1);
    expect(levelFromXp(-5)).toBe(1);
  });
  it('progress is bounded', () => {
    const p = xpProgress(175);
    expect(p.level).toBe(2);
    expect(p.progress).toBeCloseTo(50);
    expect(p.needed).toBe(75);
  });
  it('quiz rewards', () => {
    expect(xpForQuizScore(100, true)).toBe(30);
    expect(xpForQuizScore(65, false)).toBe(12);
    expect(xpForQuizScore(45, false)).toBe(6);
    expect(xpForQuizScore(10, false)).toBe(3);
  });
});

describe('achievements', () => {
  it('awards only new achievements', () => {
    const stats = { quizCount: 10, streak: 3, xp: 120, followingCount: 0, groupCount: 1, pomodoroCount: 0, perfectCount: 0, postCount: 0, cardReviews: 0 };
    expect(evaluateAchievements(stats, ['ach_quiz1'])).toEqual(['ach_quiz10', 'ach_streak3', 'ach_xp100', 'ach_grp1']);
  });
});

describe('flashcards', () => {
  const now = 1_700_000_000_000;
  it('again resets and retries in 10 minutes', () => {
    const s = rateCard({ ...initialSchedulerState(now), repetitions: 3, level: 3, intervalDays: 7 }, 'again', now);
    expect(s.level).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.dueAt).toBe(now + 600_000);
  });
  it('know grows intervals 1 → 3 → ease×', () => {
    let s = rateCard(initialSchedulerState(now), 'know', now);
    expect(s.intervalDays).toBe(1);
    s = rateCard(s, 'know', now);
    expect(s.intervalDays).toBe(3);
    s = rateCard(s, 'know', now);
    expect(s.intervalDays).toBe(8);
  });
  it('easy jumps further', () => {
    const s = rateCard(initialSchedulerState(now), 'easy', now);
    expect(s.intervalDays).toBe(4);
    expect(s.level).toBe(2);
  });
});

describe('dates and streaks', () => {
  it('computes day keys in a time zone', () => {
    const t = Date.UTC(2026, 0, 1, 23, 30);
    expect(dayKey(t, 'UTC')).toBe('2026-01-01');
    expect(dayKey(t, 'Africa/Cairo')).toBe('2026-01-02');
  });
  it('streak rules', () => {
    expect(nextStreak(4, '2026-01-01', '2026-01-02')).toEqual({ streak: 5, lastDay: '2026-01-02', changed: true });
    expect(nextStreak(4, '2026-01-02', '2026-01-02').changed).toBe(false);
    expect(nextStreak(4, '2025-12-20', '2026-01-02').streak).toBe(1);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('features', () => {
  it('nested routes inherit their parent page', () => {
    expect(featureIdsForLocation('/groups/abc')).toEqual(['groups']);
    expect(featureIdsForLocation('/people', '?tab=leaderboard')).toEqual(['leaderboard', 'people']);
    expect(featureIdsForLocation('/live/xyz')).toEqual(['live', 'classes']);
    expect(featureIdsForLocation('/')).toEqual(['home']);
  });
  it('normalizes and blocks', () => {
    const map = normalizeFeatureControls({ chat: { mode: 'locked', message: ' soon ' }, bogus: { mode: 'hidden' }, quiz: { mode: 'nope' } });
    expect(map).toEqual({ chat: { mode: 'locked', message: 'soon' } });
    expect(firstBlockedFeature(['chat', 'home'], map)).toBe('chat');
  });
});

describe('roles', () => {
  it('root-only permissions cannot be delegated', () => {
    expect(hasPermission('admin', [], 'features.manage')).toBe(false);
    expect(hasPermission('root', [], 'features.manage')).toBe(true);
    expect(hasPermission('moderator', ['quizzes.manage'], 'quizzes.manage')).toBe(true);
    expect(hasPermission('moderator', [], 'quizzes.manage')).toBe(false);
    expect(hasPermission('user', ['users.manage'], 'users.manage')).toBe(false);
  });
});

describe('text', () => {
  it('normalizes Arabic letter forms and diacritics', () => {
    expect(normalizeSearch('  أَحْمَد  ')).toBe('احمد');
    expect(normalizeSearch('مدرسة')).toBe(normalizeSearch('مدرسه'));
    expect(normalizeSearch('Café')).toBe('cafe');
  });
  it('password strength', () => {
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('Abcdefgh12!x')).toBe(4);
  });
});

describe('mastery', () => {
  it('levels by mastery', () => {
    const now = Date.now();
    const m = computeMastery('k', 'Fractions', null, [{ pct: 40, total: 5, ts: now - 1000 }, { pct: 70, total: 5, ts: now }], now);
    expect(m.level).toBe('needs_review');
    expect(m.trend).toBe('improving');
  });
});

describe('planner', () => {
  it('schedules assignment the day before due and respects budget', () => {
    const plan = buildWeeklyPlan({
      today: '2026-03-01',
      dailyBudgetMinutes: 60,
      exams: [{ id: 'e1', subject: 'Math', day: '2026-03-04' }],
      assignments: [{ id: 'a1', title: 'Essay', dueDay: '2026-03-03' }],
      tasks: [{ id: 't1', title: 'Read', dueDay: '2026-03-02', done: false }],
      dueCards: 12,
    });
    const a = plan.days.find((d) => d.blocks.some((b) => b.refId === 'a1'));
    expect(a?.day).toBe('2026-03-02');
    for (const d of plan.days) expect(d.minutes).toBeLessThanOrEqual(60);
    expect(plan.days.flatMap((d) => d.blocks).filter((b) => b.kind === 'exam').length).toBeGreaterThan(0);
  });
});

describe('quiz schema', () => {
  it('validates answers against options', () => {
    const base = { title: 'Quiz', questions: [{ type: 'mc', prompt: 'Q?', options: ['a', 'b'], answer: 1 }] };
    expect(quizInputSchema.safeParse(base).success).toBe(true);
    expect(quizInputSchema.safeParse({ ...base, questions: [{ ...base.questions[0], answer: 5 }] }).success).toBe(false);
  });
});
