import { and, count, eq, sql } from 'drizzle-orm';
import { dayKey, evaluateAchievements, levelFromXp, nextStreak } from '@qubedu/shared';
import type { Db } from '../db/client';
import { follows, groupMembers, posts, studyLog, userAchievements, users, xpLedger } from '../db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

export interface XpAward {
  awarded: boolean;
  xpBefore: number;
  xpAfter: number;
}

/** Idempotent XP grant: (user, reason, ref) can only ever be credited once. */
export async function awardXp(tx: Tx, userId: string, amount: number, reason: string, ref: string, day: string): Promise<XpAward> {
  const [before] = await tx.select({ xp: users.xp }).from(users).where(eq(users.id, userId));
  const xpBefore = before?.xp ?? 0;
  if (amount <= 0) return { awarded: false, xpBefore, xpAfter: xpBefore };
  const inserted = await tx
    .insert(xpLedger)
    .values({ userId, amount, reason, ref, day })
    .onConflictDoNothing()
    .returning({ id: xpLedger.id });
  if (!inserted.length) return { awarded: false, xpBefore, xpAfter: xpBefore };
  const [after] = await tx
    .update(users)
    .set({ xp: sql`${users.xp} + ${amount}` })
    .where(eq(users.id, userId))
    .returning({ xp: users.xp });
  const xpAfter = after?.xp ?? xpBefore + amount;
  await tx.update(users).set({ level: levelFromXp(xpAfter) }).where(eq(users.id, userId));
  return { awarded: true, xpBefore, xpAfter };
}

export async function xpEarnedToday(tx: Tx, userId: string, reason: string, day: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
    .from(xpLedger)
    .where(and(eq(xpLedger.userId, userId), eq(xpLedger.reason, reason), eq(xpLedger.day, day)));
  return row?.total ?? 0;
}

/** Updates the daily streak for activity happening "today" in the user's time zone. */
export async function touchStreak(tx: Tx, userId: string, timezone: string): Promise<{ streak: number; changed: boolean }> {
  const [u] = await tx.select({ streak: users.streak, last: users.lastStreakDay }).from(users).where(eq(users.id, userId));
  if (!u) return { streak: 0, changed: false };
  const today = dayKey(Date.now(), timezone);
  const next = nextStreak(u.streak, u.last, today);
  if (next.changed) await tx.update(users).set({ streak: next.streak, lastStreakDay: next.lastDay }).where(eq(users.id, userId));
  return { streak: next.streak, changed: next.changed };
}

export async function logStudy(tx: Tx, userId: string, day: string, delta: { minutes?: number; quizzes?: number; cards?: number }) {
  const minutes = delta.minutes ?? 0;
  const quizzes = delta.quizzes ?? 0;
  const cards = delta.cards ?? 0;
  await tx
    .insert(studyLog)
    .values({ userId, day, minutes, quizzes, cards })
    .onConflictDoUpdate({
      target: [studyLog.userId, studyLog.day],
      set: {
        minutes: sql`${studyLog.minutes} + ${minutes}`,
        quizzes: sql`${studyLog.quizzes} + ${quizzes}`,
        cards: sql`${studyLog.cards} + ${cards}`,
      },
    });
}

/** Evaluates and stores newly earned achievements. Returns the new ids. */
export async function checkAchievements(tx: Tx, userId: string): Promise<string[]> {
  const [u] = await tx
    .select({
      quizCount: users.quizCount,
      streak: users.streak,
      xp: users.xp,
      pomodoroCount: users.pomodoroCount,
      perfectCount: users.perfectCount,
      cardReviews: users.cardReviews,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!u) return [];
  const [[f], [g], [p], have] = await Promise.all([
    tx.select({ n: count() }).from(follows).where(eq(follows.followerId, userId)),
    tx.select({ n: count() }).from(groupMembers).where(eq(groupMembers.userId, userId)),
    tx.select({ n: count() }).from(posts).where(and(eq(posts.authorId, userId), sql`${posts.deletedAt} is null`)),
    tx.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId)),
  ]);
  const earned = evaluateAchievements(
    { ...u, followingCount: f?.n ?? 0, groupCount: g?.n ?? 0, postCount: p?.n ?? 0 },
    have.map((h) => h.id),
  );
  if (!earned.length) return [];
  const inserted = await tx
    .insert(userAchievements)
    .values(earned.map((achievementId) => ({ userId, achievementId })))
    .onConflictDoNothing()
    .returning({ id: userAchievements.achievementId });
  return inserted.map((r) => r.id);
}
