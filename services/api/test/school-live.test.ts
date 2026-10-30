import { describe, expect, it } from 'vitest';
import type {
  AcademicDashboardDto,
  AiAnswerDto,
  AssignmentDto,
  AttendanceSessionDto,
  CourseAnalyticsDto,
  CourseDto,
  CourseMaterialDto,
  GroupDto,
  LiveRoomDto,
  SubmissionDto,
} from '@qubedu/shared';
import { call, newUser } from './helpers';

describe('school', () => {
  it('course lifecycle: create, join by code, announce, assign, submit, grade, attendance, analytics', async () => {
    const teacher = await newUser({ name: 'Ms. Huda', accountType: 'teacher' });
    const student = await newUser({ name: 'Omar' });
    expect((await call('POST', '/school/courses', { token: student.token, body: { title: 'Nope' } })).status).toBe(403);
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Biology 2', subject: 'Biology' } });
    expect(course.status).toBe(201);
    expect(course.body.joinCode).toMatch(/^[a-z0-9]{7}$/);
    const joined = await call<CourseDto>('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });
    expect(joined.body.myRole).toBe('student');
    expect(joined.body.joinCode).toBeNull();
    expect(joined.body.memberCount).toBe(2);

    expect((await call('POST', `/school/courses/${course.body.id}/announcements`, { token: student.token, body: { text: 'x' } })).status).toBe(403);
    expect((await call('POST', `/school/courses/${course.body.id}/announcements`, { token: teacher.token, body: { text: 'Welcome!' } })).status).toBe(201);

    const rubric = await call<{ id: string }>('POST', `/school/courses/${course.body.id}/rubrics`, {
      token: teacher.token,
      body: {
        title: 'Essay',
        criteria: [
          {
            title: 'Clarity',
            levels: [
              { label: 'Good', points: 4 },
              { label: 'Weak', points: 1 },
            ],
          },
          { title: 'Evidence', levels: [{ label: 'Good', points: 6 }] },
        ],
      },
    });
    const a = await call<AssignmentDto>('POST', `/school/courses/${course.body.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Cell essay', points: 20, dueAt: Date.now() + 2 * 86400_000, rubricId: rubric.body.id },
    });
    expect(a.status).toBe(201);
    const draft = await call<AssignmentDto>('POST', `/school/courses/${course.body.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Hidden', state: 'draft' },
    });
    const list = await call<{ items: AssignmentDto[] }>('GET', `/school/courses/${course.body.id}/assignments`, { token: student.token });
    expect(list.body.items.map((x) => x.id)).toEqual([a.body.id]);
    expect((await call('GET', `/school/assignments/${draft.body.id}`, { token: student.token })).status).toBe(404);

    const dash = await call<AcademicDashboardDto>('GET', '/academic/dashboard', { token: student.token });
    expect(dash.body.inbox.some((i) => i.kind === 'assignment' && i.refId === a.body.id)).toBe(true);

    const sub = await call<SubmissionDto>('POST', `/school/assignments/${a.body.id}/submit`, { token: student.token, body: { text: 'Cells are...' } });
    expect(sub.status).toBe(201);
    const subs = await call<{ items: SubmissionDto[] }>('GET', `/school/assignments/${a.body.id}/submissions`, { token: teacher.token });
    expect(subs.body.items).toHaveLength(1);
    const graded = await call<SubmissionDto>('POST', `/school/submissions/${sub.body.id}/grade`, {
      token: teacher.token,
      body: { grade: 0, rubricScores: { Clarity: 4, Evidence: 6 }, feedback: 'Great' },
    });
    expect(graded.body.grade).toBe(20);
    expect(graded.body.status).toBe('returned');
    expect((await call('POST', `/school/assignments/${a.body.id}/submit`, { token: student.token, body: { text: 'again' } })).status).toBe(409);
    const mine = await call<AssignmentDto>('GET', `/school/assignments/${a.body.id}`, { token: student.token });
    expect(mine.body.mySubmission?.grade).toBe(20);

    const att = await call<AttendanceSessionDto>('POST', `/school/courses/${course.body.id}/attendance`, {
      token: teacher.token,
      body: { title: 'Lesson 1', day: '2026-10-01' },
    });
    await call('PUT', `/school/attendance/${att.body.id}`, {
      token: teacher.token,
      body: {
        records: [
          { studentId: student.user.id, status: 'present' },
          { studentId: teacher.user.id, status: 'absent' },
        ],
      },
    });
    const atts = await call<{ items: AttendanceSessionDto[] }>('GET', `/school/courses/${course.body.id}/attendance`, { token: student.token });
    expect(atts.body.items[0]!.records).toEqual({ [student.user.id]: 'present' });

    const analytics = await call<CourseAnalyticsDto>('GET', `/school/courses/${course.body.id}/analytics`, { token: teacher.token });
    expect(analytics.body.students).toBe(1);
    expect(analytics.body.averageGrade).toBe(100);
    expect(analytics.body.attendanceRate).toBe(100);
    expect((await call('GET', `/school/courses/${course.body.id}/analytics`, { token: student.token })).status).toBe(403);

    const material = await call<CourseMaterialDto>('POST', `/school/courses/${course.body.id}/materials`, {
      token: teacher.token,
      body: {
        title: 'Chapter 1',
        text: 'The Cell\n\nThe mitochondria is the powerhouse of the cell and produces ATP energy for the organism.\n\nNucleus\n\nThe nucleus stores the genetic information of the cell.',
      },
    });
    expect(material.body.chunkCount).toBe(2);
    const ai = await call<AiAnswerDto>('POST', '/ai/solve', {
      token: student.token,
      body: { question: 'What does the mitochondria produce?', courseId: course.body.id },
    });
    expect(ai.status).toBe(200);
    expect(ai.body.kind).toBe('retrieval');
    expect(ai.body.sources[0]!.title).toBe('Chapter 1');
    const outsider = await newUser();
    expect((await call('POST', '/ai/solve', { token: outsider.token, body: { question: 'x', courseId: course.body.id } })).status).toBe(403);
  });
});

describe('live rooms', () => {
  it('group moderators create rooms; members access; outsiders blocked; internal authorize agrees', async () => {
    const owner = await newUser({ accountType: 'teacher' });
    const member = await newUser();
    const outsider = await newUser();
    const g = await call<GroupDto>('POST', '/groups', { token: owner.token, body: { name: 'Live group', privacy: 'private' } });
    await call('POST', `/groups/${g.body.id}/join`, { token: member.token });
    await call('POST', `/groups/${g.body.id}/requests/${member.user.id}/approve`, { token: owner.token });
    expect((await call('POST', '/live', { token: member.token, body: { title: 'x', scopeType: 'group', scopeId: g.body.id } })).status).toBe(403);
    const room = await call<LiveRoomDto>('POST', '/live', { token: owner.token, body: { title: 'Revision', scopeType: 'group', scopeId: g.body.id } });
    expect(room.status).toBe(201);
    expect(room.body.iceServers.length).toBeGreaterThan(0);
    const started = await call<LiveRoomDto>('POST', `/live/${room.body.id}/start`, { token: owner.token });
    expect(started.body.status).toBe('live');
    expect((await call<LiveRoomDto>('GET', `/live/${room.body.id}`, { token: member.token })).body.canModerate).toBe(false);
    expect((await call('GET', `/live/${room.body.id}`, { token: outsider.token })).status).toBe(403);
    const list = await call<{ items: LiveRoomDto[] }>('GET', '/live', { token: member.token });
    expect(list.body.items[0]!.id).toBe(room.body.id);

    const auth = (uid: string, channel: string) =>
      call<{ allowed: boolean }>('GET', `/internal/authorize?uid=${uid}&channel=${channel}`, {
        headers: { 'x-internal-token': 'dev-internal-token-change-me' },
      });
    expect((await auth(member.user.id, `live:${room.body.id}`)).body.allowed).toBe(true);
    expect((await auth(outsider.user.id, `live:${room.body.id}`)).body.allowed).toBe(false);
    expect((await auth(member.user.id, `conv:${room.body.conversationId}`)).body.allowed).toBe(true);
    expect((await auth(outsider.user.id, `user:${member.user.id}`)).body.allowed).toBe(false);
    expect((await call('GET', `/internal/authorize?uid=${member.user.id}&channel=site`)).status).toBe(401);

    const chat = await call('POST', `/chat/conversations/${room.body.conversationId}/messages`, { token: member.token, body: { text: 'hello teacher' } });
    expect(chat.status).toBe(201);
    await call('POST', `/live/${room.body.id}/end`, { token: owner.token });
    expect((await auth(member.user.id, `live:${room.body.id}`)).body.allowed).toBe(false);
  });
});
