import { dayKey, offlineResultsSchema, xpRewardMeta, type OfflineQuizPackDto, type QuizResultDto } from '@qubedu/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { courseMembers, quizAttempts, quizBest, quizQuestions, quizzes } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { notFound } from '../lib/errors';
import { grade, type GivenAnswer, type GradableQuestion } from '../lib/grading';
import { body, param, requireUser } from '../lib/http';
import { awardXp, logStudy, xpEarnedToday } from '../lib/progress';
import { checkRate } from '../middleware';
import { canSeeQuiz, loadQuiz, summaries } from './quizzes';

/** A small, once-a-quiz-a-day bonus: results made offline cannot be checked live, so they never count as a best score. */
const OFFLINE_XP = 10;
const OFFLINE_DAILY_CAP = 30;
const MAX_LIST = 40;

/**
 * A class quiz can be downloaded only after the student has finished it once (practice, not a way to read the answers
 * before an assigned quiz); quizzes that belong to no class are open practice.
 */
async function practiceAllowed(deps: Parameters<typeof canSeeQuiz>[0], userId: string, quiz: { id: string; courseId: string | null }) {
  if (!quiz.courseId) return true;
  const [done] = await deps.db
    .select({ q: quizBest.quizId })
    .from(quizBest)
    .where(and(eq(quizBest.userId, userId), eq(quizBest.quizId, quiz.id)));
  return !!done;
}

export const offlineRoutes = new Hono<AppEnv>()
  /** Practice quizzes that can be downloaded (no exams, no random-from-bank quizzes). */
  .get('/quizzes', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const mine = await deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, viewer.id));
    const rows = await deps.db
      .select()
      .from(quizzes)
      .where(
        and(
          isNull(quizzes.deletedAt),
          eq(quizzes.published, true),
          eq(quizzes.kind, 'quiz'),
          isNull(quizzes.blueprint),
          sql`(${quizzes.scheduledAt} is null or ${quizzes.scheduledAt} <= now())`,
          mine.length
            ? sql`(${quizzes.courseId} is null or ${quizzes.courseId} in (${sql.join(
                mine.map((m) => sql`${m.id}`),
                sql`, `,
              )}))`
            : isNull(quizzes.courseId),
        ),
      )
      .orderBy(desc(quizzes.attemptCount), asc(quizzes.title))
      .limit(MAX_LIST * 2);
    const visible: string[] = [];
    for (const q of rows) if (q.questionCount > 0 && (await canSeeQuiz(deps, viewer, q)) && (await practiceAllowed(deps, viewer.id, q))) visible.push(q.id);
    return c.json({ items: await summaries(deps, viewer, visible.slice(0, MAX_LIST)) });
  })
  .get('/quizzes/:id/pack', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'offline-pack', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const quiz = await loadQuiz(deps, param(c, 'id'));
    if (quiz.kind !== 'quiz' || quiz.blueprint || !(await canSeeQuiz(deps, viewer, quiz)) || !(await practiceAllowed(deps, viewer.id, quiz)))
      throw notFound('quiz_not_found');
    const qs = await deps.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position));
    if (!qs.length) throw notFound('quiz_not_found');
    const [summary] = await summaries(deps, viewer, [quiz.id]);
    return c.json({
      quiz: summary!,
      questions: qs.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        options: q.options,
        topic: q.topic,
        points: q.points,
        answer: q.answer,
        explanation: q.explanation,
      })),
      version: quiz.updatedAt.getTime(),
    } satisfies OfflineQuizPackDto);
  })
  /** Results solved offline arrive here once the phone is back online. Each is marked again on the server. */
  .post('/results', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'offline-results', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { items } = await body(c, offlineResultsSchema);
    const synced: string[] = [];
    for (const it of items) {
      const quiz = await loadQuiz(deps, it.quizId).catch(() => null);
      if (!quiz || quiz.kind !== 'quiz' || quiz.blueprint || !(await canSeeQuiz(deps, viewer, quiz))) {
        // Nothing to do with a quiz that is gone or no longer visible: tell the phone it can forget it.
        synced.push(it.clientId);
        continue;
      }
      const qs = await deps.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position));
      const gradable: GradableQuestion[] = qs.map((q) => ({
        id: q.id,
        type: q.type,
        answer: q.answer,
        points: q.points,
        topic: q.topic,
        explanation: q.explanation,
        prompt: q.prompt,
        options: q.options,
      }));
      const g = grade(gradable, it.answers as GivenAnswer[]);
      const now = Date.now();
      const started = Math.min(it.startedAt, now);
      const finished = Math.min(Math.max(it.finishedAt, started), now);
      const timeSec = Math.max(1, Math.round((finished - started) / 1000));
      const today = dayKey(finished, viewer.timezone);
      await deps.db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.id, it.clientId));
        if (existing) return;
        const already = await xpEarnedToday(tx, viewer.id, 'offline_quiz', today);
        const xp = Math.max(0, Math.min(OFFLINE_XP, OFFLINE_DAILY_CAP - already));
        const award = await awardXp(tx, viewer.id, xp, 'offline_quiz', `${quiz.id}:${today}`, today);
        const dto: QuizResultDto = {
          attemptId: it.clientId,
          quizId: quiz.id,
          correct: g.correct,
          total: g.total,
          pct: g.pct,
          timeSec,
          isNewBest: false,
          review: true,
          perfect: g.perfect,
          newAchievements: [],
          breakdown: g.breakdown.map((b) => ({ ...b, given: b.given ?? null })),
          topicStats: g.topicStats,
          ...xpRewardMeta(award.xpBefore, award.xpAfter, award.awarded ? xp : 0),
        };
        await tx.insert(quizAttempts).values({
          id: it.clientId,
          quizId: quiz.id,
          userId: viewer.id,
          questionIds: qs.map((q) => q.id),
          review: true,
          startedAt: new Date(started),
          expiresAt: new Date(finished),
          submittedAt: new Date(finished),
          answers: it.answers,
          correct: g.correct,
          total: g.total,
          pct: g.pct,
          timeSec,
          xpEarned: dto.xpEarned,
          result: dto as unknown as Record<string, unknown>,
        });
        await logStudy(tx, viewer.id, today, { quizzes: 1, minutes: Math.min(60, Math.round(timeSec / 60)) });
      });
      synced.push(it.clientId);
    }
    return c.json({ synced });
  });
