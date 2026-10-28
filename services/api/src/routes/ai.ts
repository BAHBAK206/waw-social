import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  aiSolveSchema,
  assistantFeedbackSchema,
  assistantMessageSchema,
  dayKey,
  essayGradeSchema,
  normalizeSearch,
  truncate,
  type AiAnswerDto,
  type AssistantMessageDto,
  type AssistantThreadDto,
  type EssayGradeDto,
} from '@qubedu/shared';
import {
  aiUsage,
  assistantKnowledge,
  assistantMessages,
  assistantThreads,
  courseMaterials,
  courseMembers,
  courseSynonyms,
  courses,
  essayKeys,
  knowledgeChunks,
  quizAttempts,
  quizQuestions,
} from '../db/schema';
import { courseRole } from '../lib/access';
import type { AiChunk } from '../lib/ai';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { getSettings } from '../lib/settings';
import { checkRate } from '../middleware';

/** Enforces the admin kill switch and per-user daily quota. Returns remaining calls after this one. */
export async function consumeQuota(deps: Deps, user: AuthUser): Promise<number> {
  const settings = await getSettings(deps.db, deps.env.AI_DAILY_QUOTA);
  if (!settings.ai.enabled) throw new AppError(503, 'ai_disabled');
  const day = dayKey(Date.now(), user.timezone);
  const [row] = await deps.db
    .insert(aiUsage)
    .values({ userId: user.id, day, count: 1 })
    .onConflictDoUpdate({ target: [aiUsage.userId, aiUsage.day], set: { count: sql`${aiUsage.count} + 1` } })
    .returning({ count: aiUsage.count });
  const used = row?.count ?? 1;
  if (used > settings.ai.dailyQuota) throw new AppError(429, 'ai_quota_exceeded', 'ai_quota_exceeded', { limit: settings.ai.dailyQuota });
  return Math.max(0, settings.ai.dailyQuota - used);
}

/** Candidate chunks from the user's authorized courses (trigram + keyword pre-filter; the AI service re-ranks). */
export async function retrieveChunks(deps: Deps, userId: string, text: string, courseId?: string | null, limit = 30): Promise<AiChunk[]> {
  const term = normalizeSearch(text).slice(0, 300);
  if (!term) return [];
  const words = [...new Set(term.split(' ').filter((w) => w.length >= 3))].slice(0, 12);
  const courseFilter = courseId
    ? eq(knowledgeChunks.courseId, courseId)
    : inArray(knowledgeChunks.courseId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, userId)));
  const wordMatch = words.length
    ? sql`(${sql.join(
        words.map((w) => sql`${knowledgeChunks.searchText} ilike ${`%${w}%`}`),
        sql` or `,
      )})`
    : sql`false`;
  const rows = await deps.db
    .select({
      id: knowledgeChunks.id,
      heading: knowledgeChunks.heading,
      page: knowledgeChunks.page,
      text: knowledgeChunks.text,
      materialId: knowledgeChunks.materialId,
      title: courseMaterials.title,
      visible: courseMaterials.visibleToStudents,
      courseId: knowledgeChunks.courseId,
    })
    .from(knowledgeChunks)
    .innerJoin(courseMaterials, eq(courseMaterials.id, knowledgeChunks.materialId))
    .where(and(courseFilter, sql`(${wordMatch} or similarity(${knowledgeChunks.searchText}, ${term}) > 0.05)`))
    .orderBy(desc(sql`similarity(${knowledgeChunks.searchText}, ${term})`))
    .limit(limit * 2);
  const out: AiChunk[] = [];
  for (const r of rows) {
    if (!r.visible) {
      const role = await courseRole(deps.db, r.courseId, userId);
      if (role === 'student' || !role) continue;
    }
    out.push({ id: r.id, title: r.title, heading: r.heading, page: r.page, text: r.text, materialId: r.materialId });
    if (out.length >= limit) break;
  }
  return out;
}

async function synonymsFor(deps: Deps, userId: string, courseId?: string | null): Promise<Record<string, string[]>> {
  const rows = await deps.db
    .select({ term: courseSynonyms.term, synonyms: courseSynonyms.synonyms })
    .from(courseSynonyms)
    .where(
      courseId
        ? eq(courseSynonyms.courseId, courseId)
        : inArray(courseSynonyms.courseId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, userId))),
    )
    .limit(500);
  return Object.fromEntries(rows.map((r) => [r.term, r.synonyms]));
}

const languageOf = (c: { req: { header: (n: string) => string | undefined } }) => (c.req.header('accept-language') ?? 'ar').slice(0, 2);

export const aiRoutes = new Hono<AppEnv>()
  .get('/courses', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        subject: courses.subject,
        materials: sql<number>`(select count(*)::int from course_materials m where m.course_id = ${courses.id})`,
      })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .where(and(eq(courseMembers.userId, user.id), eq(courses.archived, false)))
      .orderBy(asc(courses.title));
    return c.json({ items: rows });
  })
  .get('/quota', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const settings = await getSettings(deps.db, deps.env.AI_DAILY_QUOTA);
    const [row] = await deps.db
      .select({ count: aiUsage.count })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, user.id), eq(aiUsage.day, dayKey(Date.now(), user.timezone))));
    return c.json({ enabled: settings.ai.enabled, limit: settings.ai.dailyQuota, used: row?.count ?? 0 });
  })
  .post('/solve', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'ai', limit: 20, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, aiSolveSchema);
    if (input.courseId && !(await courseRole(deps.db, input.courseId, user.id))) throw forbidden('not_enrolled');
    const remaining = await consumeQuota(deps, user);
    const [chunks, synonyms] = await Promise.all([
      input.material ? Promise.resolve([]) : retrieveChunks(deps, user.id, input.question, input.courseId),
      synonymsFor(deps, user.id, input.courseId),
    ]);
    const result = await deps.ai.solve({
      question: input.question,
      material: input.material,
      options: input.options,
      chunks,
      synonyms,
      mode: input.mode,
      language: languageOf(c),
    });
    return c.json({ ...result, remainingQuota: remaining } satisfies AiAnswerDto);
  })
  .post('/grade-essay', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'ai', limit: 20, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, essayGradeSchema);
    let modelAnswer = input.modelAnswer ?? '';
    let keyPoints = input.keyPoints ?? [];
    let courseId: string | null = null;
    if (input.keyId) {
      const [k] = await deps.db.select().from(essayKeys).where(eq(essayKeys.id, input.keyId));
      if (!k || !(await courseRole(deps.db, k.courseId, user.id))) throw notFound('essay_key_not_found');
      modelAnswer = k.modelAnswer;
      keyPoints = k.keyPoints;
      courseId = k.courseId;
    }
    if (!keyPoints.length) throw new AppError(400, 'key_points_required');
    await consumeQuota(deps, user);
    const result: EssayGradeDto = await deps.ai.gradeEssay({
      answer: input.answer,
      modelAnswer,
      keyPoints,
      synonyms: await synonymsFor(deps, user.id, courseId),
      language: languageOf(c),
    });
    return c.json(result);
  })
  .post('/explain', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'ai', limit: 20, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const { attemptId, questionId } = await body(c, z.object({ attemptId: z.string().uuid(), questionId: z.string().uuid() }));
    const [attempt] = await deps.db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, user.id)));
    // Explanations are only available after submission, never during an attempt.
    if (!attempt?.submittedAt || !attempt.questionIds.includes(questionId)) throw notFound('attempt_not_found');
    const [q] = await deps.db.select().from(quizQuestions).where(eq(quizQuestions.id, questionId));
    if (!q) throw notFound();
    const correct = Array.isArray(q.answer) ? q.answer.map((a) => (typeof a === 'number' ? q.options[a] : a)).join('، ') : q.options[q.answer as number];
    if (q.explanation) {
      return c.json({
        answer: q.explanation,
        steps: [],
        confidence: 'high',
        kind: 'retrieval',
        sources: [],
        choice: null,
        provider: 'teacher',
        remainingQuota: null,
      } satisfies AiAnswerDto);
    }
    const remaining = await consumeQuota(deps, user);
    const chunks = await retrieveChunks(deps, user.id, `${q.prompt} ${correct ?? ''}`, null, 15);
    const result = await deps.ai.solve({
      question: q.prompt,
      options: q.options.length ? q.options : undefined,
      chunks,
      synonyms: {},
      mode: 'explain',
      language: languageOf(c),
      material: undefined,
    });
    return c.json({ ...result, remainingQuota: remaining } satisfies AiAnswerDto);
  });

/* ───────── Assistant (conversational, knowledge-grounded) ───────── */

const toMessage = (m: typeof assistantMessages.$inferSelect): AssistantMessageDto => ({
  id: m.id,
  threadId: m.threadId,
  role: m.role,
  content: m.content,
  sources: m.sources as unknown as AssistantMessageDto['sources'],
  actions: m.actions,
  rating: m.rating,
  createdAt: m.createdAt.getTime(),
});

async function ownThread(deps: Deps, user: AuthUser, id: string) {
  const [t] = await deps.db
    .select()
    .from(assistantThreads)
    .where(and(eq(assistantThreads.id, id), eq(assistantThreads.userId, user.id)));
  if (!t) throw notFound('thread_not_found');
  return t;
}

export const assistantRoutes = new Hono<AppEnv>()
  .get('/threads', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db.select().from(assistantThreads).where(eq(assistantThreads.userId, user.id)).orderBy(desc(assistantThreads.updatedAt)).limit(100);
    return c.json({ items: rows.map((t): AssistantThreadDto => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.getTime() })) });
  })
  .get('/threads/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const t = await ownThread(deps, user, param(c, 'id'));
    const rows = await deps.db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.threadId, t.id))
      .orderBy(asc(assistantMessages.createdAt))
      .limit(500);
    return c.json({ thread: { id: t.id, title: t.title, updatedAt: t.updatedAt.getTime() }, messages: rows.map(toMessage) });
  })
  .delete('/threads/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(assistantThreads).where(and(eq(assistantThreads.id, param(c, 'id')), eq(assistantThreads.userId, user.id)));
    return c.json({ ok: true });
  })
  .post('/messages', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'assistant', limit: 20, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, assistantMessageSchema);
    const thread = input.threadId
      ? await ownThread(deps, user, input.threadId)
      : (
          await deps.db
            .insert(assistantThreads)
            .values({ userId: user.id, title: truncate(input.text, 60) })
            .returning()
        )[0]!;
    const remaining = await consumeQuota(deps, user);
    const term = normalizeSearch(input.text).slice(0, 300);
    const [history, knowledge, chunks] = await Promise.all([
      deps.db.select().from(assistantMessages).where(eq(assistantMessages.threadId, thread.id)).orderBy(desc(assistantMessages.createdAt)).limit(10),
      deps.db
        .select({ question: assistantKnowledge.question, answer: assistantKnowledge.answer, link: assistantKnowledge.link })
        .from(assistantKnowledge)
        .where(sql`similarity(${assistantKnowledge.searchText}, ${term}) > 0.08 or ${assistantKnowledge.searchText} ilike ${`%${term.slice(0, 40)}%`}`)
        .orderBy(desc(sql`similarity(${assistantKnowledge.searchText}, ${term})`))
        .limit(6),
      retrieveChunks(deps, user.id, input.text, null, 8),
    ]);
    const [userMsg] = await deps.db.insert(assistantMessages).values({ threadId: thread.id, role: 'user', content: input.text }).returning();
    const reply = await deps.ai.assistant({
      message: input.text,
      history: history.reverse().map((h) => ({ role: h.role, content: h.content })),
      knowledge,
      chunks,
      language: input.language ?? languageOf(c),
      userName: user.displayName,
    });
    const [assistantMsg] = await deps.db
      .insert(assistantMessages)
      .values({
        threadId: thread.id,
        role: 'assistant',
        content: reply.content,
        sources: reply.sources as unknown as Record<string, unknown>[],
        actions: reply.actions,
        provider: reply.provider,
      })
      .returning();
    await deps.db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, thread.id));
    return c.json({ threadId: thread.id, userMessage: toMessage(userMsg!), message: toMessage(assistantMsg!), remainingQuota: remaining }, 201);
  })
  .post('/feedback', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, assistantFeedbackSchema);
    const [m] = await db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .innerJoin(assistantThreads, eq(assistantThreads.id, assistantMessages.threadId))
      .where(and(eq(assistantMessages.id, input.messageId), eq(assistantThreads.userId, user.id), eq(assistantMessages.role, 'assistant')));
    if (!m) throw notFound();
    await db
      .update(assistantMessages)
      .set({ rating: input.rating, feedback: input.comment ?? null })
      .where(eq(assistantMessages.id, m.id));
    return c.json({ ok: true });
  })
  .get('/stats', async (c) => {
    requireUser(c);
    const { db } = c.get('deps');
    const [k] = await db.select({ n: count() }).from(assistantKnowledge);
    return c.json({ knowledgeEntries: k?.n ?? 0 });
  });
