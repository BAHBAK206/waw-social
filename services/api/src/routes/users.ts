import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  dayKey,
  isValidTimeZone,
  normalizeSearch,
  paginationSchema,
  reportSchema,
  updatePrefsSchema,
  updateProfileSchema,
  type LeaderboardEntry,
  type Page,
  type UserSummary,
} from '@qubedu/shared';
import { blocks, exams, flashcards, follows, notes, posts, quizBest, reports, studyLog, tasks, users, xpLedger } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { verifyPassword } from '../lib/crypto';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, conflict, notFound } from '../lib/errors';
import { body, param, query, requireUser, type Ctx } from '../lib/http';
import { summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { notify } from '../lib/notify';
import { appearanceOf, buildMe, buildProfile } from '../lib/profile';
import { checkAchievements, touchStreak } from '../lib/progress';
import { checkRate } from '../middleware';

const leaderboardQuery = z.object({
  period: z.enum(['all', 'week', 'month']).default('all'),
  scope: z.enum(['global', 'following']).default('global'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const meRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    return c.json(await buildMe(c.get('deps'), user.id));
  })
  .patch('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, updateProfileSchema);
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.displayName !== undefined) {
      patch.displayName = input.displayName;
      patch.searchName = normalizeSearch(`${input.displayName} ${input.username ?? ''}`);
    }
    if (input.username !== undefined) {
      if (input.username) {
        const [taken] = await deps.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, input.username), ne(users.id, user.id)));
        if (taken) throw conflict('username_taken');
      }
      patch.username = input.username || null;
    }
    for (const key of ['bio', 'avatarUrl', 'coverUrl', 'gender', 'educationLevel', 'institution', 'accountType'] as const) {
      if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
    }
    await deps.db.update(users).set(patch).where(eq(users.id, user.id));
    if (patch.displayName || patch.username !== undefined) {
      const [u] = await deps.db.select({ d: users.displayName, n: users.username }).from(users).where(eq(users.id, user.id));
      await deps.db
        .update(users)
        .set({ searchName: normalizeSearch(`${u?.d ?? ''} ${u?.n ?? ''}`) })
        .where(eq(users.id, user.id));
    }
    return c.json(await buildMe(deps, user.id));
  })
  .patch('/prefs', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, updatePrefsSchema);
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    if (!row) throw notFound();
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.appearance) patch.appearance = { ...appearanceOf(row), ...input.appearance };
    if (input.privacy) patch.privacy = { ...(row.privacy ?? {}), ...input.privacy };
    if (input.notifications) patch.notificationPrefs = { ...(row.notificationPrefs ?? {}), ...input.notifications };
    if (input.timezone) {
      if (!isValidTimeZone(input.timezone)) throw badRequest('invalid_timezone');
      patch.timezone = input.timezone;
    }
    if (input.dailyGoalMinutes !== undefined) patch.dailyGoalMinutes = input.dailyGoalMinutes;
    if (input.onboardingDone !== undefined) patch.onboardingDone = input.onboardingDone;
    await deps.db.update(users).set(patch).where(eq(users.id, user.id));
    return c.json(await buildMe(deps, user.id));
  })
  .post('/checkin', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const result = await deps.db.transaction(async (tx) => {
      const streak = await touchStreak(tx, user.id, user.timezone);
      const newAchievements = streak.changed ? await checkAchievements(tx, user.id) : [];
      return { ...streak, newAchievements };
    });
    await deps.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
    return c.json(result);
  })
  .get('/export', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'export', limit: 5, windowSec: 3600, by: 'user' });
    const { db } = c.get('deps');
    const [me, myPosts, myTasks, myNotes, myExams, myCards, myResults, myStudy] = await Promise.all([
      buildMe(c.get('deps'), user.id),
      db
        .select()
        .from(posts)
        .where(and(eq(posts.authorId, user.id), isNull(posts.deletedAt))),
      db.select().from(tasks).where(eq(tasks.userId, user.id)),
      db.select().from(notes).where(eq(notes.userId, user.id)),
      db.select().from(exams).where(eq(exams.userId, user.id)),
      db.select().from(flashcards).where(eq(flashcards.userId, user.id)),
      db.select().from(quizBest).where(eq(quizBest.userId, user.id)),
      db.select().from(studyLog).where(eq(studyLog.userId, user.id)),
    ]);
    c.header('Content-Disposition', `attachment; filename="qubedu-export-${dayKey()}.json"`);
    return c.json({
      exportedAt: new Date().toISOString(),
      profile: me,
      posts: myPosts,
      tasks: myTasks,
      notes: myNotes,
      exams: myExams,
      flashcards: myCards,
      quizResults: myResults,
      studyLog: myStudy,
    });
  })
  .delete('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const { password } = await body(c, z.object({ password: z.string().min(1).max(128) }));
    const [u] = await deps.db.select().from(users).where(eq(users.id, user.id));
    if (!u?.passwordHash || !(await verifyPassword(u.passwordHash, password))) throw badRequest('wrong_password');
    if (u.role === 'root') throw badRequest('root_cannot_be_deleted');
    await deps.db.delete(users).where(eq(users.id, user.id));
    return c.json({ ok: true });
  });

export const userRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, paginationSchema.extend({ q: z.string().trim().max(80).default('') }));
    const cursor = decodeCursor(q.cursor);
    const term = normalizeSearch(q.q);
    const where = and(
      isNull(users.deletedAt),
      ne(users.id, viewer.id),
      term ? or(ilike(users.searchName, `%${term}%`), sql`${users.searchName} % ${term}`) : undefined,
      cursor ? sql`(${users.createdAt}, ${users.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
    );
    const rows = await deps.db
      .select({ ...summaryColumns, createdAt: users.createdAt })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    const items = await withOnline(deps.kv, page.items.map(toSummary));
    return c.json({ items, nextCursor: page.nextCursor } satisfies Page<UserSummary>);
  })
  .get('/suggested', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db
      .select(summaryColumns)
      .from(users)
      .where(and(isNull(users.deletedAt), ne(users.id, viewer.id), sql`${users.id} not in (select followee_id from follows where follower_id = ${viewer.id})`))
      .orderBy(desc(users.xp))
      .limit(12);
    return c.json({ items: await withOnline(deps.kv, rows.map(toSummary)) });
  })
  .get('/leaderboard', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, leaderboardQuery);
    const scopeFilter =
      q.scope === 'following'
        ? or(eq(users.id, viewer.id), inArray(users.id, db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, viewer.id))))
        : undefined;
    let entries: LeaderboardEntry[];
    if (q.period === 'all') {
      const rows = await db
        .select(summaryColumns)
        .from(users)
        .where(and(isNull(users.deletedAt), scopeFilter))
        .orderBy(desc(users.xp), asc(users.createdAt))
        .limit(q.limit);
      entries = rows.map((r, i) => ({ rank: i + 1, user: toSummary(r), score: r.xp }));
    } else {
      const since = dayKey(Date.now() - (q.period === 'week' ? 7 : 30) * 86400_000);
      const score = sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int`;
      const rows = await db
        .select({ ...summaryColumns, score })
        .from(xpLedger)
        .innerJoin(users, eq(users.id, xpLedger.userId))
        .where(and(gte(xpLedger.day, since), isNull(users.deletedAt), scopeFilter))
        .groupBy(users.id)
        .orderBy(desc(score))
        .limit(q.limit);
      entries = rows.map((r, i) => ({ rank: i + 1, user: toSummary(r), score: r.score }));
    }
    return c.json({ items: entries, period: q.period, scope: q.scope });
  })
  .get('/by-username/:username', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const username = c.req.param('username').toLowerCase();
    const [row] = await deps.db
      .select()
      .from(users)
      .where(and(eq(users.username, username), isNull(users.deletedAt)));
    if (!row) throw notFound('user_not_found');
    return c.json(await buildProfile(deps, row, viewer.id));
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [row] = await deps.db
      .select()
      .from(users)
      .where(and(eq(users.id, param(c, 'id')), isNull(users.deletedAt)));
    if (!row) throw notFound('user_not_found');
    return c.json(await buildProfile(deps, row, viewer.id));
  })
  .post('/:id/follow', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'follow', limit: 60, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const targetId = param(c, 'id');
    if (targetId === viewer.id) throw badRequest('cannot_follow_self');
    const [target] = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, targetId), isNull(users.deletedAt)));
    if (!target) throw notFound('user_not_found');
    const [blocked] = await deps.db
      .select({ n: count() })
      .from(blocks)
      .where(and(eq(blocks.blockerId, targetId), eq(blocks.blockedId, viewer.id)));
    if ((blocked?.n ?? 0) > 0) throw notFound('user_not_found');
    const inserted = await deps.db.insert(follows).values({ followerId: viewer.id, followeeId: targetId }).onConflictDoNothing().returning();
    let newAchievements: string[] = [];
    if (inserted.length) {
      newAchievements = await checkAchievements(deps.db, viewer.id);
      await notify(deps, {
        userId: targetId,
        type: 'follow',
        icon: 'user-plus',
        actorId: viewer.id,
        link: `/people/${viewer.id}`,
        data: { name: viewer.displayName },
        pref: 'follows',
      });
    }
    return c.json({ following: true, newAchievements });
  })
  .delete('/:id/follow', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(follows).where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, param(c, 'id'))));
    return c.json({ following: false });
  })
  .post('/:id/block', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const targetId = param(c, 'id');
    if (targetId === viewer.id) throw badRequest('cannot_block_self');
    await db.insert(blocks).values({ blockerId: viewer.id, blockedId: targetId }).onConflictDoNothing();
    await db
      .delete(follows)
      .where(
        or(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, targetId)), and(eq(follows.followerId, targetId), eq(follows.followeeId, viewer.id))),
      );
    return c.json({ blocked: true });
  })
  .delete('/:id/block', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(blocks).where(and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, param(c, 'id'))));
    return c.json({ blocked: false });
  })
  .get('/:id/followers', async (c) => listFollows(c, 'followers'))
  .get('/:id/following', async (c) => listFollows(c, 'following'))
  .get('/:id/groups', async (c) => {
    requireUser(c);
    const { db } = c.get('deps');
    const rows = await db.execute<{ id: string; name: string; kind: string; avatar_url: string | null; member_count: number }>(sql`
      select g.id, g.name, g.kind, g.avatar_url, g.member_count from group_members m
      join groups g on g.id = m.group_id
      where m.user_id = ${param(c, 'id')} and g.deleted_at is null and g.privacy = 'public'
      order by m.joined_at desc limit 50`);
    return c.json({ items: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, avatarUrl: r.avatar_url, memberCount: r.member_count })) });
  })
  .get('/:id/quiz-results', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const userId = param(c, 'id');
    const [u] = await db.select({ privacy: users.privacy }).from(users).where(eq(users.id, userId));
    if (!u) throw notFound();
    if (userId !== viewer.id && (u.privacy as { showStats?: boolean }).showStats === false) return c.json({ items: [] });
    const rows = await db.execute<{ quiz_id: string; title: string; pct: number; correct: number; total: number; updated_at: Date }>(sql`
      select b.quiz_id, q.title, b.pct, b.correct, b.total, b.updated_at from quiz_best b
      join quizzes q on q.id = b.quiz_id where b.user_id = ${userId} and q.deleted_at is null
      order by b.updated_at desc limit 100`);
    return c.json({
      items: rows.map((r) => ({ quizId: r.quiz_id, title: r.title, pct: r.pct, correct: r.correct, total: r.total, at: new Date(r.updated_at).getTime() })),
    });
  });

async function listFollows(c: Ctx, which: 'followers' | 'following') {
  requireUser(c);
  const deps = c.get('deps');
  const userId = param(c, 'id');
  const q = query(c, paginationSchema);
  const cursor = decodeCursor(q.cursor);
  const joinOn = which === 'followers' ? eq(users.id, follows.followerId) : eq(users.id, follows.followeeId);
  const filter = which === 'followers' ? eq(follows.followeeId, userId) : eq(follows.followerId, userId);
  const rows = await deps.db
    .select({ ...summaryColumns, at: follows.createdAt })
    .from(follows)
    .innerJoin(users, joinOn)
    .where(and(filter, cursor ? sql`(${follows.createdAt}, ${users.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined))
    .orderBy(desc(follows.createdAt), desc(users.id))
    .limit(q.limit + 1);
  const page = pageOf(rows, q.limit, (r) => ({ t: r.at, id: r.id }));
  return c.json({ items: await withOnline(deps.kv, page.items.map(toSummary)), nextCursor: page.nextCursor });
}

export const reportRoutes = new Hono<AppEnv>().post('/', async (c) => {
  const user = requireUser(c);
  await checkRate(c, { bucket: 'report', limit: 20, windowSec: 3600, by: 'user' });
  const { db } = c.get('deps');
  const input = await body(c, reportSchema);
  const [row] = await db
    .insert(reports)
    .values({ reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? '' })
    .returning({ id: reports.id });
  return c.json({ id: row!.id }, 201);
});
