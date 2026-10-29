import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  type CourseDto,
  type DailyReviewDto,
  type FocusStatusDto,
  type GlossaryTermDto,
  type QuizAttemptDto,
  type QuizSummaryDto,
  type RecurringMistakeDto,
  type ReviewAnswerResultDto,
  type StudyPackDto,
} from '@qubedu/shared';
import { questionReviews } from '../src/db/schema';
import { notify } from '../src/lib/notify';
import { pushIdle } from '../src/lib/push';
import { call, newUser, sentPushes, setupApp } from './helpers';

const quizBody = {
  title: 'Cells',
  difficulty: 'easy',
  durationSec: 300,
  questions: [
    { type: 'mc', prompt: 'Powerhouse of the cell?', options: ['Nucleus', 'Mitochondria'], answer: 1, explanation: 'ATP', topic: 'Cells' },
    { type: 'tf', prompt: 'Plants make food by photosynthesis', options: ['True', 'False'], answer: 0, topic: 'Cells' },
  ],
};

async function attempt(token: string, quizId: string, answers: unknown[]) {
  const start = await call<QuizAttemptDto>('POST', `/quizzes/${quizId}/attempts`, { token, body: {} });
  return call('POST', `/quizzes/attempts/${start.body.attemptId}/submit`, { token, body: { answers } });
}

describe('daily review and recurring mistakes', () => {
  it('queues missed questions for tomorrow, grades the review, and flags questions missed twice', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher' });
    const s = await newUser();
    const quiz = await call<QuizSummaryDto>('POST', '/quizzes', { token: teacher.token, body: quizBody });

    // One right, one wrong: only the wrong one is queued, and not before tomorrow.
    await attempt(s.token, quiz.body.id, [1, 1]);
    const queued = await deps.db.select().from(questionReviews).where(eq(questionReviews.userId, s.user.id));
    expect(queued).toHaveLength(1);
    expect(queued[0]!.misses).toBe(1);
    expect(queued[0]!.dueAt.getTime()).toBeGreaterThan(Date.now() + 20 * 3_600_000);
    expect((await call<DailyReviewDto>('GET', '/study/review', { token: s.token })).body).toMatchObject({ questions: [], total: 0 });

    // Tomorrow: it is in the queue (together with a due flashcard), without the answer.
    await deps.db
      .update(questionReviews)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(eq(questionReviews.userId, s.user.id));
    await call('POST', '/flashcards', { token: s.token, body: { front: 'ATP', back: 'Energy', deck: 'bio' } });
    const today = await call<DailyReviewDto>('GET', '/study/review', { token: s.token });
    expect(today.body.questions).toHaveLength(1);
    expect(today.body.cards).toHaveLength(1);
    expect(today.body.total).toBe(2);
    expect(JSON.stringify(today.body.questions)).not.toContain('"answer"');
    const qid = today.body.questions[0]!.id;

    // Wrong again → missed twice → shows up as a recurring mistake.
    const wrong = await call<ReviewAnswerResultDto>('POST', `/study/review/questions/${qid}/answer`, { token: s.token, body: { answer: 0 } });
    expect(wrong.body).toMatchObject({ correct: false, answer: 1 });
    const mistakes = await call<{ items: RecurringMistakeDto[] }>('GET', '/study/mistakes', { token: s.token });
    expect(mistakes.body.items[0]).toMatchObject({ questionId: qid, misses: 2 });

    // Right at last: it moves further out and is no longer due.
    await deps.db
      .update(questionReviews)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(eq(questionReviews.userId, s.user.id));
    const right = await call<ReviewAnswerResultDto>('POST', `/study/review/questions/${qid}/answer`, { token: s.token, body: { answer: 1 } });
    expect(right.body.correct).toBe(true);
    expect(right.body.nextDueAt).toBeGreaterThan(Date.now() + 3_600_000);
    expect((await call<DailyReviewDto>('GET', '/study/review', { token: s.token })).body.questions).toHaveLength(0);

    // Someone else's queue is theirs alone.
    const other = await newUser();
    expect((await call('POST', `/study/review/questions/${qid}/answer`, { token: other.token, body: { answer: 1 } })).status).toBe(404);
    expect((await call('GET', '/study/review')).status).toBe(401);
  });
});

describe('study pack and scheduling', () => {
  it('builds a pack from text, saves flashcards and terms once, and schedules the plan once', async () => {
    const u = await newUser();
    const text = `Photosynthesis
Photosynthesis is the process by which plants make food from light. Plants use chlorophyll to absorb light.
Chlorophyll is a green pigment found in the chloroplasts of plant cells.
Respiration
Respiration is the release of energy from food inside cells. Cells use oxygen during respiration.`;
    expect((await call('POST', '/study/pack', { token: u.token, body: { text: 'too short' } })).status).toBe(400);
    const pack = await call<StudyPackDto>('POST', '/study/pack', { token: u.token, body: { text } });
    expect(pack.status).toBe(200);
    expect(pack.body.flashcards.length).toBeGreaterThanOrEqual(3);
    expect(pack.body.mindMap.branches.length).toBeGreaterThanOrEqual(2);

    const save = { deck: 'Biology', cards: pack.body.flashcards, terms: pack.body.glossary, subject: 'Biology' };
    expect((await call<{ cards: number; terms: number }>('POST', '/study/pack/save', { token: u.token, body: save })).body).toMatchObject({
      terms: pack.body.glossary.length,
    });
    expect((await call<{ cards: number; terms: number }>('POST', '/study/pack/save', { token: u.token, body: save })).body).toEqual({ cards: 0, terms: 0 });
    expect((await call<{ items: GlossaryTermDto[] }>('GET', '/glossary?subject=Biology', { token: u.token })).body.items.length).toBe(
      pack.body.glossary.length,
    );

    const today = dayKey(Date.now(), 'UTC');
    await call('POST', '/exams', { token: u.token, body: { subject: 'Math', day: addDays(today, 3), time: '09:30', place: 'Hall A' } });
    const first = await call<{ created: number }>('POST', '/study/schedule', { token: u.token, body: {} });
    expect(first.status).toBe(201);
    expect(first.body.created).toBeGreaterThan(0);
    expect((await call<{ created: number }>('POST', '/study/schedule', { token: u.token, body: {} })).body.created).toBe(0);
  });
});

describe('focus mode', () => {
  it('mutes push while it runs, keeps the in-app notification, and counts the minutes', async () => {
    const { deps } = await setupApp();
    const u = await newUser();
    const phone = `ExponentPushToken[focus-${Math.random().toString(36).slice(2)}]`;
    await call('POST', '/me/push', { token: u.token, body: { kind: 'expo', token: phone, platform: 'android' } });
    const pushed = async (tag: string) => {
      const before = sentPushes.length;
      await notify(deps, { userId: u.user.id, type: 'system', title: tag, body: tag });
      await pushIdle();
      return sentPushes.slice(before).some((p) => p.targets.some((t) => t.token === phone));
    };
    expect(await pushed('before')).toBe(true);

    const start = await call<FocusStatusDto>('POST', '/study/focus/start', { token: u.token, body: { minutes: 25 } });
    expect(start.status).toBe(201);
    expect(start.body.active).toMatchObject({ minutes: 25 });
    expect(await pushed('during')).toBe(false);
    // A second start while one runs does not stack another.
    expect((await call<FocusStatusDto>('POST', '/study/focus/start', { token: u.token, body: { minutes: 60 } })).body.active?.minutes).toBe(25);
    expect((await call<FocusStatusDto>('GET', '/study/focus', { token: u.token })).body.mutedWeek).toBe(1);

    const stop = await call<FocusStatusDto>('POST', '/study/focus/stop', { token: u.token });
    expect(stop.body.active).toBeNull();
    expect(stop.body.weekSessions).toBe(1);
    expect(await pushed('after')).toBe(true);
    expect((await call('POST', '/study/focus/start', { token: u.token, body: { minutes: 2 } })).status).toBe(400);
  });
});

describe('glossary and past papers', () => {
  it('keeps personal terms private, lets course staff share terms with the class, and lists past papers', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const s = await newUser();
    const stranger = await newUser();
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Biology 1' } });
    await call('POST', '/school/join', { token: s.token, body: { code: course.body.joinCode } });

    const mine = await call<GlossaryTermDto>('POST', '/glossary', {
      token: s.token,
      body: { subject: 'Biology', term: 'Cell', definition: 'Basic unit of life' },
    });
    expect(mine.status).toBe(201);
    expect((await call('POST', '/glossary', { token: s.token, body: { subject: 'Biology', term: 'cell', definition: 'dup' } })).status).toBe(400);
    expect(
      (await call('POST', '/glossary', { token: s.token, body: { subject: 'Biology', term: 'Atom', definition: 'x', courseId: course.body.id } })).status,
    ).toBe(403);
    const shared = await call<GlossaryTermDto>('POST', '/glossary', {
      token: teacher.token,
      body: { subject: 'Biology', term: 'Mitosis', definition: 'Cell division', courseId: course.body.id },
    });
    expect(shared.status).toBe(201);

    const seen = (await call<{ items: GlossaryTermDto[] }>('GET', '/glossary', { token: s.token })).body.items.map((t) => t.term).sort();
    expect(seen).toEqual(['Cell', 'Mitosis']);
    expect((await call<{ items: GlossaryTermDto[] }>('GET', '/glossary', { token: stranger.token })).body.items).toEqual([]);
    expect((await call('GET', `/glossary?courseId=${course.body.id}`, { token: stranger.token })).status).toBe(403);
    expect((await call('DELETE', `/glossary/${shared.body.id}`, { token: s.token })).status).toBe(200);
    expect((await call<{ items: GlossaryTermDto[] }>('GET', '/glossary', { token: s.token })).body.items).toHaveLength(2);
    const suggest = await call<{ items: { term: string }[] }>('POST', '/glossary/suggest', {
      token: s.token,
      body: { text: 'Osmosis is the movement of water across a membrane toward the higher solute concentration.' },
    });
    expect(suggest.body.items[0]?.term).toBe('Osmosis');

    // Past papers: a paper carries its year and board, and the list can show only papers.
    const paper = await call<QuizSummaryDto>('POST', '/quizzes', {
      token: teacher.token,
      body: { ...quizBody, title: 'Biology 2023', kind: 'exam', paperYear: 2023, paperBoard: 'Ministry' },
    });
    expect(paper.body).toMatchObject({ paperYear: 2023, paperBoard: 'Ministry' });
    await call('POST', '/quizzes', { token: teacher.token, body: { ...quizBody, title: 'Regular quiz' } });
    const papers = await call<{ items: QuizSummaryDto[] }>('GET', '/quizzes?papers=true');
    expect(papers.body.items.map((q) => q.id)).toContain(paper.body.id);
    expect(papers.body.items.every((q) => q.paperYear !== null)).toBe(true);
    expect((await call<{ items: QuizSummaryDto[] }>('GET', '/quizzes?papers=true&paperYear=2020')).body.items).toHaveLength(0);
  });
});
