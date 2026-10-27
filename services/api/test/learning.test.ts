import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AcademicDashboardDto,
  DailyChallengeDto,
  ExamDto,
  FlashcardDto,
  NoteDto,
  PomodoroCompleteDto,
  PomodoroSessionDto,
  TaskDto,
  WeeklyPlanDto,
} from '@qubedu/shared';
import { addDays, dayKey } from '@qubedu/shared';
import { dailyChallenges, pomodoroSessions } from '../src/db/schema';
import { call, newUser, setupApp } from './helpers';

describe('study tools', () => {
  it('flashcards: create, review schedules, due counts', async () => {
    const u = await newUser();
    const created = await call<{ items: FlashcardDto[] }>('POST', '/flashcards', {
      token: u.token,
      body: {
        cards: [
          { front: 'H2O', back: 'Water', deck: 'chem' },
          { front: 'NaCl', back: 'Salt', deck: 'chem' },
        ],
      },
    });
    expect(created.body.items).toHaveLength(2);
    // Duplicates in the same deck are skipped (case/space-insensitive); the same front in another deck is fine.
    const dup = await call<{ items: FlashcardDto[] }>('POST', '/flashcards', {
      token: u.token,
      body: { cards: [{ front: ' h2o ', back: 'Water again', deck: 'chem' }, { front: 'H2O', back: 'Water', deck: 'review' }, { front: 'CO2', back: 'Carbon dioxide', deck: 'review' }, { front: 'co2', back: 'dup in batch', deck: 'review' }] },
    });
    expect(dup.body.items.map((c) => c.front)).toEqual(['H2O', 'CO2']);
    const none = await call<{ items: FlashcardDto[] }>('POST', '/flashcards', { token: u.token, body: { front: 'NaCl', back: 'Salt', deck: 'chem' } });
    expect(none.status).toBe(200);
    expect(none.body.items).toHaveLength(0);
    await call('DELETE', `/flashcards/${dup.body.items[0]!.id}`, { token: u.token });
    await call('DELETE', `/flashcards/${dup.body.items[1]!.id}`, { token: u.token });
    const due = await call<{ items: FlashcardDto[]; dueCount: number; decks: { name: string; count: number }[] }>('GET', '/flashcards?due=true', {
      token: u.token,
    });
    expect(due.body.dueCount).toBe(2);
    expect(due.body.decks).toEqual([{ name: 'chem', count: 2 }]);
    const reviewed = await call<{ card: FlashcardDto }>('POST', `/flashcards/${created.body.items[0]!.id}/review`, {
      token: u.token,
      body: { rating: 'know' },
    });
    expect(reviewed.body.card.intervalDays).toBe(1);
    expect(reviewed.body.card.dueAt).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect((await call<{ dueCount: number }>('GET', '/flashcards', { token: u.token })).body.dueCount).toBe(1);
    const other = await newUser();
    expect((await call('POST', `/flashcards/${created.body.items[0]!.id}/review`, { token: other.token, body: { rating: 'know' } })).status).toBe(404);
  });

  it('pomodoro: cannot complete early, completes once with XP', async () => {
    const { deps } = await setupApp();
    const u = await newUser();
    const s = await call<PomodoroSessionDto>('POST', '/pomodoro/start', { token: u.token, body: { minutes: 25 } });
    expect((await call('POST', `/pomodoro/${s.body.id}/complete`, { token: u.token })).status).toBe(400);
    await deps.db
      .update(pomodoroSessions)
      .set({ startedAt: new Date(Date.now() - 26 * 60_000) })
      .where(eq(pomodoroSessions.id, s.body.id));
    const done = await call<PomodoroCompleteDto>('POST', `/pomodoro/${s.body.id}/complete`, { token: u.token });
    expect(done.body.xpEarned).toBe(5);
    expect(done.body.newAchievements).toContain('ach_pomo1');
    expect(done.body.todayMinutes).toBe(25);
    const again = await call<PomodoroCompleteDto>('POST', `/pomodoro/${s.body.id}/complete`, { token: u.token });
    expect(again.body.alreadyCompleted).toBe(true);
    expect(again.body.xpEarned).toBe(0);
  });

  it('daily challenge: one claim per day, XP only when correct', async () => {
    const { deps } = await setupApp();
    const today = dayKey(Date.now(), 'UTC');
    await deps.db.delete(dailyChallenges).where(eq(dailyChallenges.day, today));
    await deps.db.insert(dailyChallenges).values({ day: today, type: 'quiz', title: 'Q', question: '2+2?', options: ['3', '4'], answer: 1, xp: 15 });
    const u = await newUser();
    const get = await call<{ challenge: DailyChallengeDto }>('GET', '/daily-challenge', { token: u.token });
    expect(get.body.challenge.options).toEqual(['3', '4']);
    expect(JSON.stringify(get.body)).not.toContain('"answer":1');
    const ans = await call<{ challenge: DailyChallengeDto }>('POST', '/daily-challenge/answer', { token: u.token, body: { answer: 1 } });
    expect(ans.body.challenge.result).toEqual({ correct: true, xpEarned: 15, answer: 1 });
    expect((await call('POST', '/daily-challenge/answer', { token: u.token, body: { answer: 1 } })).status).toBe(409);
  });

  it('organizer, exams (ICS), dashboard and weekly plan', async () => {
    const u = await newUser();
    const today = dayKey(Date.now(), 'UTC');
    const t = await call<TaskDto>('POST', '/tasks', { token: u.token, body: { title: 'Read chapter 3', dueAt: Date.now() + 3600_000, priority: 'high' } });
    expect(t.status).toBe(201);
    const done = await call<TaskDto>('PATCH', `/tasks/${t.body.id}`, { token: u.token, body: { status: 'done' } });
    expect(done.body.completedAt).not.toBeNull();
    await call('POST', '/tasks', { token: u.token, body: { title: 'Solve sheet', dueAt: Date.now() + 2 * 3600_000 } });
    const n = await call<NoteDto>('POST', '/notes', { token: u.token, body: { title: 'Idea', body: 'text', color: 'yellow', pinned: true } });
    expect(n.body.pinned).toBe(true);
    const e = await call<ExamDto>('POST', '/exams', { token: u.token, body: { subject: 'Math', day: addDays(today, 3), time: '09:30', place: 'Hall A' } });
    expect(e.status).toBe(201);
    const ics = await call<string>('GET', '/exams/calendar.ics', { token: u.token });
    expect(ics.headers.get('content-type')).toContain('text/calendar');
    expect(String(ics.body)).toContain('SUMMARY:Math');

    const dash = await call<AcademicDashboardDto>('GET', '/academic/dashboard', { token: u.token });
    expect(dash.body.upcomingExams[0]!.subject).toBe('Math');
    expect(dash.body.inbox.some((i) => i.kind === 'task' && i.title === 'Solve sheet')).toBe(true);
    expect(dash.body.weeklyMinutes).toHaveLength(7);
    const plan = await call<WeeklyPlanDto>('GET', '/academic/weekly-plan?budget=60', { token: u.token });
    expect(plan.body.days).toHaveLength(7);
    expect(plan.body.days.flatMap((d) => d.blocks).some((b) => b.kind === 'exam')).toBe(true);
  });
});
