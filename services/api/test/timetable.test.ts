import type { CourseDto, FamilyDto, TimetableEntryDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser } from './helpers';

describe('timetable', () => {
  it('students keep personal rows and see their class schedules; teachers set the class schedule; parents read a child’s', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Biology 1' } });
    const student = await newUser();
    await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });

    // Students cannot write a class schedule.
    const denied = await call('POST', '/me/timetable', {
      token: student.token,
      body: { day: 0, start: '08:00', end: '08:45', title: 'Biology', courseId: course.body.id },
    });
    expect(denied.status).toBe(403);
    const bad = await call('POST', '/me/timetable', { token: student.token, body: { day: 0, start: '09:00', end: '08:00', title: 'Oops' } });
    expect(bad.status).toBe(400);

    const cls = await call<TimetableEntryDto>('POST', '/me/timetable', {
      token: teacher.token,
      body: { day: 0, start: '08:00', end: '08:45', title: 'Biology', room: 'Lab 2', courseId: course.body.id },
    });
    expect(cls.status).toBe(201);
    expect(cls.body).toMatchObject({ courseTitle: 'Biology 1', mine: true });
    const own = await call<TimetableEntryDto>('POST', '/me/timetable', {
      token: student.token,
      body: { day: 1, start: '16:00', end: '17:00', title: 'Football' },
    });
    expect(own.status).toBe(201);

    const mine = await call<{ items: TimetableEntryDto[] }>('GET', '/me/timetable', { token: student.token });
    expect(mine.body.items.map((x) => x.title).sort()).toEqual(['Biology', 'Football']);
    expect(mine.body.items.find((x) => x.title === 'Biology')).toMatchObject({ mine: false, room: 'Lab 2' });
    // The student cannot change the teacher's row.
    expect(
      (await call('PUT', `/me/timetable/${cls.body.id}`, { token: student.token, body: { day: 0, start: '08:00', end: '09:00', title: 'X' } })).status,
    ).toBe(404);

    // A linked parent reads the child's timetable; a stranger cannot.
    const parent = await newUser({ accountType: 'parent' });
    await call('POST', '/family/request', { token: parent.token, body: { who: student.email } });
    const fam = await call<FamilyDto>('GET', '/family', { token: student.token });
    await call('POST', `/family/requests/${fam.body.requests[0]!.id}/accept`, { token: student.token });
    const child = await call<{ items: TimetableEntryDto[] }>('GET', `/me/timetable?studentId=${student.user.id}`, { token: parent.token });
    expect(child.body.items).toHaveLength(2);
    const stranger = await newUser();
    expect((await call('GET', `/me/timetable?studentId=${student.user.id}`, { token: stranger.token })).status).toBe(403);
  });
});
