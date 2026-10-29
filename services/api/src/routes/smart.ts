import {
  addDays,
  applyPlanSchema,
  buildStudyPack,
  dayKey,
  definitionsIn,
  focusStartSchema,
  glossaryInputSchema,
  glossaryQuerySchema,
  reviewAfterAnswer,
  reviewAnswerSchema,
  studyPackSaveSchema,
  studyPackSchema,
  type DailyReviewDto,
  type FocusStatusDto,
  type GlossaryTermDto,
  type RecurringMistakeDto,
  type ReviewAnswerResultDto,
  type StudyPackDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  curriculumNodes,
  flashcards,
  focusSessions,
  glossaryTerms,
  notes,
  objectiveSamples,
  questionReviews,
  quizQuestions,
  studySessions,
  users,
} from '../db/schema';
import { courseRole } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { isCorrect, type GivenAnswer } from '../lib/grading';
import { body, param, query, requireUser } from '../lib/http';
import { logStudy } from '../lib/progress';
import { checkRate } from '../middleware';
import { computeWeeklyPlan, toCard } from './learning';
import { lessonSource } from './teacher';

const REVIEW_CARDS = 20;
const REVIEW_QUESTIONS = 15;

/* ───────── Focus mode ───────── */

/** Closes sessions whose time is up and returns the one still running. */
async function settleFocus(deps: Deps, user: AuthUser) {
  const now = new Date();
  const open = await deps.db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, user.id), isNull(focusSessions.endedAt)));
  let active: (typeof open)[number] | null = null;
  for (const s of open) {
    if (s.endsAt > now) {
      active = s;
      continue;
    }
    await closeFocus(deps, user, s, s.endsAt);
  }
  return active;
}

async function closeFocus(deps: Deps, user: AuthUser, s: typeof focusSessions.$inferSelect, at: Date) {
  const minutes = Math.max(0, Math.min(180, Math.round((Math.min(at.getTime(), s.endsAt.getTime()) - s.startedAt.getTime()) / 60_000)));
  const [done] = await deps.db
    .update(focusSessions)
    .set({ endedAt: at, minutes })
    .where(and(eq(focusSessions.id, s.id), isNull(focusSessions.endedAt)))
    .returning({ id: focusSessions.id });
  if (!done) return minutes;
  await deps.db.transaction(async (tx) => {
    await logStudy(tx, user.id, dayKey(s.startedAt.getTime(), user.timezone), { minutes });
    await tx
      .update(users)
      .set({ studyMinutes: sql`${users.studyMinutes} + ${minutes}` })
      .where(eq(users.id, user.id));
  });
  return minutes;
}

async function focusStatus(deps: Deps, user: AuthUser): Promise<FocusStatusDto> {
  const active = await settleFocus(deps, user);
  const today = dayKey(Date.now(), user.timezone);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await deps.db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, user.id), gte(focusSessions.startedAt, since)));
  const done = rows.filter((r) => r.endedAt);
  return {
    active: active
      ? {
          id: active.id,
          startedAt: active.startedAt.getTime(),
          endsAt: active.endsAt.getTime(),
          minutes: Math.round((active.endsAt.getTime() - active.startedAt.getTime()) / 60_000),
        }
      : null,
    todayMinutes: done.filter((r) => dayKey(r.startedAt.getTime(), user.timezone) === today).reduce((a, r) => a + r.minutes, 0),
    weekMinutes: done.reduce((a, r) => a + r.minutes, 0),
    weekSessions: done.length,
    mutedWeek: rows.reduce((a, r) => a + r.muted, 0),
  };
}

export const focusRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await focusStatus(c.get('deps'), requireUser(c))))
  .post('/start', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await checkRate(c, { bucket: 'focus-start', limit: 30, windowSec: 3600, by: 'user' });
    const { minutes } = await body(c, focusStartSchema);
    if (await settleFocus(deps, user)) return c.json(await focusStatus(deps, user));
    await deps.db.insert(focusSessions).values({ userId: user.id, endsAt: new Date(Date.now() + minutes * 60_000) });
    return c.json(await focusStatus(deps, user), 201);
  })
  .post('/stop', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const active = await settleFocus(deps, user);
    if (active) await closeFocus(deps, user, active, new Date());
    return c.json(await focusStatus(deps, user));
  });

/* ───────── Daily review, recurring mistakes, study pack, schedule ───────── */

async function weakObjectives(deps: Deps, userId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await deps.db
    .select({
      id: objectiveSamples.objectiveId,
      title: curriculumNodes.title,
      correct: sql<number>`sum(${objectiveSamples.correct})::int`,
      total: sql<number>`sum(${objectiveSamples.total})::int`,
    })
    .from(objectiveSamples)
    .innerJoin(curriculumNodes, eq(curriculumNodes.id, objectiveSamples.objectiveId))
    .where(and(eq(objectiveSamples.userId, userId), gte(objectiveSamples.createdAt, since)))
    .groupBy(objectiveSamples.objectiveId, curriculumNodes.title);
  return rows
    .map((r) => ({ id: r.id, title: r.title, pct: Math.round((r.correct / Math.max(1, r.total)) * 100), total: r.total }))
    .filter((r) => r.total >= 3 && r.pct < 60)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);
}

export async function dailyReview(deps: Deps, user: AuthUser): Promise<DailyReviewDto> {
  const now = new Date();
  const [cards, questions, weak] = await Promise.all([
    deps.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, now)))
      .orderBy(asc(flashcards.dueAt))
      .limit(REVIEW_CARDS),
    deps.db
      .select({
        id: quizQuestions.id,
        quizId: quizQuestions.quizId,
        type: quizQuestions.type,
        prompt: quizQuestions.prompt,
        options: quizQuestions.options,
        topic: quizQuestions.topic,
        imageUrl: quizQuestions.imageUrl,
        misses: questionReviews.misses,
      })
      .from(questionReviews)
      .innerJoin(quizQuestions, eq(quizQuestions.id, questionReviews.questionId))
      .where(and(eq(questionReviews.userId, user.id), lte(questionReviews.dueAt, now)))
      .orderBy(asc(questionReviews.dueAt))
      .limit(REVIEW_QUESTIONS),
    weakObjectives(deps, user.id),
  ]);
  const total = cards.length + questions.length;
  return {
    cards: cards.map(toCard),
    questions: questions.map((q) => ({ ...q, options: q.type === 'short' ? [] : q.options })),
    weakObjectives: weak,
    minutes: total ? Math.max(1, Math.round(cards.length * 0.4 + questions.length)) : 0,
    total,
  };
}

async function packSource(deps: Deps, user: AuthUser, input: z.infer<typeof studyPackSchema>, locale: string) {
  const parts: string[] = [];
  if (input.text) parts.push(input.text);
  if (input.noteId) {
    const [n] = await deps.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.userId, user.id)));
    if (!n) throw notFound('note_not_found');
    parts.push(`${n.title}\n${n.body}`);
  }
  if (input.videoId) parts.push((await lessonSource(deps, user, input.videoId, input.language ?? locale)).text);
  const text = parts.join('\n\n').slice(0, 60_000);
  if (text.trim().length < 80) throw new AppError(422, 'source_too_short');
  return text;
}

export const studyRoutes = new Hono<AppEnv>()
  .get('/review', async (c) => c.json(await dailyReview(c.get('deps'), requireUser(c))))
  .post('/review/questions/:id/answer', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'review-answer', limit: 300, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const qid = param(c, 'id');
    const { answer } = await body(c, reviewAnswerSchema);
    const [row] = await deps.db
      .select({ r: questionReviews, q: quizQuestions })
      .from(questionReviews)
      .innerJoin(quizQuestions, eq(quizQuestions.id, questionReviews.questionId))
      .where(and(eq(questionReviews.userId, user.id), eq(questionReviews.questionId, qid)));
    if (!row) throw notFound('review_not_found');
    const { r, q } = row;
    const correct = isCorrect(
      { id: q.id, type: q.type, answer: q.answer, points: q.points, topic: q.topic, explanation: q.explanation },
      answer as GivenAnswer,
    );
    const now = Date.now();
    const next = reviewAfterAnswer(
      {
        level: r.level,
        ease: r.ease,
        repetitions: r.repetitions,
        lapses: r.lapses,
        intervalDays: r.intervalDays,
        dueAt: r.dueAt.getTime(),
        lastReviewedAt: r.lastReviewedAt?.getTime() ?? null,
        misses: r.misses,
      },
      correct,
      now,
    )!;
    await deps.db.transaction(async (tx) => {
      await tx
        .update(questionReviews)
        .set({
          ease: next.ease,
          level: next.level,
          repetitions: next.repetitions,
          lapses: next.lapses,
          intervalDays: next.intervalDays,
          misses: next.misses,
          dueAt: new Date(next.dueAt),
          lastResult: correct,
          lastReviewedAt: new Date(now),
        })
        .where(and(eq(questionReviews.userId, user.id), eq(questionReviews.questionId, qid)));
      await logStudy(tx, user.id, dayKey(now, user.timezone), { cards: 1 });
    });
    const dto: ReviewAnswerResultDto = { correct, answer: q.answer, explanation: q.explanation, nextDueAt: next.dueAt };
    return c.json(dto);
  })
  .get('/mistakes', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db
      .select({
        questionId: quizQuestions.id,
        prompt: quizQuestions.prompt,
        topic: quizQuestions.topic,
        quizId: quizQuestions.quizId,
        objectiveId: quizQuestions.objectiveId,
        objectiveTitle: curriculumNodes.title,
        misses: questionReviews.misses,
      })
      .from(questionReviews)
      .innerJoin(quizQuestions, eq(quizQuestions.id, questionReviews.questionId))
      .leftJoin(curriculumNodes, eq(curriculumNodes.id, quizQuestions.objectiveId))
      .where(and(eq(questionReviews.userId, user.id), gte(questionReviews.misses, 2)))
      .orderBy(desc(questionReviews.misses), desc(questionReviews.lastReviewedAt))
      .limit(30);
    const items: RecurringMistakeDto[] = rows.map((r) => ({
      ...r,
      prompt: r.prompt.slice(0, 300),
      practiceLink: r.objectiveId ? `/curriculum/${r.objectiveId}` : r.quizId ? `/quiz?q=${encodeURIComponent(r.topic ?? '')}` : null,
    }));
    return c.json({ items });
  })
  .post('/pack', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'study-pack', limit: 20, windowSec: 3600, by: 'user' });
    const input = await body(c, studyPackSchema);
    const text = await packSource(c.get('deps'), user, input, 'en');
    const pack: StudyPackDto = buildStudyPack(text);
    if (!pack.keyTerms.length && !pack.flashcards.length) throw new AppError(422, 'source_too_short');
    return c.json(pack);
  })
  .post('/pack/save', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, studyPackSaveSchema);
    const existing = await db
      .select({ front: flashcards.front })
      .from(flashcards)
      .where(and(eq(flashcards.userId, user.id), eq(flashcards.deck, input.deck)));
    const seen = new Set(existing.map((e) => e.front.trim().toLowerCase()));
    const cards = input.cards.filter((x) => !seen.has(x.front.trim().toLowerCase()) && seen.add(x.front.trim().toLowerCase()));
    if (cards.length) await db.insert(flashcards).values(cards.map((x) => ({ userId: user.id, front: x.front, back: x.back, deck: input.deck })));
    let terms = 0;
    if (input.subject && input.terms.length) {
      const have = await db
        .select({ term: glossaryTerms.term })
        .from(glossaryTerms)
        .where(and(eq(glossaryTerms.userId, user.id), isNull(glossaryTerms.courseId), eq(glossaryTerms.subject, input.subject)));
      const known = new Set(have.map((h) => h.term.trim().toLowerCase()));
      const fresh = input.terms.filter((t) => !known.has(t.term.trim().toLowerCase()) && known.add(t.term.trim().toLowerCase()));
      if (fresh.length)
        await db
          .insert(glossaryTerms)
          .values(fresh.map((t) => ({ userId: user.id, subject: input.subject!, term: t.term, definition: t.definition, source: 'lesson' as const })));
      terms = fresh.length;
    }
    return c.json({ cards: cards.length, terms }, 201);
  })
  .post('/schedule', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const q = await body(c, applyPlanSchema);
    const plan = await computeWeeklyPlan(deps, user, q);
    const today = dayKey(Date.now(), user.timezone);
    const days = plan.days.map((d) => d.day);
    const existing = await deps.db
      .select({ title: studySessions.title, day: studySessions.day })
      .from(studySessions)
      .where(and(eq(studySessions.userId, user.id), gte(studySessions.day, today), lte(studySessions.day, addDays(today, 14))));
    const have = new Set(existing.map((e) => `${e.day}\u0000${e.title}`));
    const rows: (typeof studySessions.$inferInsert)[] = [];
    for (const d of plan.days) {
      for (const b of d.blocks) {
        if (b.kind === 'session' || b.kind === 'review') continue;
        const key = `${d.day}\u0000${b.title}`;
        if (have.has(key)) continue;
        have.add(key);
        rows.push({ userId: user.id, title: b.title.slice(0, 200), subject: b.kind === 'exam' ? b.title.slice(0, 80) : null, day: d.day, minutes: b.minutes });
      }
    }
    if (rows.length) await deps.db.insert(studySessions).values(rows.slice(0, 60));
    return c.json({ created: Math.min(rows.length, 60), skipped: plan.overflow.length, days: days.length }, 201);
  });

/* ───────── Glossary ───────── */

const toTerm = (r: typeof glossaryTerms.$inferSelect & { authorName: string }, viewerId: string): GlossaryTermDto => ({
  id: r.id,
  subject: r.subject,
  term: r.term,
  definition: r.definition,
  courseId: r.courseId,
  source: r.source,
  mine: r.userId === viewerId,
  authorName: r.authorName,
});

export const glossaryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, glossaryQuerySchema);
    const mine = and(eq(glossaryTerms.userId, user.id), isNull(glossaryTerms.courseId));
    let scope = mine;
    if (q.courseId) {
      if (!(await courseRole(db, q.courseId, user.id))) throw forbidden('not_enrolled');
      scope = and(eq(glossaryTerms.courseId, q.courseId));
    }
    const memberCourses = sql`${glossaryTerms.courseId} in (select course_id from course_members where user_id = ${user.id})`;
    const where = q.courseId ? scope : or(mine, memberCourses);
    const rows = await db
      .select({ g: glossaryTerms, authorName: users.displayName })
      .from(glossaryTerms)
      .innerJoin(users, eq(users.id, glossaryTerms.userId))
      .where(
        and(
          where,
          q.subject ? eq(glossaryTerms.subject, q.subject) : undefined,
          q.q ? sql`lower(${glossaryTerms.term}) like ${`%${q.q.toLowerCase()}%`}` : undefined,
        ),
      )
      .orderBy(asc(glossaryTerms.subject), asc(glossaryTerms.term))
      .limit(500);
    const subjects = [...new Set(rows.map((r) => r.g.subject))];
    return c.json({ items: rows.map((r) => toTerm({ ...r.g, authorName: r.authorName }, user.id)), subjects });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, glossaryInputSchema);
    if (input.courseId) {
      const role = await courseRole(db, input.courseId, user.id);
      if (role !== 'teacher' && role !== 'assistant') throw forbidden('course_staff_only');
    }
    const [dup] = await db
      .select({ id: glossaryTerms.id })
      .from(glossaryTerms)
      .where(
        and(
          input.courseId ? eq(glossaryTerms.courseId, input.courseId) : and(eq(glossaryTerms.userId, user.id), isNull(glossaryTerms.courseId)),
          eq(glossaryTerms.subject, input.subject),
          sql`lower(${glossaryTerms.term}) = ${input.term.toLowerCase()}`,
        ),
      );
    if (dup) throw badRequest('term_exists');
    const [row] = await db
      .insert(glossaryTerms)
      .values({ userId: user.id, courseId: input.courseId ?? null, subject: input.subject, term: input.term, definition: input.definition })
      .returning();
    return c.json(toTerm({ ...row!, authorName: user.displayName }, user.id), 201);
  })
  .post('/suggest', async (c) => {
    requireUser(c);
    const { text } = await body(c, z.object({ text: z.string().trim().min(40).max(60_000) }));
    return c.json({ items: definitionsIn(text).slice(0, 40) });
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, glossaryInputSchema.pick({ term: true, definition: true, subject: true }).partial());
    const [row] = await db
      .update(glossaryTerms)
      .set(input)
      .where(and(eq(glossaryTerms.id, param(c, 'id')), eq(glossaryTerms.userId, user.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(toTerm({ ...row, authorName: user.displayName }, user.id));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(glossaryTerms).where(and(eq(glossaryTerms.id, param(c, 'id')), eq(glossaryTerms.userId, user.id)));
    return c.json({ ok: true });
  });
