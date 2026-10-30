import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { BehaviorNoteDto, CourseDto, HomeworkAckItemDto, MeetingSlotDto, NotificationDto, Page, VoiceSummaryDto } from '@qubedu/shared';
import { guardianLinks, meetingSlots } from '../src/db/schema';
import { sendEarlyWarnings, sendMeetingReminders } from '../src/lib/earlyWarning';
import { call, newUser, setupApp } from './helpers';

async function family() {
  const teacher = await newUser({ name: 'Mr Samir', accountType: 'teacher' });
  const student = await newUser({ name: 'Omar Hassan' });
  const parent = await newUser({ name: 'Mona Hassan', accountType: 'parent' });
  const stranger = await newUser({ name: 'Other Parent', accountType: 'parent' });
  const course = (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Math 5A' } })).body;
  await call('POST', '/school/join', { token: student.token, body: { code: course.joinCode } });
  await call('PATCH', '/me/prefs', { token: parent.token, body: { appearance: { language: 'en' } } });
  await call('PATCH', '/me/prefs', { token: teacher.token, body: { appearance: { language: 'en' } } });
  return { teacher, student, parent, stranger, course };
}
const notesOf = async (token: string, type: string) =>
  (await call<Page<NotificationDto>>('GET', '/notifications', { token })).body.items.filter((n) => n.type === type);

describe('parent-teacher meetings', () => {
  it('lets a teacher publish slots, a parent book one, both be reminded, and either cancel', async () => {
    const { deps } = await setupApp();
    const { teacher, student, parent, stranger } = await family();
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: student.user.id });
    const start = Date.now() + 2 * 86_400_000;

    expect((await call('POST', '/meetings/slots', { token: parent.token, body: { startsAt: start, endsAt: start + 3_600_000 } })).status).toBe(403);
    expect(
      (await call('POST', '/meetings/slots', { token: teacher.token, body: { startsAt: start, endsAt: start + 5 * 3_600_000, slotMinutes: 10 } })).status,
    ).toBe(400);
    const made = await call<{ created: number }>('POST', '/meetings/slots', {
      token: teacher.token,
      body: { startsAt: start, endsAt: start + 3_600_000, slotMinutes: 15 },
    });
    expect(made.body.created).toBe(4);
    expect(
      (
        await call<{ created: number }>('POST', '/meetings/slots', {
          token: teacher.token,
          body: { startsAt: start, endsAt: start + 3_600_000, slotMinutes: 15 },
        })
      ).body.created,
    ).toBe(0);

    const list = await call<{ items: { teacher: { displayName: string }; children: { displayName: string }[]; slots: MeetingSlotDto[] }[] }>(
      'GET',
      '/meetings/teachers',
      { token: parent.token },
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ teacher: { displayName: 'Mr Samir' }, children: [{ displayName: 'Omar Hassan' }] });
    const slots = list.body.items[0]!.slots;
    expect(slots).toHaveLength(4);
    expect((await call<{ items: unknown[] }>('GET', '/meetings/teachers', { token: stranger.token })).body.items).toEqual([]);

    const book = { studentId: student.user.id, note: 'Fractions' };
    expect((await call('POST', `/meetings/slots/${slots[0]!.id}/book`, { token: stranger.token, body: book })).status).toBe(403);
    const booked = await call<MeetingSlotDto>('POST', `/meetings/slots/${slots[0]!.id}/book`, { token: parent.token, body: book });
    expect(booked.status).toBe(200);
    expect(booked.body).toMatchObject({ status: 'booked', mine: true, booking: { note: 'Fractions' } });
    expect((await call('POST', `/meetings/slots/${slots[0]!.id}/book`, { token: parent.token, body: book })).status).toBe(409);
    expect(await notesOf(teacher.token, 'meeting_booked')).toHaveLength(1);
    const mine = await call<{ items: MeetingSlotDto[] }>('GET', '/meetings/mine', { token: teacher.token });
    expect(mine.body.items.filter((s) => s.status === 'booked')[0]!.booking!.student.displayName).toBe('Omar Hassan');

    // Half an hour before: a reminder for both, once.
    await deps.db
      .update(meetingSlots)
      .set({ startsAt: new Date(Date.now() + 1_800_000), endsAt: new Date(Date.now() + 2_700_000) })
      .where(eq(meetingSlots.id, slots[0]!.id));
    expect(await sendMeetingReminders(deps)).toBeGreaterThanOrEqual(1);
    expect(await sendMeetingReminders(deps)).toBe(0);
    expect(await notesOf(parent.token, 'meeting_reminder')).toHaveLength(1);
    expect(await notesOf(teacher.token, 'meeting_reminder')).toHaveLength(1);

    // The parent cancels: the slot is free again and the teacher is told; the teacher cancels another booking.
    expect((await call('POST', `/meetings/slots/${slots[0]!.id}/cancel`, { token: stranger.token })).status).toBe(404);
    await call('POST', `/meetings/slots/${slots[0]!.id}/cancel`, { token: parent.token });
    expect((await call<{ items: MeetingSlotDto[] }>('GET', '/meetings/mine', { token: parent.token })).body.items).toEqual([]);
    expect(await notesOf(teacher.token, 'meeting_cancelled')).toHaveLength(1);
    await call('POST', `/meetings/slots/${slots[1]!.id}/book`, { token: parent.token, body: book });
    await call('POST', `/meetings/slots/${slots[1]!.id}/cancel`, { token: teacher.token });
    expect(await notesOf(parent.token, 'meeting_cancelled')).toHaveLength(1);
  });
});

describe('early warning', () => {
  it('tells the parents and the teacher once a week when a child is struggling', async () => {
    const { deps } = await setupApp();
    const { teacher, student, parent, course } = await family();
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: student.user.id });
    for (const t of ['A', 'B', 'C'])
      await call('POST', `/school/courses/${course.id}/assignments`, {
        token: teacher.token,
        body: { title: `Homework ${t}`, dueAt: Date.now() - 2 * 86_400_000 },
      });
    expect(await sendEarlyWarnings(deps)).toBeGreaterThanOrEqual(1);
    const warn = await notesOf(parent.token, 'early_warning');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.data).toMatchObject({ name: 'Omar Hassan' });
    expect(String(warn[0]!.data.reasons)).toContain('Missing homework');
    expect(await notesOf(teacher.token, 'early_warning_teacher')).toHaveLength(1);
    // Not again within the week.
    await sendEarlyWarnings(deps);
    expect(await notesOf(parent.token, 'early_warning')).toHaveLength(1);
  });
});

describe('behavior notes, homework acknowledgement and the spoken summary', () => {
  it('keeps notes to the family and teachers, lets a parent say "I saw it", and writes a summary in the parent’s language', async () => {
    const { deps } = await setupApp();
    const { teacher, student, parent, stranger, course } = await family();
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: student.user.id });

    expect(
      (
        await call('POST', '/behavior', {
          token: student.token,
          body: { courseId: course.id, studentId: student.user.id, kind: 'positive', text: 'I am great' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/behavior', {
          token: teacher.token,
          body: { courseId: course.id, studentId: stranger.user.id, kind: 'positive', text: 'Well done today' },
        })
      ).status,
    ).toBe(400);
    const note = await call<{ id: string }>('POST', '/behavior', {
      token: teacher.token,
      body: { courseId: course.id, studentId: student.user.id, kind: 'positive', text: 'Helped a classmate with fractions' },
    });
    expect(note.status).toBe(201);
    for (const u of [student, parent]) {
      const mine = await call<{ items: BehaviorNoteDto[] }>('GET', '/behavior', { token: u.token });
      expect(mine.body.items.map((n) => [n.kind, n.text, n.student.displayName])).toEqual([['positive', 'Helped a classmate with fractions', 'Omar Hassan']]);
      expect(await notesOf(u.token, 'behavior_note')).toHaveLength(1);
    }
    expect((await call<{ items: BehaviorNoteDto[] }>('GET', '/behavior', { token: stranger.token })).body.items).toEqual([]);
    expect((await call<{ items: BehaviorNoteDto[] }>('GET', '/behavior', { token: teacher.token })).body.items).toHaveLength(1);

    const hw = await call<{ id: string }>('POST', `/school/courses/${course.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Fractions homework', dueAt: Date.now() + 2 * 86_400_000 },
    });
    const items = await call<{ items: HomeworkAckItemDto[] }>('GET', '/parent/homework', { token: parent.token });
    expect(items.body.items).toEqual([expect.objectContaining({ assignmentId: hw.body.id, title: 'Fractions homework', status: 'upcoming', acked: false })]);
    expect((await call('POST', `/parent/homework/${hw.body.id}/ack`, { token: stranger.token, body: { studentId: student.user.id } })).status).toBe(403);
    expect((await call('POST', `/parent/homework/${hw.body.id}/ack`, { token: parent.token, body: { studentId: student.user.id } })).status).toBe(200);
    expect((await call('POST', `/parent/homework/${hw.body.id}/ack`, { token: parent.token, body: { studentId: student.user.id } })).status).toBe(200);
    expect((await call<{ items: HomeworkAckItemDto[] }>('GET', '/parent/homework', { token: parent.token })).body.items[0]!.acked).toBe(true);
    const acks = await call<{ acked: number; total: number }>('GET', `/parent/homework/${hw.body.id}/acks`, { token: teacher.token });
    expect([acks.body.acked, acks.body.total]).toEqual([1, 1]);
    expect((await call('GET', `/parent/homework/${hw.body.id}/acks`, { token: student.token })).status).toBe(403);

    const sum = await call<VoiceSummaryDto>('GET', `/parent/summary?studentId=${student.user.id}`, { token: parent.token });
    expect(sum.body.language).toBe('en');
    expect(sum.body.text).toContain('Omar studied');
    expect((await call('GET', `/parent/summary?studentId=${student.user.id}`, { token: stranger.token })).status).toBe(403);
  });
});
