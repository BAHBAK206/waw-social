import type { CourseDto, Me, TeacherVerificationDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser, rootUser } from './helpers';

describe('teacher verification and account permissions', () => {
  it('an unverified teacher teaches private classes; public powers wait for an administrator', async () => {
    const t = await newUser({ accountType: 'teacher', verified: false, name: 'New Teacher' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: t.token, body: { title: 'Physics 1' } });
    expect(course.status).toBe(201);
    // Catalog and paid courses need verification.
    expect((await call('PATCH', `/school/courses/${course.body.id}`, { token: t.token, body: { listed: true } })).body).toMatchObject({
      error: { code: 'verified_teacher_required' },
    });
    expect((await call('PATCH', `/school/courses/${course.body.id}`, { token: t.token, body: { priceCents: 500 } })).status).toBe(403);
    // Open public live classes too; a class room is fine.
    expect((await call('POST', '/live', { token: t.token, body: { title: 'Open Q&A', scopeType: 'open' } })).status).toBe(403);
    expect((await call('POST', '/live', { token: t.token, body: { title: 'Class', scopeType: 'course', scopeId: course.body.id } })).status).toBe(201);

    // Students and parents can't ask to be verified; the teacher can, once at a time.
    const student = await newUser();
    expect((await call('POST', '/me/teacher-verification', { token: student.token, body: { institution: 'X School', subject: 'Math' } })).status).toBe(403);
    expect(
      (
        await call('POST', '/me/teacher-verification', {
          token: t.token,
          body: { institution: 'Nile School', subject: 'Physics', proofUrl: 'javascript:alert(1)' },
        })
      ).status,
    ).toBe(400);
    const req = await call<TeacherVerificationDto>('POST', '/me/teacher-verification', {
      token: t.token,
      body: { institution: 'Nile School', subject: 'Physics', note: 'Grade 10 physics', proofUrl: 'https://nile.example/staff' },
    });
    expect(req.status).toBe(201);
    expect((await call('POST', '/me/teacher-verification', { token: t.token, body: { institution: 'Nile School', subject: 'Physics' } })).status).toBe(409);

    // Only staff with the right permission review requests.
    expect((await call('GET', '/admin/teacher-verifications', { token: student.token })).status).toBe(403);
    const root = await rootUser();
    const queue = await call<{ items: TeacherVerificationDto[] }>('GET', '/admin/teacher-verifications', { token: root.token });
    expect(queue.body.items.some((x) => x.id === req.body.id && x.user.id === t.user.id)).toBe(true);
    expect((await call('POST', `/admin/teacher-verifications/${req.body.id}/approve`, { token: root.token })).status).toBe(200);

    const me = (await call<Me>('GET', '/me', { token: t.token })).body;
    expect(me.verifiedTeacher).toBe(true);
    expect(me.institution).toBe('Nile School');
    expect((await call('PATCH', `/school/courses/${course.body.id}`, { token: t.token, body: { listed: true } })).status).toBe(200);
    expect((await call('POST', '/me/teacher-verification', { token: t.token, body: { institution: 'Nile School', subject: 'Physics' } })).status).toBe(409);

    // Removing the verification takes the public powers away again.
    await call('DELETE', `/admin/teacher-verifications/users/${t.user.id}`, { token: root.token });
    expect((await call('POST', '/live', { token: t.token, body: { title: 'Open Q&A', scopeType: 'open' } })).status).toBe(403);
  });

  it('a rejected request carries the reason and can be sent again', async () => {
    const t = await newUser({ accountType: 'teacher', verified: false });
    const req = await call<TeacherVerificationDto>('POST', '/me/teacher-verification', { token: t.token, body: { institution: 'Unknown', subject: 'Art' } });
    const root = await rootUser();
    await call('POST', `/admin/teacher-verifications/${req.body.id}/reject`, { token: root.token, body: { reason: 'Please add a link to your school page.' } });
    const mine = await call<{ verified: boolean; request: TeacherVerificationDto }>('GET', '/me/teacher-verification', { token: t.token });
    expect(mine.body).toMatchObject({ verified: false, request: { status: 'rejected', reason: 'Please add a link to your school page.' } });
    expect(
      (await call('POST', '/me/teacher-verification', { token: t.token, body: { institution: 'Unknown', subject: 'Art', proofUrl: 'https://x.example' } }))
        .status,
    ).toBe(201);
  });
});
