import { and, asc, avg, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  adaptiveQuizSchema,
  computeMastery,
  dayKey,
  hasPermission,
  normalizeSearch,
  quizInputSchema,
  quizListQuerySchema,
  startAttemptSchema,
  submitAttemptSchema,
  topicKey,
  XP_RULES,
  xpForQuizScore,
  xpRewardMeta,
  type MasteryDto,
  type QuizAttemptDto,
  type QuizEditorDto,
  type QuizQuestionPublic,
  type QuizResultDto,
  type QuizSummaryDto,
} from '@qubedu/shared';
import { courseMembers, eduMaterials, eduSections, quizAttempts, quizBest, quizQuestions, quizzes, topicSamples, users, videos } from '../db/schema';
import { courseRole } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { grade, seededShuffle, type GivenAnswer, type GradableQuestion } from '../lib/grading';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, toSummary } from '../lib/mappers';
import { awardXp, checkAchievements, logStudy, touchStreak, xpEarnedToday } from '../lib/progress';
import { checkRate } from '../middleware';

const GRACE_MS = 45_000;

const authorCols = {
  authorId: users.id,
  authorDisplayName: users.displayName,
  authorUsername: users.username,
  authorAvatarUrl: users.avatarUrl,
  authorAccountType: users.accountType,
  authorTeacherVerifiedAt: users.teacherVerifiedAt,
  authorLevel: users.level,
  authorXp: users.xp,
  authorBadge: users.badge,
};

type QuizRow = typeof quizzes.$inferSelect;

function canManageQuizzes(user: AuthUser) {
  return hasPermission(user.role, user.permissions, 'quizzes.manage');
}

async function canEditQuiz(deps: Deps, user: AuthUser, quiz: QuizRow) {
  if (canManageQuizzes(user) || quiz.createdBy === user.id) return true;
  if (quiz.courseId) {
    const r = await courseRole(deps.db, quiz.courseId, user.id);
    return r === 'teacher' || r === 'assistant';
  }
  return false;
}

/** Visible: published + (no course or member of course); creators and staff see everything they own/manage. */
async function canSeeQuiz(deps: Deps, user: AuthUser | null, quiz: QuizRow) {
  if (quiz.deletedAt) return false;
  if (user && (await canEditQuiz(deps, user, quiz))) return true;
  if (!quiz.published) return false;
  if (quiz.courseId) return !!user && !!(await courseRole(deps.db, quiz.courseId, user.id));
  return true;
}

async function loadQuiz(deps: Deps, id: string) {
  const [q] = await deps.db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, id), isNull(quizzes.deletedAt)));
  if (!q) throw notFound('quiz_not_found');
  return q;
}

async function summaries(deps: Deps, viewer: AuthUser | null, ids: string[]): Promise<QuizSummaryDto[]> {
  if (!ids.length) return [];
  const rows = await deps.db
    .select({ q: quizzes, s: { id: eduSections.id, name: eduSections.name }, m: { id: eduMaterials.id, name: eduMaterials.name }, ...authorCols })
    .from(quizzes)
    .leftJoin(eduSections, eq(eduSections.id, quizzes.sectionId))
    .leftJoin(eduMaterials, eq(eduMaterials.id, quizzes.materialId))
    .leftJoin(users, eq(users.id, quizzes.createdBy))
    .where(inArray(quizzes.id, ids));
  const best = viewer
    ? await deps.db
        .select()
        .from(quizBest)
        .where(and(eq(quizBest.userId, viewer.id), inArray(quizBest.quizId, ids)))
    : [];
  const bestMap = new Map(best.map((b) => [b.quizId, b]));
  const byId = new Map(rows.map((r) => [r.q.id, r]));
  const out: QuizSummaryDto[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const b = bestMap.get(id);
    out.push({
      id: r.q.id,
      title: r.q.title,
      description: r.q.description,
      kind: r.q.kind,
      difficulty: r.q.difficulty,
      durationSec: r.q.durationSec,
      questionCount: r.q.questionCount,
      section: r.s?.id ? { id: r.s.id, name: r.s.name } : null,
      material: r.m?.id ? { id: r.m.id, name: r.m.name } : null,
      courseId: r.q.courseId,
      scheduledAt: r.q.scheduledAt?.getTime() ?? null,
      published: r.q.published,
      author: r.authorId ? toSummary(pickSummary('author', r as unknown as Record<string, unknown>)) : null,
      attempts: r.q.attemptCount,
      myBest: b ? { pct: b.pct, correct: b.correct, total: b.total, at: b.updatedAt.getTime() } : null,
      createdAt: r.q.createdAt.getTime(),
      canEdit: viewer ? canManageQuizzes(viewer) || r.q.createdBy === viewer.id : false,
    });
  }
  return out;
}

async function saveQuestions(tx: Parameters<Parameters<Deps['db']['transaction']>[0]>[0], quizId: string, input: ReturnType<typeof quizInputSchema.parse>) {
  await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, quizId));
  await tx.insert(quizQuestions).values(
    input.questions.map((q, i) => ({
      quizId,
      position: i,
      type: q.type,
      prompt: q.prompt,
      imageUrl: q.imageUrl ?? null,
      options: q.type === 'short' ? [] : q.options,
      answer: q.answer,
      explanation: q.explanation ?? null,
      topic: q.topic?.trim() || null,
      points: q.points,
    })),
  );
}

function publicQuestion(q: typeof quizQuestions.$inferSelect): QuizQuestionPublic {
  return { id: q.id, type: q.type, prompt: q.prompt, imageUrl: q.imageUrl, options: q.options, topic: q.topic, points: q.points };
}

async function attemptDto(deps: Deps, viewer: AuthUser, attempt: typeof quizAttempts.$inferSelect, quiz: QuizSummaryDto | null): Promise<QuizAttemptDto> {
  const qs = await deps.db.select().from(quizQuestions).where(inArray(quizQuestions.id, attempt.questionIds));
  const map = new Map(qs.map((q) => [q.id, q]));
  const fallbackQuiz: QuizSummaryDto = {
    id: 'adaptive',
    title: 'adaptive',
    description: '',
    kind: 'quiz',
    difficulty: 'medium',
    durationSec: Math.round((attempt.expiresAt.getTime() - attempt.startedAt.getTime()) / 1000),
    questionCount: attempt.questionIds.length,
    section: null,
    material: null,
    courseId: null,
    scheduledAt: null,
    published: true,
    author: null,
    attempts: 0,
    myBest: null,
    createdAt: attempt.startedAt.getTime(),
    canEdit: false,
  };
  return {
    attemptId: attempt.id,
    quiz: quiz ?? fallbackQuiz,
    questions: attempt.questionIds
      .map((id) => map.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map(publicQuestion),
    startedAt: attempt.startedAt.getTime(),
    expiresAt: attempt.expiresAt.getTime(),
    review: attempt.review,
    adaptive: attempt.adaptive,
  };
}

/** Lessons that use this quiz as their checkpoint, so a result can send the learner back to review. */
async function lessonsForQuiz(deps: Deps, quizId: string | null) {
  if (!quizId) return [];
  return deps.db
    .select({ id: videos.id, title: videos.title })
    .from(videos)
    .where(and(eq(videos.quizId, quizId), isNull(videos.deletedAt), inArray(videos.visibility, ['public', 'unlisted'])))
    .orderBy(desc(videos.createdAt))
    .limit(3);
}

export const taxonomyRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const { db } = c.get('deps');
  const [sections, materials] = await Promise.all([
    db.select().from(eduSections).orderBy(asc(eduSections.sort), asc(eduSections.name)),
    db.select().from(eduMaterials).orderBy(asc(eduMaterials.sort), asc(eduMaterials.name)),
  ]);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      sort: s.sort,
      materials: materials.filter((m) => m.sectionId === s.id).map((m) => ({ id: m.id, name: m.name, sort: m.sort })),
    })),
  });
});

export const quizRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const q = query(c, quizListQuerySchema);
    const cursor = decodeCursor(q.cursor);
    const term = q.q ? normalizeSearch(q.q) : '';
    const courseFilter = q.courseId
      ? eq(quizzes.courseId, q.courseId)
      : viewer
        ? or(
            isNull(quizzes.courseId),
            inArray(quizzes.courseId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, viewer.id))),
          )
        : isNull(quizzes.courseId);
    if (q.courseId && (!viewer || !(await courseRole(deps.db, q.courseId, viewer.id)))) throw forbidden('not_enrolled');
    const rows = await deps.db
      .select({ id: quizzes.id, createdAt: quizzes.createdAt })
      .from(quizzes)
      .where(
        and(
          isNull(quizzes.deletedAt),
          q.mine && viewer ? eq(quizzes.createdBy, viewer.id) : eq(quizzes.published, true),
          courseFilter,
          q.sectionId ? eq(quizzes.sectionId, q.sectionId) : undefined,
          q.materialId ? eq(quizzes.materialId, q.materialId) : undefined,
          q.difficulty ? eq(quizzes.difficulty, q.difficulty) : undefined,
          q.kind ? eq(quizzes.kind, q.kind) : undefined,
          term ? or(ilike(quizzes.searchTitle, `%${term}%`), sql`${quizzes.searchTitle} % ${term}`) : undefined,
          cursor ? sql`(${quizzes.createdAt}, ${quizzes.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(quizzes.createdAt), desc(quizzes.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    return c.json({
      items: await summaries(
        deps,
        viewer,
        page.items.map((r) => r.id),
      ),
      nextCursor: page.nextCursor,
    });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'quiz-create', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, quizInputSchema);
    if (input.courseId) {
      const r = await courseRole(deps.db, input.courseId, viewer.id);
      if (r !== 'teacher' && r !== 'assistant' && !canManageQuizzes(viewer)) throw forbidden('course_staff_only');
    } else if (viewer.accountType !== 'teacher' && !canManageQuizzes(viewer)) throw forbidden('teachers_only');
    const id = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quizzes)
        .values({
          title: input.title,
          searchTitle: normalizeSearch(`${input.title} ${input.description}`),
          description: input.description,
          sectionId: input.sectionId ?? null,
          materialId: input.materialId ?? null,
          courseId: input.courseId ?? null,
          kind: input.kind,
          difficulty: input.difficulty,
          durationSec: input.durationSec,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          published: input.published,
          shuffle: input.shuffle,
          questionCount: input.questions.length,
          createdBy: viewer.id,
        })
        .returning({ id: quizzes.id });
      await saveQuestions(tx, row!.id, input);
      return row!.id;
    });
    return c.json((await summaries(deps, viewer, [id]))[0], 201);
  })
  .post('/adaptive', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'quiz-adaptive', limit: 10, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, adaptiveQuizSchema);
    if (input.courseId && !(await courseRole(deps.db, input.courseId, viewer.id))) throw forbidden('not_enrolled');
    const mastery = await masteryFor(deps, viewer.id);
    const masteryByTopic = new Map(mastery.map((m) => [m.topic.toLowerCase(), m]));
    const recent = await deps.db
      .select({ ids: quizAttempts.questionIds })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, viewer.id), gte(quizAttempts.startedAt, new Date(Date.now() - 3 * 86400_000))));
    const recentIds = new Set(recent.flatMap((r) => r.ids));
    const candidates = await deps.db
      .select({ q: quizQuestions, difficulty: quizzes.difficulty })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
      .where(
        and(
          isNull(quizzes.deletedAt),
          eq(quizzes.published, true),
          sql`${quizzes.kind} <> 'exam'`,
          input.courseId
            ? eq(quizzes.courseId, input.courseId)
            : or(
                isNull(quizzes.courseId),
                inArray(quizzes.courseId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, viewer.id))),
              ),
          input.topic ? sql`lower(${quizQuestions.topic}) = lower(${input.topic})` : undefined,
        ),
      )
      .limit(2000);
    if (!candidates.length) throw notFound('no_questions_available');
    const scored = candidates.map(({ q, difficulty }) => {
      const m = q.topic ? masteryByTopic.get(q.topic.toLowerCase()) : undefined;
      const mv = m?.mastery ?? 55;
      let score = 45 + Math.max(0, 55 - mv) * 0.9 + (mv < 60 ? 22 : mv < 75 ? 12 : 0) + (m?.confidence === 'low' || !m ? 8 : 0);
      score += recentIds.has(q.id) ? -35 : 16;
      score +=
        mv < 60
          ? difficulty === 'easy'
            ? 20
            : difficulty === 'medium'
              ? 12
              : 2
          : mv < 80
            ? difficulty === 'medium'
              ? 20
              : 11
            : difficulty === 'hard'
              ? 20
              : 8;
      return { id: q.id, score: score + Math.random() * 6 };
    });
    const picked = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, input.count)
      .map((s) => s.id);
    const [attempt] = await deps.db
      .insert(quizAttempts)
      .values({ quizId: null, userId: viewer.id, questionIds: picked, adaptive: true, expiresAt: new Date(Date.now() + picked.length * 75_000 + 60_000) })
      .returning();
    return c.json(await attemptDto(deps, viewer, attempt!, null), 201);
  })
  .get('/history', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db
      .select({ a: quizAttempts, title: quizzes.title })
      .from(quizAttempts)
      .leftJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(eq(quizAttempts.userId, viewer.id), sql`${quizAttempts.submittedAt} is not null`))
      .orderBy(desc(quizAttempts.submittedAt))
      .limit(50);
    return c.json({
      items: rows.map((r) => ({
        attemptId: r.a.id,
        quizId: r.a.quizId,
        title: r.title ?? null,
        adaptive: r.a.adaptive,
        review: r.a.review,
        pct: r.a.pct ?? 0,
        correct: r.a.correct ?? 0,
        total: r.a.total ?? 0,
        xpEarned: r.a.xpEarned,
        submittedAt: r.a.submittedAt!.getTime(),
      })),
    });
  })
  .get('/mastery', async (c) => {
    const viewer = requireUser(c);
    return c.json({ items: await masteryFor(c.get('deps'), viewer.id) });
  })
  .get('/attempts/:attemptId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [attempt] = await deps.db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.id, param(c, 'attemptId')), eq(quizAttempts.userId, viewer.id)));
    if (!attempt) throw notFound('attempt_not_found');
    if (attempt.submittedAt)
      return c.json({ submitted: true, result: { ...(attempt.result as unknown as QuizResultDto), lessons: await lessonsForQuiz(deps, attempt.quizId) } });
    const quiz = attempt.quizId ? ((await summaries(deps, viewer, [attempt.quizId]))[0] ?? null) : null;
    return c.json({ submitted: false, attempt: await attemptDto(deps, viewer, attempt, quiz) });
  })
  .post('/attempts/:attemptId/submit', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'quiz-submit', limit: 30, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const attemptId = param(c, 'attemptId');
    const { answers } = await body(c, submitAttemptSchema);
    const result = await deps.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, viewer.id)))
        .for('update');
      if (!attempt) throw notFound('attempt_not_found');
      if (attempt.submittedAt) return { already: true, result: attempt.result as unknown as QuizResultDto };
      if (answers.length > attempt.questionIds.length) throw badRequest('too_many_answers');
      const rows = await tx.select().from(quizQuestions).where(inArray(quizQuestions.id, attempt.questionIds));
      const map = new Map(rows.map((r) => [r.id, r]));
      const ordered = attempt.questionIds.map((id) => map.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
      const gradable: GradableQuestion[] = ordered.map((q) => ({
        id: q.id,
        type: q.type,
        answer: q.answer,
        points: q.points,
        topic: q.topic,
        explanation: q.explanation,
        prompt: q.prompt,
        options: q.options,
      }));
      const g = grade(gradable, answers as GivenAnswer[]);
      const now = Date.now();
      const timeSec = Math.max(1, Math.round((Math.min(now, attempt.expiresAt.getTime() + GRACE_MS) - attempt.startedAt.getTime()) / 1000));
      const today = dayKey(now, viewer.timezone);
      let isNewBest = false;
      let xpEarned = 0;
      let courseId: string | null = null;
      if (!attempt.review && attempt.quizId) {
        const [quiz] = await tx.select().from(quizzes).where(eq(quizzes.id, attempt.quizId));
        courseId = quiz?.courseId ?? null;
        const [prev] = await tx
          .select()
          .from(quizBest)
          .where(and(eq(quizBest.userId, viewer.id), eq(quizBest.quizId, attempt.quizId)));
        isNewBest = !prev || g.pct > prev.pct;
        if (isNewBest) {
          await tx
            .insert(quizBest)
            .values({ userId: viewer.id, quizId: attempt.quizId, pct: g.pct, correct: g.correct, total: g.total, attemptId, wrongIds: g.wrongIds })
            .onConflictDoUpdate({
              target: [quizBest.userId, quizBest.quizId],
              set: { pct: g.pct, correct: g.correct, total: g.total, attemptId, wrongIds: g.wrongIds, updatedAt: new Date() },
            });
          xpEarned = xpForQuizScore(g.pct, g.perfect);
          await tx
            .update(users)
            .set({
              quizCount: prev ? users.quizCount : sql`${users.quizCount} + 1`,
              perfectCount: g.perfect && !(prev && prev.pct === 100) ? sql`${users.perfectCount} + 1` : users.perfectCount,
            })
            .where(eq(users.id, viewer.id));
        } else if (prev) {
          await tx
            .update(quizBest)
            .set({ wrongIds: prev.pct === g.pct ? g.wrongIds : prev.wrongIds })
            .where(and(eq(quizBest.userId, viewer.id), eq(quizBest.quizId, attempt.quizId)));
        }
        await tx
          .update(quizzes)
          .set({ attemptCount: sql`${quizzes.attemptCount} + 1` })
          .where(eq(quizzes.id, attempt.quizId));
      } else if (attempt.adaptive && !attempt.review) {
        xpEarned = Math.round(xpForQuizScore(g.pct, g.perfect) / 2);
        const already = await xpEarnedToday(tx, viewer.id, 'quiz_adaptive', today);
        xpEarned = Math.max(0, Math.min(xpEarned, XP_RULES.adaptiveDailyCap - already));
      }
      const award = await awardXp(tx, viewer.id, xpEarned, attempt.adaptive ? 'quiz_adaptive' : 'quiz_best', attemptId, today);
      if (!attempt.review && g.topicStats.length) {
        await tx.insert(topicSamples).values(
          g.topicStats.map((t) => ({
            userId: viewer.id,
            topicKey: topicKey(t.topic, courseId),
            topic: t.topic,
            courseId,
            correct: t.correct,
            total: t.total,
            attemptId,
          })),
        );
      }
      await touchStreak(tx, viewer.id, viewer.timezone);
      await logStudy(tx, viewer.id, today, { quizzes: 1, minutes: Math.min(180, Math.round(timeSec / 60)) });
      await tx
        .update(users)
        .set({ studyMinutes: sql`${users.studyMinutes} + ${Math.min(180, Math.round(timeSec / 60))}` })
        .where(eq(users.id, viewer.id));
      const newAchievements = await checkAchievements(tx, viewer.id);
      const dto: QuizResultDto = {
        attemptId,
        quizId: attempt.quizId,
        correct: g.correct,
        total: g.total,
        pct: g.pct,
        timeSec,
        isNewBest,
        review: attempt.review,
        perfect: g.perfect,
        newAchievements,
        breakdown: g.breakdown.map((b) => ({ ...b, given: b.given ?? null })),
        topicStats: g.topicStats,
        ...xpRewardMeta(award.xpBefore, award.xpAfter, award.awarded ? xpEarned : 0),
      };
      await tx
        .update(quizAttempts)
        .set({
          submittedAt: new Date(now),
          answers,
          correct: g.correct,
          total: g.total,
          pct: g.pct,
          timeSec,
          xpEarned: dto.xpEarned,
          result: dto as unknown as Record<string, unknown>,
        })
        .where(eq(quizAttempts.id, attemptId));
      return { already: false, result: dto };
    });
    return c.json({ ...result.result, lessons: await lessonsForQuiz(deps, result.result.quizId) });
  })
  .get('/:id', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canSeeQuiz(deps, viewer, quiz))) throw notFound('quiz_not_found');
    return c.json((await summaries(deps, viewer, [quiz.id]))[0]);
  })
  .get('/:id/edit', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canEditQuiz(deps, viewer, quiz))) throw forbidden();
    const qs = await deps.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position));
    const dto: QuizEditorDto = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      sectionId: quiz.sectionId,
      materialId: quiz.materialId,
      courseId: quiz.courseId,
      kind: quiz.kind,
      difficulty: quiz.difficulty,
      durationSec: quiz.durationSec,
      scheduledAt: quiz.scheduledAt?.getTime() ?? null,
      published: quiz.published,
      shuffle: quiz.shuffle,
      questions: qs.map((q) => ({
        type: q.type,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        topic: q.topic,
        points: q.points,
      })),
    };
    return c.json(dto);
  })
  .put('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canEditQuiz(deps, viewer, quiz))) throw forbidden();
    const input = await body(c, quizInputSchema);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(quizzes)
        .set({
          title: input.title,
          searchTitle: normalizeSearch(`${input.title} ${input.description}`),
          description: input.description,
          sectionId: input.sectionId ?? null,
          materialId: input.materialId ?? null,
          kind: input.kind,
          difficulty: input.difficulty,
          durationSec: input.durationSec,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          published: input.published,
          shuffle: input.shuffle,
          questionCount: input.questions.length,
          updatedAt: new Date(),
        })
        .where(eq(quizzes.id, quiz.id));
      await saveQuestions(tx, quiz.id, input);
    });
    return c.json((await summaries(deps, viewer, [quiz.id]))[0]);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canEditQuiz(deps, viewer, quiz))) throw forbidden();
    await deps.db.update(quizzes).set({ deletedAt: new Date() }).where(eq(quizzes.id, quiz.id));
    return c.json({ ok: true });
  })
  .get('/:id/stats', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canEditQuiz(deps, viewer, quiz))) throw forbidden();
    const [agg] = await deps.db
      .select({ attempts: count(), average: avg(quizAttempts.pct) })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quiz.id), sql`${quizAttempts.submittedAt} is not null`, eq(quizAttempts.review, false)));
    const perQuestion = await deps.db.execute<{ id: string; prompt: string; correct: number; total: number }>(sql`
      select q.id, q.prompt,
        count(*) filter (where (b.elem->>'correct')::boolean) ::int as correct,
        count(b.elem)::int as total
      from quiz_questions q
      left join quiz_attempts a on a.quiz_id = q.quiz_id and a.submitted_at is not null and a.review = false
      left join lateral jsonb_array_elements(a.result->'breakdown') b(elem) on b.elem->>'questionId' = q.id::text
      where q.quiz_id = ${quiz.id}
      group by q.id, q.prompt, q.position order by q.position`);
    const leaders = await deps.db
      .select({ pct: quizBest.pct, ...authorCols })
      .from(quizBest)
      .innerJoin(users, eq(users.id, quizBest.userId))
      .where(eq(quizBest.quizId, quiz.id))
      .orderBy(desc(quizBest.pct), asc(quizBest.updatedAt))
      .limit(20);
    return c.json({
      attempts: agg?.attempts ?? 0,
      averagePct: agg?.average ? Math.round(Number(agg.average)) : null,
      questions: perQuestion.map((q) => ({ id: q.id, prompt: q.prompt, correct: Number(q.correct), total: Number(q.total) })),
      leaderboard: leaders.map((l) => ({ user: toSummary(pickSummary('author', l as unknown as Record<string, unknown>)), pct: l.pct })),
    });
  })
  .post('/:id/attempts', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'quiz-start', limit: 30, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (!(await canSeeQuiz(deps, viewer, quiz))) throw notFound('quiz_not_found');
    const editor = await canEditQuiz(deps, viewer, quiz);
    if (quiz.scheduledAt && quiz.scheduledAt.getTime() > Date.now() && !editor) throw forbidden('quiz_not_started');
    const { review } = await body(c, startAttemptSchema).catch(() => ({ review: false }));
    let questionIds: string[];
    if (review) {
      const [best] = await deps.db
        .select()
        .from(quizBest)
        .where(and(eq(quizBest.userId, viewer.id), eq(quizBest.quizId, quiz.id)));
      if (!best || !best.wrongIds.length) throw badRequest('nothing_to_review');
      questionIds = best.wrongIds;
    } else {
      if (quiz.kind === 'exam' && !editor) {
        const [done] = await deps.db
          .select({ n: count() })
          .from(quizAttempts)
          .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, viewer.id), sql`${quizAttempts.submittedAt} is not null`));
        if ((done?.n ?? 0) > 0) throw conflict('exam_already_taken');
      }
      const qs = await deps.db
        .select({ id: quizQuestions.id })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quiz.id))
        .orderBy(asc(quizQuestions.position));
      questionIds = qs.map((q) => q.id);
    }
    if (!questionIds.length) throw badRequest('quiz_has_no_questions');
    const seed = `${viewer.id}:${Date.now()}`;
    if (quiz.shuffle) questionIds = seededShuffle(questionIds, seed);
    const durationMs = review
      ? Math.max(60, Math.round((quiz.durationSec * questionIds.length) / Math.max(1, quiz.questionCount))) * 1000
      : quiz.durationSec * 1000;
    const [attempt] = await deps.db
      .insert(quizAttempts)
      .values({ quizId: quiz.id, userId: viewer.id, questionIds, review, expiresAt: new Date(Date.now() + durationMs) })
      .returning();
    const [summary] = await summaries(deps, viewer, [quiz.id]);
    return c.json(await attemptDto(deps, viewer, attempt!, summary ?? null), 201);
  });

export async function masteryFor(deps: Deps, userId: string): Promise<MasteryDto[]> {
  const rows = await deps.db
    .select()
    .from(topicSamples)
    .where(and(eq(topicSamples.userId, userId), gte(topicSamples.createdAt, new Date(Date.now() - 365 * 86400_000))))
    .orderBy(desc(topicSamples.createdAt))
    .limit(3000);
  const buckets = new Map<string, { topic: string; courseId: string | null; samples: { pct: number; total: number; ts: number }[] }>();
  for (const r of rows) {
    const b = buckets.get(r.topicKey) ?? { topic: r.topic, courseId: r.courseId, samples: [] };
    b.samples.push({ pct: Math.round((r.correct / Math.max(1, r.total)) * 100), total: r.total, ts: r.createdAt.getTime() });
    buckets.set(r.topicKey, b);
  }
  return [...buckets.entries()]
    .map(([key, b]) => computeMastery(key, b.topic, b.courseId, b.samples))
    .sort((a, b) => a.mastery - b.mastery || b.evidenceQuestions - a.evidenceQuestions);
}
