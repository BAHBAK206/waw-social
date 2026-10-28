import { describe, expect, it } from 'vitest';
import type { AssignmentDto, ChildReportDto, CourseDto, CourseInsightsDto, FamilyDto, NotificationDto, Page, StudentInsightDto } from '@qubedu/shared';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema';
import { sendWeeklyReports } from '../src/routes/family';
import { call, newUser, setupApp } from './helpers';

async function classroom() {
  const teacher = await newUser({ name: 'Ms Huda', accountType: 'teacher' });
  const student = await newUser({ name: 'Yusuf' });
  const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Science 7', subject: 'Science' } });
  await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });
  return { teacher, student, course: course.body };
}

describe('family', () => {
  it('a student gives a one-time code; the parent sees study time, coursework and signals; either side can unlink', async () => {
    const { teacher, student, course } = await classroom();
    const parent = await newUser({ name: 'Mama', accountType: 'parent' });
    const stranger = await newUser({ accountType: 'parent' });

    // Only students make codes, only parents redeem them.
    expect((await call('POST', '/family/code', { token: parent.token })).status).toBe(403);
    const code = await call<{ code: string }>('POST', '/family/code', { token: student.token });
    expect(code.body.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await call('POST', '/family/link', { token: teacher.token, body: { code: code.body.code } })).status).toBe(403);
    expect((await call('POST', '/family/link', { token: parent.token, body: { code: 'WRONGCOD' } })).status).toBe(400);
    const link = await call<{ child: { id: string } }>('POST', '/family/link', { token: parent.token, body: { code: code.body.code.toLowerCase() } });
    expect(link.body.child.id).toBe(student.user.id);
    // The code worked once.
    expect((await call('POST', '/family/link', { token: stranger.token, body: { code: code.body.code } })).status).toBe(400);

    const notes = await call<Page<NotificationDto>>('GET', '/notifications', { token: student.token });
    expect(notes.body.items.some((n) => n.type === 'guardian_linked')).toBe(true);

    await call('POST', `/school/courses/${course.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Plant cells worksheet', points: 10, dueAt: Date.now() - 86400_000 },
    });
    const fam = await call<FamilyDto>('GET', '/family', { token: parent.token });
    expect(fam.body.children.map((c) => c.id)).toEqual([student.user.id]);
    const report = await call<ChildReportDto>('GET', `/family/children/${student.user.id}`, { token: parent.token });
    expect(report.body.days).toHaveLength(14);
    expect(report.body.courses[0]!.title).toBe('Science 7');
    expect(report.body.courses[0]!.teacher).toBe('Ms Huda');
    expect(report.body.courses[0]!.assignments[0]).toMatchObject({ title: 'Plant cells worksheet', status: 'missing' });
    expect(report.body.signals.missing).toBe(1);
    expect(report.body.risk.reasons).toContain('missingWork');

    expect((await call('GET', `/family/children/${student.user.id}`, { token: stranger.token })).status).toBe(403);
    expect((await call<FamilyDto>('GET', '/family', { token: student.token })).body.guardians.map((g) => g.id)).toEqual([parent.user.id]);

    // Weekly report goes out once the week has passed.
    const { deps } = await setupApp();
    const { guardianLinks } = await import('../src/db/schema');
    await deps.db
      .update(guardianLinks)
      .set({ lastReportAt: new Date(Date.now() - 8 * 86400_000) })
      .where(eq(guardianLinks.studentId, student.user.id));
    await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, parent.user.id));
    const before = deps.mailer.outbox.length;
    expect(await sendWeeklyReports(deps)).toBeGreaterThanOrEqual(1);
    const weekly = await call<Page<NotificationDto>>('GET', '/notifications', { token: parent.token });
    expect(weekly.body.items.find((n) => n.type === 'weekly_report')?.data).toMatchObject({ name: 'Yusuf', missing: 1 });
    expect(deps.mailer.outbox.slice(before).some((m) => m.to === parent.email)).toBe(true);

    // The student removes the parent.
    await call('DELETE', `/family/${parent.user.id}`, { token: student.token });
    expect((await call('GET', `/family/children/${student.user.id}`, { token: parent.token })).status).toBe(403);
  });
});

describe('who needs help', () => {
  it('ranks a class by risk, lists at-risk students across classes and lets the teacher nudge one', async () => {
    const { teacher, student, course } = await classroom();
    const steady = await newUser({ name: 'Steady' });
    await call('POST', '/school/join', { token: steady.token, body: { code: course.joinCode } });
    const a = await call<AssignmentDto>('POST', `/school/courses/${course.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Lab report', points: 20, dueAt: Date.now() - 3600_000 },
    });
    await call('POST', `/school/assignments/${a.body.id}/submit`, { token: steady.token, body: { text: 'My lab report about plant cells.' } });

    expect((await call('GET', `/school/courses/${course.id}/insights`, { token: student.token })).status).toBe(403);
    const ins = await call<CourseInsightsDto>('GET', `/school/courses/${course.id}/insights`, { token: teacher.token });
    expect(ins.body.students[0]!.student.id).toBe(student.user.id);
    expect(ins.body.students[0]!.risk.reasons).toContain('missingWork');
    const steadyRow = ins.body.students.find((s) => s.student.id === steady.user.id)!;
    expect(steadyRow.signals.missing).toBe(0);

    const all = await call<{ items: (StudentInsightDto & { courses: string[] })[] }>('GET', '/school/at-risk', { token: teacher.token });
    expect(all.body.items.map((i) => i.student.id)).toContain(student.user.id);
    expect(all.body.items.find((i) => i.student.id === student.user.id)!.courses).toEqual(['Science 7']);

    const nudge = await call('POST', `/school/courses/${course.id}/nudge`, {
      token: teacher.token,
      body: { studentId: student.user.id, message: 'You can do it — hand in the lab report today.' },
    });
    expect(nudge.status).toBe(200);
    const n = await call<Page<NotificationDto>>('GET', '/notifications', { token: student.token });
    expect(n.body.items.find((x) => x.type === 'teacher_nudge')?.data).toMatchObject({ name: 'Ms Huda', course: 'Science 7' });
    expect(
      (await call('POST', `/school/courses/${course.id}/nudge`, { token: teacher.token, body: { studentId: teacher.user.id, message: 'x' } })).status,
    ).toBe(404);
  });
});
