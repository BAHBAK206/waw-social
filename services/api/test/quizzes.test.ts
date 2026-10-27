import { describe, expect, it } from 'vitest';
import type { MasteryDto, Page, QuizAttemptDto, QuizEditorDto, QuizResultDto, QuizSummaryDto } from '@qubedu/shared';
import { grade } from '../src/lib/grading';
import { call, newUser } from './helpers';

const sampleQuiz = {
  title: 'كسور — اختبار قصير',
  description: 'fractions',
  difficulty: 'easy',
  durationSec: 300,
  questions: [
    { type: 'mc', prompt: '1/2 + 1/2 = ?', options: ['1', '2', '1/4'], answer: 0, explanation: 'نصفان = واحد', topic: 'Fractions' },
    { type: 'tf', prompt: '3/4 > 1/2', options: ['صح', 'خطأ'], answer: 0, topic: 'Fractions' },
    { type: 'multi', prompt: 'Primes?', options: ['2', '4', '5', '9'], answer: [0, 2], topic: 'Primes' },
    { type: 'short', prompt: 'Capital of Egypt?', answer: ['القاهرة', 'Cairo'], topic: 'Geo' },
  ],
};

describe('grading', () => {
  it('grades each question type and normalizes short answers', () => {
    const qs = sampleQuiz.questions.map((q, i) => ({
      id: `q${i}`,
      type: q.type as 'mc',
      answer: q.answer as number,
      points: 1,
      topic: q.topic,
      explanation: null,
    }));
    const g = grade(qs, [0, 0, [2, 0], ' القاهره ']);
    expect(g.correct).toBe(4);
    expect(g.perfect).toBe(true);
    const g2 = grade(qs, [1, null, [0], 'Alex']);
    expect(g2.correct).toBe(0);
    expect(g2.wrongIds).toHaveLength(4);
  });
});

describe('quizzes', () => {
  it('teacher creates; student plays without seeing answers; server grades and awards XP once per new best', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser();
    expect((await call('POST', '/quizzes', { token: student.token, body: sampleQuiz })).status).toBe(403);
    const quiz = await call<QuizSummaryDto>('POST', '/quizzes', { token: teacher.token, body: sampleQuiz });
    expect(quiz.status).toBe(201);
    expect(quiz.body.questionCount).toBe(4);

    const publicList = await call<Page<QuizSummaryDto>>('GET', '/quizzes?q=كسور');
    expect(publicList.body.items.some((q) => q.id === quiz.body.id)).toBe(true);

    const start = await call<QuizAttemptDto>('POST', `/quizzes/${quiz.body.id}/attempts`, { token: student.token, body: {} });
    expect(start.status).toBe(201);
    expect(JSON.stringify(start.body)).not.toContain('"answer"');
    expect(start.body.questions).toHaveLength(4);

    const r1 = await call<QuizResultDto>('POST', `/quizzes/attempts/${start.body.attemptId}/submit`, {
      token: student.token,
      body: { answers: [0, 1, [0], null] },
    });
    expect(r1.status).toBe(200);
    expect(r1.body.correct).toBe(1);
    expect(r1.body.pct).toBe(25);
    expect(r1.body.isNewBest).toBe(true);
    expect(r1.body.xpEarned).toBe(3);
    expect(r1.body.newAchievements).toContain('ach_quiz1');
    expect(r1.body.breakdown[0]!.explanation).toBe('نصفان = واحد');

    const again = await call<QuizResultDto>('POST', `/quizzes/attempts/${start.body.attemptId}/submit`, {
      token: student.token,
      body: { answers: [0, 0, [0, 2], 'cairo'] },
    });
    expect(again.body.pct).toBe(25);

    const review = await call<QuizAttemptDto>('POST', `/quizzes/${quiz.body.id}/attempts`, { token: student.token, body: { review: true } });
    expect(review.body.questions).toHaveLength(3);
    const rr = await call<QuizResultDto>('POST', `/quizzes/attempts/${review.body.attemptId}/submit`, {
      token: student.token,
      body: { answers: [0, [0, 2], 'Cairo'] },
    });
    expect(rr.body.xpEarned).toBe(0);
    expect(rr.body.review).toBe(true);

    const s2 = await call<QuizAttemptDto>('POST', `/quizzes/${quiz.body.id}/attempts`, { token: student.token, body: {} });
    const r2 = await call<QuizResultDto>('POST', `/quizzes/attempts/${s2.body.attemptId}/submit`, {
      token: student.token,
      body: { answers: [0, 0, [2, 0], 'القاهرة'] },
    });
    expect(r2.body.perfect).toBe(true);
    expect(r2.body.xpEarned).toBe(30);
    expect(r2.body.xpAfter).toBe(33);
    expect(r2.body.newAchievements).toContain('ach_perfect1');

    const mastery = await call<{ items: MasteryDto[] }>('GET', '/quizzes/mastery', { token: student.token });
    expect(mastery.body.items.map((m) => m.topic).sort()).toEqual(['Fractions', 'Geo', 'Primes']);

    const edit = await call<QuizEditorDto>('GET', `/quizzes/${quiz.body.id}/edit`, { token: teacher.token });
    expect(edit.body.questions[2]!.answer).toEqual([0, 2]);
    expect((await call('GET', `/quizzes/${quiz.body.id}/edit`, { token: student.token })).status).toBe(403);

    const stats = await call<{ attempts: number; questions: { correct: number; total: number }[] }>('GET', `/quizzes/${quiz.body.id}/stats`, {
      token: teacher.token,
    });
    expect(stats.body.attempts).toBe(2);
    expect(stats.body.questions[0]).toMatchObject({ correct: 2, total: 2 });

    const adaptive = await call<QuizAttemptDto>('POST', '/quizzes/adaptive', { token: student.token, body: { count: 3 } });
    expect(adaptive.status).toBe(201);
    expect(adaptive.body.adaptive).toBe(true);
  });

  it('exams can only be taken once and respect schedule', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser();
    const future = await call<QuizSummaryDto>('POST', '/quizzes', {
      token: teacher.token,
      body: { ...sampleQuiz, kind: 'exam', scheduledAt: Date.now() + 3600_000 },
    });
    expect((await call('POST', `/quizzes/${future.body.id}/attempts`, { token: student.token, body: {} })).status).toBe(403);
    const exam = await call<QuizSummaryDto>('POST', '/quizzes', { token: teacher.token, body: { ...sampleQuiz, kind: 'exam' } });
    const a = await call<QuizAttemptDto>('POST', `/quizzes/${exam.body.id}/attempts`, { token: student.token, body: {} });
    await call('POST', `/quizzes/attempts/${a.body.attemptId}/submit`, { token: student.token, body: { answers: [] } });
    expect((await call('POST', `/quizzes/${exam.body.id}/attempts`, { token: student.token, body: {} })).status).toBe(409);
  });
});
