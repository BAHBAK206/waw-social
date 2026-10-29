import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  dayKey,
  weekStartOf,
  type ClassChallengeDto,
  type ClassGoalDto,
  type CourseDto,
  type GroupDto,
  type GroupStudyDto,
  type MentorDto,
  type NotificationDto,
  type Page,
} from '@qubedu/shared';
import { courses, studyLog, users } from '../src/db/schema';
import { call, newUser, setupApp } from './helpers';

const logMinutes = async (deps: Awaited<ReturnType<typeof setupApp>>['deps'], userId: string, minutes: number) =>
  deps.db
    .insert(studyLog)
    .values({ userId, day: dayKey(Date.now(), 'UTC'), minutes })
    .onConflictDoUpdate({ target: [studyLog.userId, studyLog.day], set: { minutes } });

describe('study groups', () => {
  it('shares a task list and ranks members by study time this week; outsiders are kept out', async () => {
    const { deps } = await setupApp();
    const owner = await newUser({ name: 'Mona' });
    const friend = await newUser({ name: 'Omar' });
    const outsider = await newUser();
    const g = await call<GroupDto>('POST', '/groups', { token: owner.token, body: { name: 'Physics circle', privacy: 'public' } });
    await call('POST', `/groups/${g.body.id}/join`, { token: friend.token, body: {} });
    expect((await call('GET', `/groups/${g.body.id}/study`, { token: outsider.token })).status).toBe(403);
    expect((await call('POST', `/groups/${g.body.id}/tasks`, { token: outsider.token, body: { title: 'x' } })).status).toBe(403);

    const task = await call<{ id: string }>('POST', `/groups/${g.body.id}/tasks`, { token: owner.token, body: { title: 'Revise chapter 3' } });
    expect(task.status).toBe(201);
    await logMinutes(deps, friend.user.id, 90);
    await logMinutes(deps, owner.user.id, 30);

    const tick = await call<{ done: boolean; doneByName: string }>('PATCH', `/groups/${g.body.id}/tasks/${task.body.id}`, {
      token: friend.token,
      body: { done: true },
    });
    expect(tick.body).toMatchObject({ done: true, doneByName: 'Omar' });
    const study = await call<GroupStudyDto>('GET', `/groups/${g.body.id}/study`, { token: owner.token });
    expect(study.body.tasks).toEqual([expect.objectContaining({ title: 'Revise chapter 3', done: true, doneByName: 'Omar' })]);
    expect(study.body.board.map((b) => [b.user.displayName, b.minutes])).toEqual([
      ['Omar', 90],
      ['Mona', 30],
    ]);
    expect(study.body.totalMinutes).toBe(120);

    // Only the author or a group admin removes a task.
    expect((await call('DELETE', `/groups/${g.body.id}/tasks/${task.body.id}`, { token: friend.token })).status).toBe(403);
    expect((await call('DELETE', `/groups/${g.body.id}/tasks/${task.body.id}`, { token: owner.token })).status).toBe(200);
  });
});

describe('class challenge and weekly goal', () => {
  it('ranks the classes of a school by average study time, and rewards a class once when it reaches its goal', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher' });
    const a1 = await newUser();
    const a2 = await newUser();
    const b1 = await newUser();
    const loner = await newUser();
    const mk = async (title: string) => (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title } })).body;
    const classA = await mk('5A');
    const classB = await mk('5B');
    for (const [course, s] of [
      [classA, a1],
      [classA, a2],
      [classB, b1],
    ] as const)
      await call('POST', '/school/join', { token: s.token, body: { code: course.joinCode } });
    const school = await call<{ id: string }>('POST', '/schools', { token: teacher.token, body: { name: 'Challenge School' } });
    for (const course of [classA, classB]) await deps.db.update(courses).set({ schoolId: school.body.id }).where(eq(courses.id, course.id));
    await logMinutes(deps, a1.user.id, 40);
    await logMinutes(deps, a2.user.id, 20); // 5A: 60 min / 2 students = 30
    await logMinutes(deps, b1.user.id, 45); // 5B: 45 min / 1 student = 45

    const ch = await call<ClassChallengeDto>('GET', `/collab/challenge/${classA.id}`, { token: a1.token });
    expect(ch.body.weekStart).toBe(weekStartOf(dayKey(Date.now(), 'UTC')));
    expect(ch.body.standings.map((s) => [s.title, s.rank, s.average, s.mine])).toEqual([
      ['5B', 1, 45, false],
      ['5A', 2, 30, true],
    ]);
    expect((await call('GET', `/collab/challenge/${classA.id}`, { token: loner.token })).status).toBe(403);

    // Goal: staff sets it, students cannot; nothing happens until it is reached; then everyone gets the reward once.
    expect((await call('PUT', `/collab/goals/${classA.id}`, { token: a1.token, body: { targetMinutes: 100 } })).status).toBe(403);
    const set = await call<ClassGoalDto>('PUT', `/collab/goals/${classA.id}`, { token: teacher.token, body: { targetMinutes: 100 } });
    expect(set.body).toMatchObject({ targetMinutes: 100, minutes: 60, reached: false, badges: 0, students: 2, canSet: true });
    expect((await call<ClassGoalDto>('GET', `/collab/goals/${classA.id}`, { token: a1.token })).body.canSet).toBe(false);

    await logMinutes(deps, a2.user.id, 70); // 40 + 70 = 110 ≥ 100
    const reached = await call<ClassGoalDto>('GET', `/collab/goals/${classA.id}`, { token: a1.token });
    expect(reached.body).toMatchObject({ reached: true, badges: 1 });
    await call('GET', `/collab/goals/${classA.id}`, { token: a2.token });
    const notes = await call<Page<NotificationDto>>('GET', '/notifications', { token: a2.token });
    expect(notes.body.items.filter((n) => n.type === 'class_goal')).toHaveLength(1);
    const [xp] = await deps.db.select({ xp: users.xp }).from(users).where(eq(users.id, a1.user.id));
    expect(xp!.xp).toBeGreaterThanOrEqual(20);
  });
});

describe('mentors', () => {
  it('lets seniors offer help in subjects and lists them; juniors cannot sign up', async () => {
    const { deps } = await setupApp();
    const senior = await newUser({ name: 'Karim' });
    const junior = await newUser({ name: 'Lina' });
    await deps.db.update(users).set({ gradeLevel: 's3' }).where(eq(users.id, senior.user.id));
    await deps.db.update(users).set({ gradeLevel: 'm2' }).where(eq(users.id, junior.user.id));
    expect((await call<{ eligible: boolean }>('GET', '/collab/mentors/me', { token: junior.token })).body.eligible).toBe(false);
    expect((await call('PUT', '/collab/mentors/me', { token: junior.token, body: { subjects: ['Math'] } })).status).toBe(403);
    const mine = await call<{ subjects: string[] }>('PUT', '/collab/mentors/me', { token: senior.token, body: { subjects: ['Math', 'Physics', 'Math'] } });
    expect(mine.body.subjects).toEqual(['Math', 'Physics']);

    const list = await call<{ items: MentorDto[] }>('GET', '/collab/mentors?subject=Math', { token: junior.token });
    expect(list.body.items.map((m) => [m.user.displayName, m.subjects])).toEqual([['Karim', ['Math', 'Physics']]]);
    expect((await call<{ items: MentorDto[] }>('GET', '/collab/mentors?subject=Chemistry', { token: junior.token })).body.items).toEqual([]);
    // Not in their own list; turning it off removes them.
    expect((await call<{ items: MentorDto[] }>('GET', '/collab/mentors', { token: senior.token })).body.items.some((m) => m.user.displayName === 'Karim')).toBe(
      false,
    );
    await call('PUT', '/collab/mentors/me', { token: senior.token, body: { subjects: [] } });
    expect((await call<{ items: MentorDto[] }>('GET', '/collab/mentors?subject=Math', { token: junior.token })).body.items).toEqual([]);
  });
});
