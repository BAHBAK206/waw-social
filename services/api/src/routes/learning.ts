import { and, asc, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  buildWeeklyPlan,
  dailyAnswerSchema,
  dayKey,
  examInputSchema,
  flashcardInputSchema,
  flashcardReviewSchema,
  initialSchedulerState,
  noteInputSchema,
  paginationSchema,
  pomodoroStartSchema,
  rateCard,
  studySessionSchema,
  taskInputSchema,
  weeklyPlanQuerySchema,
  XP_RULES,
  xpRewardMeta,
  type AcademicDashboardDto,
  type DailyChallengeDto,
  type ExamDto,
  type FlashcardDto,
  type FlashcardRating,
  type NoteDto,
  type PomodoroCompleteDto,
  type PomodoroSessionDto,
  type StudyInboxItem,
  type StudySessionDto,
  type TaskDto,
} from '@qubedu/shared';
import {
  assignments,
  courseMembers,
  dailyChallenges,
  dailyClaims,
  exams,
  flashcards,
  notes,
  pomodoroSessions,
  studyLog,
  studySessions,
  submissions,
  tasks,
  users,
} from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms } from '../lib/mappers';
import { awardXp, checkAchievements, logStudy, touchStreak } from '../lib/progress';
import { checkRate } from '../middleware';
import { masteryFor } from './quizzes';

const toCard = (r: typeof flashcards.$inferSelect): FlashcardDto => ({
  id: r.id,
  front: r.front,
  back: r.back,
  deck: r.deck,
  topic: r.topic,
  courseId: r.courseId,
  level: r.level,
  ease: r.ease,
  repetitions: r.repetitions,
  lapses: r.lapses,
  intervalDays: r.intervalDays,
  dueAt: r.dueAt.getTime(),
  lastReviewedAt: ms(r.lastReviewedAt),
  createdAt: r.createdAt.getTime(),
});

const toTask = (r: typeof tasks.$inferSelect): TaskDto => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  dueAt: ms(r.dueAt),
  priority: r.priority,
  status: r.status,
  tags: r.tags,
  subtasks: r.subtasks,
  createdAt: r.createdAt.getTime(),
  completedAt: ms(r.completedAt),
});

const toNote = (r: typeof notes.$inferSelect): NoteDto => ({
  id: r.id,
  title: r.title,
  body: r.body,
  color: r.color as NoteDto['color'],
  pinned: r.pinned,
  tags: r.tags,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
});

const toExam = (r: typeof exams.$inferSelect): ExamDto => ({
  id: r.id,
  subject: r.subject,
  day: r.day,
  time: r.time,
  place: r.place,
  notes: r.notes,
  createdAt: r.createdAt.getTime(),
});

const toSession = (r: typeof studySessions.$inferSelect): StudySessionDto => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  day: r.day,
  startTime: r.startTime,
  minutes: r.minutes,
  notes: r.notes,
  completed: r.completed,
});

const toPomo = (r: typeof pomodoroSessions.$inferSelect): PomodoroSessionDto => ({
  id: r.id,
  minutes: r.minutes,
  label: r.label,
  startedAt: r.startedAt.getTime(),
  endsAt: r.endsAt.getTime(),
  completedAt: ms(r.completedAt),
});

async function own<T extends { userId: string }>(row: T | undefined, user: AuthUser): Promise<T> {
  if (!row || row.userId !== user.id) throw notFound();
  return row;
}

/* ───────── Flashcards ───────── */

export const flashcardRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, z.object({ due: z.coerce.boolean().optional(), deck: z.string().max(80).optional() }));
    const rows = await db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.userId, user.id), q.due ? lte(flashcards.dueAt, new Date()) : undefined, q.deck ? eq(flashcards.deck, q.deck) : undefined))
      .orderBy(q.due ? asc(flashcards.dueAt) : desc(flashcards.createdAt))
      .limit(1000);
    const [due] = await db
      .select({ n: count() })
      .from(flashcards)
      .where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, new Date())));
    const decks = await db.select({ deck: flashcards.deck, n: count() }).from(flashcards).where(eq(flashcards.userId, user.id)).groupBy(flashcards.deck);
    return c.json({ items: rows.map(toCard), dueCount: due?.n ?? 0, decks: decks.map((d) => ({ name: d.deck, count: d.n })) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, z.union([flashcardInputSchema, z.object({ cards: z.array(flashcardInputSchema).min(1).max(200) })]));
    const list = 'cards' in input ? input.cards : [input];
    const [{ n }] = (await db.select({ n: count() }).from(flashcards).where(eq(flashcards.userId, user.id))) as [{ n: number }];
    if (n + list.length > 5000) throw conflict('flashcard_limit');
    const s = initialSchedulerState();
    const rows = await db
      .insert(flashcards)
      .values(
        list.map((x) => ({
          userId: user.id,
          front: x.front,
          back: x.back,
          deck: x.deck,
          topic: x.topic ?? null,
          courseId: x.courseId ?? null,
          dueAt: new Date(s.dueAt),
        })),
      )
      .returning();
    return c.json({ items: rows.map(toCard) }, 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const id = param(c, 'id');
    await own((await db.select().from(flashcards).where(eq(flashcards.id, id)))[0], user);
    const input = await body(c, flashcardInputSchema.partial());
    const [row] = await db.update(flashcards).set(input).where(eq(flashcards.id, id)).returning();
    return c.json(toCard(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(flashcards).where(and(eq(flashcards.id, param(c, 'id')), eq(flashcards.userId, user.id)));
    return c.json({ ok: true });
  })
  .post('/:id/review', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'card-review', limit: 300, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    const card = await own((await deps.db.select().from(flashcards).where(eq(flashcards.id, id)))[0], user);
    const { rating } = await body(c, flashcardReviewSchema);
    const next = rateCard(
      {
        level: card.level,
        ease: card.ease,
        repetitions: card.repetitions,
        lapses: card.lapses,
        intervalDays: card.intervalDays,
        dueAt: card.dueAt.getTime(),
        lastReviewedAt: ms(card.lastReviewedAt),
      },
      rating as FlashcardRating,
    );
    const result = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .update(flashcards)
        .set({
          level: next.level,
          ease: next.ease,
          repetitions: next.repetitions,
          lapses: next.lapses,
          intervalDays: next.intervalDays,
          dueAt: new Date(next.dueAt),
          lastReviewedAt: new Date(next.lastReviewedAt!),
        })
        .where(eq(flashcards.id, id))
        .returning();
      await tx
        .update(users)
        .set({ cardReviews: sql`${users.cardReviews} + 1` })
        .where(eq(users.id, user.id));
      await logStudy(tx, user.id, dayKey(Date.now(), user.timezone), { cards: 1 });
      const newAchievements = await checkAchievements(tx, user.id);
      return { card: toCard(row!), newAchievements };
    });
    return c.json(result);
  });

/* ───────── Pomodoro ───────── */

export const pomodoroRoutes = new Hono<AppEnv>()
  .get('/active', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const [row] = await db
      .select()
      .from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, user.id), isNull(pomodoroSessions.completedAt), gte(pomodoroSessions.endsAt, new Date(Date.now() - 3600_000))))
      .orderBy(desc(pomodoroSessions.startedAt))
      .limit(1);
    return c.json({ session: row ? toPomo(row) : null });
  })
  .get('/stats', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const since = new Date(Date.now() - 7 * 86400_000);
    const [week] = await db
      .select({ n: count(), minutes: sql<number>`coalesce(sum(${pomodoroSessions.minutes}), 0)::int` })
      .from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, user.id), gte(pomodoroSessions.startedAt, since), sql`${pomodoroSessions.completedAt} is not null`));
    const [u] = await db.select({ total: users.pomodoroCount }).from(users).where(eq(users.id, user.id));
    return c.json({ weekSessions: week?.n ?? 0, weekMinutes: week?.minutes ?? 0, totalSessions: u?.total ?? 0 });
  })
  .post('/start', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'pomo-start', limit: 20, windowSec: 600, by: 'user' });
    const { db } = c.get('deps');
    const input = await body(c, pomodoroStartSchema);
    await db
      .update(pomodoroSessions)
      .set({ endsAt: new Date() })
      .where(and(eq(pomodoroSessions.userId, user.id), isNull(pomodoroSessions.completedAt), gte(pomodoroSessions.endsAt, new Date())));
    const [row] = await db
      .insert(pomodoroSessions)
      .values({ userId: user.id, minutes: input.minutes, label: input.label ?? null, endsAt: new Date(Date.now() + input.minutes * 60_000) })
      .returning();
    return c.json(toPomo(row!), 201);
  })
  .post('/:id/complete', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const result = await deps.db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(pomodoroSessions)
        .where(and(eq(pomodoroSessions.id, id), eq(pomodoroSessions.userId, user.id)))
        .for('update');
      if (!s) throw notFound('session_not_found');
      const today = dayKey(Date.now(), user.timezone);
      const [todayLog] = await tx
        .select({ minutes: studyLog.minutes })
        .from(studyLog)
        .where(and(eq(studyLog.userId, user.id), eq(studyLog.day, today)));
      if (s.completedAt) {
        const [u] = await tx.select({ xp: users.xp }).from(users).where(eq(users.id, user.id));
        return {
          sessionId: s.id,
          minutes: s.minutes,
          alreadyCompleted: true,
          newAchievements: [],
          todayMinutes: todayLog?.minutes ?? 0,
          ...xpRewardMeta(u?.xp ?? 0, u?.xp ?? 0, 0),
        };
      }
      // Server-enforced duration: completing early is rejected (20s tolerance for clock drift).
      const elapsed = Date.now() - s.startedAt.getTime();
      if (elapsed < s.minutes * 60_000 - 20_000) throw badRequest('session_not_finished');
      if (Date.now() > s.endsAt.getTime() + 6 * 3600_000) throw badRequest('session_expired');
      await tx.update(pomodoroSessions).set({ completedAt: new Date() }).where(eq(pomodoroSessions.id, s.id));
      const xp = s.minutes >= 25 ? XP_RULES.pomodoroComplete : Math.max(1, Math.round((XP_RULES.pomodoroComplete * s.minutes) / 25));
      const award = await awardXp(tx, user.id, xp, 'pomodoro', s.id, today);
      await tx
        .update(users)
        .set({ pomodoroCount: sql`${users.pomodoroCount} + 1`, studyMinutes: sql`${users.studyMinutes} + ${s.minutes}` })
        .where(eq(users.id, user.id));
      await tx
        .update(pomodoroSessions)
        .set({ xpEarned: award.awarded ? xp : 0 })
        .where(eq(pomodoroSessions.id, s.id));
      await logStudy(tx, user.id, today, { minutes: s.minutes });
      await touchStreak(tx, user.id, user.timezone);
      const newAchievements = await checkAchievements(tx, user.id);
      const dto: PomodoroCompleteDto = {
        sessionId: s.id,
        minutes: s.minutes,
        alreadyCompleted: false,
        newAchievements,
        todayMinutes: (todayLog?.minutes ?? 0) + s.minutes,
        ...xpRewardMeta(award.xpBefore, award.xpAfter, award.awarded ? xp : 0),
      };
      return dto;
    });
    return c.json(result);
  })
  .post('/:id/cancel', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db
      .update(pomodoroSessions)
      .set({ endsAt: new Date() })
      .where(and(eq(pomodoroSessions.id, param(c, 'id')), eq(pomodoroSessions.userId, user.id), isNull(pomodoroSessions.completedAt)));
    return c.json({ ok: true });
  });

/* ───────── Daily challenge ───────── */

async function challengeFor(deps: Deps, user: AuthUser | null): Promise<DailyChallengeDto | null> {
  const day = dayKey(Date.now(), user?.timezone ?? 'UTC');
  const [row] = await deps.db.select().from(dailyChallenges).where(eq(dailyChallenges.day, day));
  if (!row) return null;
  const [claim] = user
    ? await deps.db
        .select()
        .from(dailyClaims)
        .where(and(eq(dailyClaims.userId, user.id), eq(dailyClaims.day, day)))
    : [];
  return {
    day,
    type: row.type,
    title: row.title,
    description: row.description,
    question: row.question,
    options: row.options,
    xp: row.xp,
    claimed: !!claim,
    result: claim ? { correct: claim.correct, xpEarned: claim.xpEarned, answer: row.type === 'quiz' ? row.answer : null } : null,
  };
}

export const dailyRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json({ challenge: await challengeFor(c.get('deps'), c.get('user')) }))
  .post('/answer', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'daily', limit: 10, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const { answer } = await body(c, dailyAnswerSchema);
    const day = dayKey(Date.now(), user.timezone);
    await deps.db.transaction(async (tx) => {
      const [row] = await tx.select().from(dailyChallenges).where(eq(dailyChallenges.day, day));
      if (!row) throw notFound('no_challenge_today');
      const correct = row.type === 'social' ? true : answer !== undefined && answer === row.answer;
      if (row.type === 'quiz' && answer === undefined) throw badRequest('answer_required');
      const xpEarned = correct ? Math.min(XP_RULES.dailyChallengeMax, row.xp) : 0;
      const inserted = await tx
        .insert(dailyClaims)
        .values({ userId: user.id, day, correct, answer: answer ?? null, xpEarned })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) throw conflict('already_claimed');
      await awardXp(tx, user.id, xpEarned, 'daily_challenge', day, day);
      await touchStreak(tx, user.id, user.timezone);
      await checkAchievements(tx, user.id);
    });
    return c.json({ challenge: await challengeFor(deps, user) });
  });

/* ───────── Organizer: tasks & notes ───────── */

export const taskRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, z.object({ status: z.enum(['todo', 'doing', 'done', 'open']).optional() }));
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), q.status === 'open' ? sql`${tasks.status} <> 'done'` : q.status ? eq(tasks.status, q.status) : undefined))
      .orderBy(sql`${tasks.status} = 'done'`, asc(sql`coalesce(${tasks.dueAt}, 'infinity'::timestamptz)`), desc(tasks.createdAt))
      .limit(1000);
    return c.json({ items: rows.map(toTask) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, taskInputSchema);
    const [{ n }] = (await db.select({ n: count() }).from(tasks).where(eq(tasks.userId, user.id))) as [{ n: number }];
    if (n >= 3000) throw conflict('task_limit');
    const [row] = await db
      .insert(tasks)
      .values({ ...input, userId: user.id, dueAt: input.dueAt ? new Date(input.dueAt) : null, completedAt: input.status === 'done' ? new Date() : null })
      .returning();
    return c.json(toTask(row!), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const id = param(c, 'id');
    const prev = await own((await db.select().from(tasks).where(eq(tasks.id, id)))[0], user);
    const input = await body(c, taskInputSchema.partial());
    const patch: Partial<typeof tasks.$inferInsert> = {
      ...input,
      dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
      updatedAt: new Date(),
    };
    if (input.status && input.status !== prev.status) patch.completedAt = input.status === 'done' ? new Date() : null;
    const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    return c.json(toTask(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(tasks).where(and(eq(tasks.id, param(c, 'id')), eq(tasks.userId, user.id)));
    return c.json({ ok: true });
  });

export const noteRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db.select().from(notes).where(eq(notes.userId, user.id)).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(2000);
    return c.json({ items: rows.map(toNote) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, noteInputSchema);
    const [row] = await db
      .insert(notes)
      .values({ ...input, userId: user.id })
      .returning();
    return c.json(toNote(row!), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const id = param(c, 'id');
    await own((await db.select().from(notes).where(eq(notes.id, id)))[0], user);
    const input = await body(c, noteInputSchema.partial());
    const [row] = await db
      .update(notes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return c.json(toNote(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(notes).where(and(eq(notes.id, param(c, 'id')), eq(notes.userId, user.id)));
    return c.json({ ok: true });
  });

/* ───────── Exams & study sessions ───────── */

function icsEscape(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export const examRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db.select().from(exams).where(eq(exams.userId, user.id)).orderBy(asc(exams.day), asc(exams.time));
    return c.json({ items: rows.map(toExam) });
  })
  .get('/calendar.ics', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db.select().from(exams).where(eq(exams.userId, user.id)).orderBy(asc(exams.day));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Qubedu//Exams//AR', 'CALSCALE:GREGORIAN'];
    for (const e of rows) {
      const d = e.day.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${e.id}@qubedu`, `DTSTAMP:${stamp}`);
      if (e.time) {
        const t = e.time.replace(':', '');
        lines.push(`DTSTART;TZID=${user.timezone}:${d}T${t}00`, `DURATION:PT2H`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${d}`);
      }
      lines.push(`SUMMARY:${icsEscape(e.subject)}`);
      if (e.place) lines.push(`LOCATION:${icsEscape(e.place)}`);
      if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
      lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.subject)}`, 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="qubedu-exams.ics"',
        'Cache-Control': 'no-store',
      },
    });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, examInputSchema);
    const [row] = await db
      .insert(exams)
      .values({ ...input, userId: user.id })
      .returning();
    return c.json(toExam(row!), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const id = param(c, 'id');
    await own((await db.select().from(exams).where(eq(exams.id, id)))[0], user);
    const input = await body(c, examInputSchema.partial());
    const [row] = await db.update(exams).set(input).where(eq(exams.id, id)).returning();
    return c.json(toExam(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(exams).where(and(eq(exams.id, param(c, 'id')), eq(exams.userId, user.id)));
    return c.json({ ok: true });
  });

export const studySessionRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, z.object({ from: z.string().optional(), to: z.string().optional() }));
    const rows = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.userId, user.id), q.from ? gte(studySessions.day, q.from) : undefined, q.to ? lte(studySessions.day, q.to) : undefined))
      .orderBy(asc(studySessions.day), asc(studySessions.startTime))
      .limit(1000);
    return c.json({ items: rows.map(toSession) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, studySessionSchema);
    const [row] = await db
      .insert(studySessions)
      .values({ ...input, userId: user.id })
      .returning();
    return c.json(toSession(row!), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const prev = await own((await deps.db.select().from(studySessions).where(eq(studySessions.id, id)))[0], user);
    const input = await body(c, studySessionSchema.partial());
    const [row] = await deps.db.update(studySessions).set(input).where(eq(studySessions.id, id)).returning();
    if (input.completed && !prev.completed) {
      await deps.db.transaction(async (tx) => {
        await logStudy(tx, user.id, dayKey(Date.now(), user.timezone), { minutes: row!.minutes });
        await tx
          .update(users)
          .set({ studyMinutes: sql`${users.studyMinutes} + ${row!.minutes}` })
          .where(eq(users.id, user.id));
        await touchStreak(tx, user.id, user.timezone);
      });
    }
    return c.json(toSession(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(studySessions).where(and(eq(studySessions.id, param(c, 'id')), eq(studySessions.userId, user.id)));
    return c.json({ ok: true });
  });

/* ───────── Academic hub: dashboard & weekly plan ───────── */

async function pendingAssignments(deps: Deps, userId: string, horizonDays: number) {
  return deps.db
    .select({ id: assignments.id, title: assignments.title, dueAt: assignments.dueAt, releaseAt: assignments.releaseAt, courseId: assignments.courseId })
    .from(assignments)
    .innerJoin(courseMembers, and(eq(courseMembers.courseId, assignments.courseId), eq(courseMembers.userId, userId), eq(courseMembers.role, 'student')))
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, userId)))
    .where(
      and(
        eq(assignments.state, 'published'),
        isNull(submissions.id),
        sql`${assignments.dueAt} is not null`,
        gte(assignments.dueAt, new Date(Date.now() - 86400_000)),
        lte(assignments.dueAt, new Date(Date.now() + horizonDays * 86400_000)),
        sql`(${assignments.releaseAt} is null or ${assignments.releaseAt} <= now() + interval '14 days')`,
      ),
    )
    .orderBy(asc(assignments.dueAt));
}

export const academicRoutes = new Hono<AppEnv>()
  .get('/dashboard', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const { db } = deps;
    const today = dayKey(Date.now(), user.timezone);
    const [[due], me, upcoming, openTasks, weak, week, assigns, sessionsToday] = await Promise.all([
      db
        .select({ n: count() })
        .from(flashcards)
        .where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, new Date()))),
      db.select({ goal: users.dailyGoalMinutes, streak: users.streak }).from(users).where(eq(users.id, user.id)),
      db
        .select()
        .from(exams)
        .where(and(eq(exams.userId, user.id), gte(exams.day, today)))
        .orderBy(asc(exams.day))
        .limit(5),
      db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, user.id),
            sql`${tasks.status} <> 'done'`,
            sql`${tasks.dueAt} is not null`,
            lte(tasks.dueAt, new Date(Date.now() + 2 * 86400_000)),
          ),
        )
        .orderBy(asc(tasks.dueAt))
        .limit(10),
      masteryFor(deps, user.id),
      db
        .select({ day: studyLog.day, minutes: studyLog.minutes })
        .from(studyLog)
        .where(and(eq(studyLog.userId, user.id), gte(studyLog.day, addDays(today, -6))))
        .orderBy(asc(studyLog.day)),
      pendingAssignments(deps, user.id, 7),
      db
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.userId, user.id), eq(studySessions.day, today), eq(studySessions.completed, false))),
    ]);
    const weakTopics = weak.filter((m) => m.level === 'needs_review' || m.level === 'developing').slice(0, 5);
    const inbox: StudyInboxItem[] = [];
    if ((due?.n ?? 0) > 0) inbox.push({ kind: 'flashcards', title: 'flashcards', dueAt: null, link: '/academic?tab=cards', count: due!.n });
    for (const s of sessionsToday) inbox.push({ kind: 'session', title: s.title, dueAt: null, link: '/academic?tab=sessions', refId: s.id });
    for (const a of assigns)
      inbox.push({ kind: 'assignment', title: a.title, dueAt: ms(a.dueAt), link: `/school/${a.courseId}?assignment=${a.id}`, refId: a.id });
    for (const t of openTasks) inbox.push({ kind: 'task', title: t.title, dueAt: ms(t.dueAt), link: '/organizer?tab=tasks', refId: t.id });
    for (const e of upcoming.slice(0, 2))
      inbox.push({ kind: 'exam', title: e.subject, dueAt: Date.parse(`${e.day}T${e.time ?? '09:00'}:00Z`), link: '/academic?tab=exams', refId: e.id });
    for (const w of weakTopics.slice(0, 3))
      inbox.push({ kind: 'weak-topic', title: w.topic, dueAt: null, link: `/quiz?adaptive=1&topic=${encodeURIComponent(w.topic)}` });
    const weekMap = new Map(week.map((w) => [w.day, w.minutes]));
    const dto: AcademicDashboardDto = {
      today,
      dueCards: due?.n ?? 0,
      studyMinutesToday: weekMap.get(today) ?? 0,
      dailyGoalMinutes: me[0]?.goal ?? 60,
      streak: me[0]?.streak ?? 0,
      inbox,
      upcomingExams: upcoming.map(toExam),
      weakTopics,
      weeklyMinutes: Array.from({ length: 7 }, (_, i) => {
        const day = addDays(today, i - 6);
        return { day, minutes: weekMap.get(day) ?? 0 };
      }),
    };
    return c.json(dto);
  })
  .get('/weekly-plan', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, weeklyPlanQuerySchema);
    const today = dayKey(Date.now(), user.timezone);
    const horizon = q.days ?? 7;
    const [examRows, taskRows, [due], assigns, sessionRows, me] = await Promise.all([
      deps.db
        .select()
        .from(exams)
        .where(and(eq(exams.userId, user.id), gte(exams.day, today))),
      deps.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, user.id), sql`${tasks.status} <> 'done'`)),
      deps.db
        .select({ n: count() })
        .from(flashcards)
        .where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, new Date(Date.now() + 86400_000)))),
      pendingAssignments(deps, user.id, horizon + 1),
      deps.db
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.userId, user.id), gte(studySessions.day, today), lte(studySessions.day, addDays(today, horizon - 1)))),
      deps.db.select({ goal: users.dailyGoalMinutes }).from(users).where(eq(users.id, user.id)),
    ]);
    const plan = buildWeeklyPlan({
      today,
      horizonDays: horizon,
      dailyBudgetMinutes: q.budget ?? me[0]?.goal ?? 90,
      exams: examRows.map((e) => ({ id: e.id, subject: e.subject, day: e.day })),
      assignments: assigns.map((a) => ({
        id: a.id,
        title: a.title,
        dueDay: dayKey(a.dueAt!, user.timezone),
        releaseDay: a.releaseAt ? dayKey(a.releaseAt, user.timezone) : null,
      })),
      tasks: taskRows.map((t) => ({ id: t.id, title: t.title, dueDay: t.dueAt ? dayKey(t.dueAt, user.timezone) : null, done: t.status === 'done' })),
      dueCards: due?.n ?? 0,
      sessions: sessionRows.map((s) => ({ id: s.id, title: s.title, day: s.day, minutes: s.minutes })),
    });
    return c.json(plan);
  })
  .get('/study-log', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, paginationSchema.extend({ days: z.coerce.number().int().min(1).max(366).default(90) }));
    const since = dayKey(Date.now() - q.days * 86400_000, user.timezone);
    const rows = await db
      .select()
      .from(studyLog)
      .where(and(eq(studyLog.userId, user.id), gte(studyLog.day, since)))
      .orderBy(asc(studyLog.day));
    return c.json({ items: rows.map((r) => ({ day: r.day, minutes: r.minutes, quizzes: r.quizzes, cards: r.cards })) });
  });
