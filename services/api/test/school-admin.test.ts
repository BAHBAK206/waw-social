import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  CourseDto,
  FeeDto,
  GradeComponentDto,
  InvoiceDto,
  MyInvoicesDto,
  NotificationDto,
  Page,
  SchoolDashboardDto,
  SchoolNewsDto,
  SchoolTimetableDto,
  SurveyDto,
} from '@qubedu/shared';
import { addDays, dayKey } from '@qubedu/shared';
import { courses, feeInvoices, guardianLinks, schoolMembers, uploads } from '../src/db/schema';
import { sendDueFeeReminders } from '../src/lib/feeReminders';
import { settleFeeInvoiceFromPaymob } from '../src/lib/feePayments';
import { call, newUser, setupApp } from './helpers';

async function school(deps: Awaited<ReturnType<typeof setupApp>>['deps']) {
  const admin = await newUser({ name: 'Principal Amal', accountType: 'teacher' });
  const teacher = await newUser({ name: 'Mr Samir', accountType: 'teacher' });
  const s1 = await newUser({ name: 'Ali Hassan' });
  const s2 = await newUser({ name: 'Sara Adel' });
  const parent = await newUser({ name: 'Mona Hassan', accountType: 'parent' });
  const sc = await call<{ id: string }>('POST', '/schools', { token: admin.token, body: { name: 'Al Nour School' } });
  const id = sc.body.id;
  await deps.db.insert(schoolMembers).values([
    { schoolId: id, userId: teacher.user.id, role: 'teacher', status: 'active' },
    { schoolId: id, userId: s1.user.id, role: 'student', status: 'active', section: '5A' },
    { schoolId: id, userId: s2.user.id, role: 'student', status: 'active', section: '5B' },
  ]);
  await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: s1.user.id });
  return { admin, teacher, s1, s2, parent, id };
}

describe('principal dashboard', () => {
  it('shows attendance, averages and pass rates per class and subject, for admins only', async () => {
    const { deps } = await setupApp();
    const { admin, teacher, s1, s2, id } = await school(deps);
    const mk = async (title: string, section: string) => {
      const c = (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title, subject: 'Mathematics' } })).body;
      await deps.db.update(courses).set({ schoolId: id, schoolSection: section }).where(eq(courses.id, c.id));
      return c;
    };
    const a = await mk('Math 5A', '5A');
    const b = await mk('Math 5B', '5B');
    for (const [c, s] of [
      [a, s1],
      [b, s2],
    ] as const) {
      await call('POST', '/school/join', { token: s.token, body: { code: c.joinCode } });
      await call('PATCH', `/school/courses/${c.id}`, { token: teacher.token, body: { maxMarks: 100, passMarks: 50 } });
      const comps = await call<{ items: GradeComponentDto[] }>('PUT', `/school/courses/${c.id}/components`, {
        token: teacher.token,
        body: { components: [{ name: 'Exam', maxMarks: 100, source: 'manual' }] },
      });
      await call('PUT', `/school/courses/${c.id}/marks`, {
        token: teacher.token,
        body: { marks: [{ componentId: comps.body.items[0]!.id, studentId: s.user.id, marks: c === a ? 80 : 40 }] },
      });
      const sess = await call<{ id: string }>('POST', `/school/courses/${c.id}/attendance`, {
        token: teacher.token,
        body: { day: dayKey(Date.now()), title: 'x' },
      });
      await call('PUT', `/school/attendance/${sess.body.id}`, {
        token: teacher.token,
        body: { records: [{ studentId: s.user.id, status: c === a ? 'present' : 'absent' }] },
      });
    }
    expect((await call('GET', `/schools/${id}/dashboard`, { token: teacher.token })).status).toBe(403);
    const d = await call<SchoolDashboardDto>('GET', `/schools/${id}/dashboard`, { token: admin.token });
    expect(d.status).toBe(200);
    expect(d.body.totals).toMatchObject({ classes: 2, students: 2, attendance: 50, average: 60, passRate: 50, graded: 2 });
    const byTitle = Object.fromEntries(d.body.classes.map((c) => [c.title, c]));
    expect(byTitle['Math 5A']).toMatchObject({ attendance: 100, average: 80, passRate: 100, section: '5A' });
    expect(byTitle['Math 5B']).toMatchObject({ attendance: 0, average: 40, passRate: 0 });
    expect(d.body.subjects).toHaveLength(1);
    expect(d.body.subjects[0]).toMatchObject({ subject: 'Mathematics', classes: 2, average: 60 });
  });
});

describe('school fees', () => {
  it('splits a fee into instalments, shows them to the student and parent, takes a transfer, and reminds on time', async () => {
    const { deps } = await setupApp();
    const { admin, teacher, s1, s2, parent, id } = await school(deps);
    const stranger = await newUser();
    expect(
      (
        await call('POST', `/schools/${id}/fees`, {
          token: teacher.token,
          body: { title: 'Tuition', amountCents: 300000, instalments: 3, firstDue: dayKey(Date.now()) },
        })
      ).status,
    ).toBe(403);

    const created = await call<{ id: string; invoices: number }>('POST', `/schools/${id}/fees`, {
      token: admin.token,
      body: { title: 'Tuition 5A', amountCents: 300001, instalments: 3, firstDue: addDays(dayKey(Date.now()), 2), section: '5A' },
    });
    expect(created.status).toBe(201);
    expect(created.body.invoices).toBe(3); // only the 5A student

    const mine = await call<MyInvoicesDto>('GET', '/schools/fees/mine', { token: s1.token });
    expect(mine.body.items.map((i) => i.amountCents)).toEqual([100001, 100000, 100000]);
    expect(mine.body.items.every((i) => i.student.displayName === 'Ali Hassan' && i.status === 'pending')).toBe(true);
    expect((await call<MyInvoicesDto>('GET', '/schools/fees/mine', { token: parent.token })).body.items).toHaveLength(3);
    expect((await call<MyInvoicesDto>('GET', '/schools/fees/mine', { token: s2.token })).body.items).toHaveLength(0);
    expect((await call<MyInvoicesDto>('GET', '/schools/fees/mine', { token: stranger.token })).body.items).toHaveLength(0);

    const feesList = await call<{ items: FeeDto[] }>('GET', `/schools/${id}/fees`, { token: admin.token });
    expect(feesList.body.items[0]).toMatchObject({ students: 1, paidCents: 0, outstandingCents: 300001 });

    // The first instalment is due in two days: the student and the parent are reminded, once.
    expect(await sendDueFeeReminders(deps)).toBe(1);
    expect(await sendDueFeeReminders(deps)).toBe(0);
    for (const u of [s1, parent]) {
      const n = await call<Page<NotificationDto>>('GET', '/notifications', { token: u.token });
      expect(n.body.items.filter((x) => x.type === 'fee_due')).toHaveLength(1);
    }

    // Paying by transfer: the school must have set how; a stranger can't pay for someone else's child.
    const first = mine.body.items[0]!;
    const stored = await deps.storage.put(new Uint8Array([1, 2, 3]), { mime: 'image/jpeg', ext: 'jpg', visibility: 'private' });
    await deps.db
      .insert(uploads)
      .values({ ownerId: parent.user.id, key: stored.key, mime: 'image/jpeg', size: 3, name: 'receipt.jpg', visibility: 'private', purpose: 'receipt' });
    const receipt = { url: `/files/${stored.key}`, name: 'receipt.jpg', mime: 'image/jpeg', size: 3, kind: 'image' };
    const body = { method: 'instapay', reference: 'TX12345', receipt, note: '' };
    expect((await call('POST', `/schools/fees/invoices/${first.id}/transfer`, { token: parent.token, body })).status).toBe(400);
    await call('PUT', `/schools/${id}/fees/transfer-info`, { token: admin.token, body: { instapay: 'school@instapay' } });
    expect((await call('POST', `/schools/fees/invoices/${first.id}/transfer`, { token: stranger.token, body })).status).toBe(404);
    expect((await call('POST', `/schools/fees/invoices/${first.id}/transfer`, { token: parent.token, body })).status).toBe(201);
    const review = await call<{ items: InvoiceDto[] }>('GET', `/schools/${id}/invoices?status=review`, { token: admin.token });
    expect(review.body.items).toHaveLength(1);
    expect(review.body.items[0]).toMatchObject({ reference: 'TX12345', method: 'instapay' });

    // Reject, then approve a second attempt.
    await call('PATCH', `/schools/${id}/invoices/${first.id}`, { token: admin.token, body: { action: 'reject', reason: 'Amount does not match' } });
    expect((await call<InvoiceDto>('GET', `/schools/fees/invoices/${first.id}`, { token: s1.token })).body).toMatchObject({
      status: 'pending',
      reason: 'Amount does not match',
    });
    await call('POST', `/schools/fees/invoices/${first.id}/transfer`, { token: parent.token, body });
    await call('PATCH', `/schools/${id}/invoices/${first.id}`, { token: admin.token, body: { action: 'paid' } });
    expect((await call<InvoiceDto>('GET', `/schools/fees/invoices/${first.id}`, { token: parent.token })).body).toMatchObject({
      status: 'paid',
      paidAt: expect.any(Number),
    });
    expect((await call('PATCH', `/schools/${id}/invoices/${first.id}`, { token: admin.token, body: { action: 'cancel' } })).status).toBe(409);
    expect((await call<{ items: FeeDto[] }>('GET', `/schools/${id}/fees`, { token: admin.token })).body.items[0]).toMatchObject({
      paidCents: 100001,
      outstandingCents: 200000,
    });

    // A card payment arrives from Paymob: only the exact amount settles the invoice.
    const second = mine.body.items[1]!;
    await deps.db.update(feeInvoices).set({ provider: 'paymob', method: 'paymob_card', paidBy: parent.user.id }).where(eq(feeInvoices.id, second.id));
    await settleFeeInvoiceFromPaymob(deps, second.id, { success: true, pending: false, amount_cents: 5, currency: 'EGP' });
    expect((await call<InvoiceDto>('GET', `/schools/fees/invoices/${second.id}`, { token: s1.token })).body.status).toBe('pending');
    await settleFeeInvoiceFromPaymob(deps, second.id, { success: true, pending: false, amount_cents: 100000, currency: 'EGP' });
    expect((await call<InvoiceDto>('GET', `/schools/fees/invoices/${second.id}`, { token: s1.token })).body.status).toBe('paid');
    expect(await settleFeeInvoiceFromPaymob(deps, '00000000-0000-4000-8000-000000000000', {})).toBe(false);
  });
});

describe('school news, calendar, timetable, surveys', () => {
  it('sends announcements to the right people, merges the calendar, finds timetable clashes, hands over a class and runs an anonymous survey', async () => {
    const { deps } = await setupApp();
    const { admin, teacher, s1, parent, id } = await school(deps);
    const other = await newUser({ name: 'Ms Hoda', accountType: 'teacher' });
    await deps.db.insert(schoolMembers).values({ schoolId: id, userId: other.user.id, role: 'teacher', status: 'active' });

    // Announcements: parents only → the parent is told, the student is not; everyone can still read "all".
    expect((await call('POST', `/schools/${id}/announcements`, { token: teacher.token, body: { title: 'x y' } })).status).toBe(403);
    const ann = await call<{ notified: number }>('POST', `/schools/${id}/announcements`, {
      token: admin.token,
      body: { title: 'Parents meeting on Thursday', body: 'At 5 pm', audience: 'parents' },
    });
    expect(ann.body.notified).toBe(1);
    await call('POST', `/schools/${id}/announcements`, { token: admin.token, body: { title: 'School trip', audience: 'all' } });
    const feed = (u: { token: string }) => call<SchoolNewsDto>('GET', `/schools/${id}/news`, { token: u.token });
    expect((await feed(s1)).body.announcements.map((a) => a.title)).toEqual(['School trip']);
    expect((await feed(parent)).body.announcements.map((a) => a.title).sort()).toEqual(['Parents meeting on Thursday', 'School trip']);
    expect(
      (await call<Page<NotificationDto>>('GET', '/notifications', { token: parent.token })).body.items.filter((n) => n.type === 'school_news'),
    ).toHaveLength(2);
    expect((await call<Page<NotificationDto>>('GET', '/notifications', { token: s1.token })).body.items.filter((n) => n.type === 'school_news')).toHaveLength(
      1,
    );

    const day = addDays(dayKey(Date.now()), 5);
    await call('POST', `/schools/${id}/events`, { token: admin.token, body: { title: 'Mid-year exams', day, endDay: addDays(day, 4), kind: 'exam' } });
    expect((await call('POST', `/schools/${id}/events`, { token: admin.token, body: { title: 'Bad', day, endDay: addDays(day, -1) } })).status).toBe(400);
    const course = (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Math 5A' } })).body;
    await deps.db.update(courses).set({ schoolId: id, schoolSection: '5A' }).where(eq(courses.id, course.id));
    await call('POST', '/school/join', { token: s1.token, body: { code: course.joinCode } });
    await call('POST', `/school/courses/${course.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Fractions homework', dueAt: Date.now() + 3 * 86_400_000 },
    });
    const news = (await feed(s1)).body;
    expect(news.events.map((e) => [e.title, e.kind])).toEqual([['Mid-year exams', 'exam']]);
    expect(news.agenda.map((a) => a.title)).toEqual(['Fractions homework']);

    // Timetable: two lessons for one teacher at the same time clash; a lesson for the same section does too.
    const course2 = (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Science 5A' } })).body;
    await deps.db.update(courses).set({ schoolId: id, schoolSection: '5A' }).where(eq(courses.id, course2.id));
    const slot = { day: 1, start: '09:00', end: '09:45', room: 'R1' };
    expect((await call('POST', `/schools/${id}/timetable`, { token: teacher.token, body: { courseId: course.id, ...slot } })).status).toBe(403);
    expect((await call('POST', `/schools/${id}/timetable`, { token: admin.token, body: { courseId: course.id, ...slot, end: '08:00' } })).status).toBe(400);
    await call('POST', `/schools/${id}/timetable`, { token: admin.token, body: { courseId: course.id, ...slot } });
    const clash = await call<{ id: string }>('POST', `/schools/${id}/timetable`, {
      token: admin.token,
      body: { courseId: course2.id, ...slot, start: '09:30', end: '10:15', room: 'R1' },
    });
    const tt = await call<SchoolTimetableDto>('GET', `/schools/${id}/timetable`, { token: s1.token });
    expect(tt.body.items).toHaveLength(2);
    expect(tt.body.sections).toEqual(['5A']);
    expect(tt.body.conflicts.map((c) => c.kind).sort()).toEqual(['room', 'section', 'teacher']);
    // Give the second class to another teacher: the teacher and the room clash stay only where they still apply.
    expect((await call('PUT', `/schools/${id}/classes/${course2.id}/teacher`, { token: admin.token, body: { teacherId: s1.user.id } })).status).toBe(400);
    expect((await call('PUT', `/schools/${id}/classes/${course2.id}/teacher`, { token: admin.token, body: { teacherId: other.user.id } })).status).toBe(200);
    const after = await call<SchoolTimetableDto>('GET', `/schools/${id}/timetable`, { token: s1.token });
    expect(after.body.conflicts.map((c) => c.kind).sort()).toEqual(['room', 'section']);
    expect((await call('DELETE', `/schools/${id}/timetable/${clash.body.id}`, { token: admin.token })).status).toBe(200);
    expect((await call<SchoolTimetableDto>('GET', `/schools/${id}/timetable`, { token: s1.token })).body.conflicts).toEqual([]);

    // Survey for students: anonymous, one answer each, results only for the admin.
    const sv = await call<{ id: string }>('POST', `/schools/${id}/surveys`, {
      token: admin.token,
      body: {
        title: 'How is school?',
        audience: 'students',
        questions: [
          { text: 'Do you feel safe?', kind: 'rating' },
          { text: 'Any comments?', kind: 'text' },
        ],
      },
    });
    expect(sv.status).toBe(201);
    expect((await call<{ items: SurveyDto[] }>('GET', `/schools/${id}/surveys`, { token: parent.token })).body.items).toEqual([]);
    const list = await call<{ items: SurveyDto[] }>('GET', `/schools/${id}/surveys`, { token: s1.token });
    expect(list.body.items[0]).toMatchObject({ answered: false, responses: null });
    const ans = { answers: { q1: 5, q2: 'More sports please' } };
    expect((await call('POST', `/schools/${id}/surveys/${sv.body.id}/answer`, { token: s1.token, body: ans })).status).toBe(201);
    expect((await call('POST', `/schools/${id}/surveys/${sv.body.id}/answer`, { token: s1.token, body: ans })).status).toBe(409);
    expect((await call('POST', `/schools/${id}/surveys/${sv.body.id}/answer`, { token: parent.token, body: ans })).status).toBe(404);
    expect((await call<{ items: SurveyDto[] }>('GET', `/schools/${id}/surveys`, { token: s1.token })).body.items[0]!.answered).toBe(true);
    expect((await call('GET', `/schools/${id}/surveys/${sv.body.id}/results`, { token: s1.token })).status).toBe(403);
    const res = await call<{ responses: number; questions: { average: number | null; texts: string[] }[] }>(
      'GET',
      `/schools/${id}/surveys/${sv.body.id}/results`,
      { token: admin.token },
    );
    expect(res.body.responses).toBe(1);
    expect(res.body.questions[0]!.average).toBe(5);
    expect(res.body.questions[1]!.texts).toEqual(['More sports please']);
    expect(JSON.stringify(res.body)).not.toContain(s1.user.id);
    await call('POST', `/schools/${id}/surveys/${sv.body.id}/close`, { token: admin.token });
    expect((await call('POST', `/schools/${id}/surveys/${sv.body.id}/answer`, { token: (await newUser()).token, body: ans })).status).toBe(404);
  });
});
