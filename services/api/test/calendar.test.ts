import type { CourseDto, NotificationDto, Page } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser, setupApp } from './helpers';

describe('calendar feed', () => {
  it('gives each person a secret link with homework, exams and tasks; resetting it kills the old link', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser({ name: 'Nour' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Chemistry 9' } });
    await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });
    const due = Date.now() + 3 * 86400_000;
    await call('POST', `/school/courses/${course.body.id}/assignments`, { token: teacher.token, body: { title: 'Acids and bases worksheet', dueAt: due } });
    const day = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    expect((await call('POST', '/exams', { token: student.token, body: { subject: 'Chemistry final', day, time: '09:30', place: 'Hall B' } })).status).toBe(
      201,
    );

    const link = await call<{ url: string }>('GET', '/me/calendar', { token: student.token });
    expect(link.body.url).toMatch(/\/api\/v1\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);
    // Same link next time.
    expect((await call<{ url: string }>('GET', '/me/calendar', { token: student.token })).body.url).toBe(link.body.url);

    const path = new URL(link.body.url).pathname;
    const feed = await call<string>('GET', path);
    expect(feed.headers.get('content-type')).toContain('text/calendar');
    expect(feed.body).toContain('X-WR-CALNAME:Qubedu — Nour');
    expect(feed.body).toContain('SUMMARY:📝 Acids and bases worksheet');
    expect(feed.body).toContain(`DTSTART:${day.replace(/-/g, '')}T093000Z`);
    expect(feed.body).toContain('LOCATION:Hall B');

    const reset = await call<{ url: string }>('POST', '/me/calendar/reset', { token: student.token });
    expect(reset.body.url).not.toBe(link.body.url);
    expect((await call('GET', path)).status).toBe(404);
  });
});

describe('class roster import', () => {
  it('adds existing accounts, skips members and emails the rest an invitation', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ name: 'Ms Rana', accountType: 'teacher' });
    const known = await newUser();
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'English 8' } });
    const before = deps.mailer.outbox.length;
    const stranger = `new.${Date.now()}@school.test`;
    const r = await call<{ added: number; already: number; invited: number }>('POST', `/school/courses/${course.body.id}/roster`, {
      token: teacher.token,
      body: { emails: [known.email.toUpperCase(), known.email, stranger, teacher.email] },
    });
    expect(r.body).toEqual({ added: 1, already: 1, invited: 1 });
    const mail = deps.mailer.outbox.slice(before).find((m) => m.to === stranger)!;
    expect(mail.text).toContain(course.body.joinCode!);
    const n = await call<Page<NotificationDto>>('GET', '/notifications', { token: known.token });
    expect(n.body.items.some((x) => x.type === 'course_added')).toBe(true);
    expect((await call('POST', `/school/courses/${course.body.id}/roster`, { token: known.token, body: { emails: [stranger] } })).status).toBe(403);
  });
});
