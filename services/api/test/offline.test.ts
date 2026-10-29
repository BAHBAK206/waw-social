import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { OfflineQuizPackDto, QuizSummaryDto } from '@qubedu/shared';
import { quizAttempts, users } from '../src/db/schema';
import { call, newUser, setupApp } from './helpers';

describe('offline quizzes', () => {
  it('lists practice quizzes only, packs them with answers, and marks results again on the server once', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser({ name: 'Omar' });
    const questions = [
      { type: 'mc', prompt: '2+2?', options: ['3', '4'], answer: 1, points: 1, topic: 'Sums' },
      { type: 'tf', prompt: 'The sky is green', options: ['True', 'False'], answer: 1, points: 1, topic: 'Nature' },
    ];
    const practice = await call<{ id: string }>('POST', '/quizzes', {
      token: teacher.token,
      body: { title: `Offline practice ${Date.now()}`, published: true, questions },
    });
    const exam = await call<{ id: string }>('POST', '/quizzes', {
      token: teacher.token,
      body: { title: 'Exam', kind: 'exam', published: true, durationSec: 600, questions },
    });
    expect(practice.status, JSON.stringify(practice.body)).toBe(201);

    const list = await call<{ items: QuizSummaryDto[] }>('GET', '/offline/quizzes', { token: student.token });
    expect(list.body.items.map((q) => q.id)).toContain(practice.body.id);
    expect(list.body.items.map((q) => q.id)).not.toContain(exam.body.id);
    expect((await call('GET', `/offline/quizzes/${exam.body.id}/pack`, { token: student.token })).status).toBe(404);

    const pack = await call<OfflineQuizPackDto>('GET', `/offline/quizzes/${practice.body.id}/pack`, { token: student.token });
    expect(pack.status).toBe(200);
    expect(pack.body.questions.map((q) => q.answer)).toEqual([1, 1]);

    const clientId = randomUUID();
    const send = () =>
      call<{ synced: string[] }>('POST', '/offline/results', {
        token: student.token,
        body: { items: [{ clientId, quizId: practice.body.id, answers: [1, 0], startedAt: Date.now() - 60_000, finishedAt: Date.now() - 5_000 }] },
      });
    const first = await send();
    expect(first.body.synced).toEqual([clientId]);
    const [attempt] = await deps.db.select().from(quizAttempts).where(eq(quizAttempts.id, clientId));
    expect(attempt).toMatchObject({ correct: 1, total: 2, pct: 50, review: true, userId: student.user.id });
    const xp1 = (await deps.db.select({ xp: users.xp }).from(users).where(eq(users.id, student.user.id)))[0]!.xp;
    expect(xp1).toBe(10);
    // Sending it again (a retry after a lost reply) changes nothing.
    expect((await send()).body.synced).toEqual([clientId]);
    expect((await deps.db.select({ xp: users.xp }).from(users).where(eq(users.id, student.user.id)))[0]!.xp).toBe(10);
    // A quiz that no longer exists is acknowledged so the phone can forget it.
    const gone = await call<{ synced: string[] }>('POST', '/offline/results', {
      token: student.token,
      body: { items: [{ clientId: randomUUID(), quizId: randomUUID(), answers: [], startedAt: Date.now() - 1000, finishedAt: Date.now() }] },
    });
    expect(gone.body.synced).toHaveLength(1);
  });
});
