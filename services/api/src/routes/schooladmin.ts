import { createHmac } from 'node:crypto';
import {
  addDays,
  announcementInputSchema,
  classTeacherSchema,
  dayKey,
  feeInputSchema,
  instalmentSchedule,
  invoiceActionSchema,
  invoicePaySchema,
  schoolEventInputSchema,
  schoolTransferInfoSchema,
  slotInputSchema,
  summarizeSurvey,
  surveyAnswerSchema,
  surveyInputSchema,
  timetableConflicts,
  transferRequestSchema,
  type FeeDto,
  type InvoiceDto,
  type MyInvoicesDto,
  type SchoolDashboardDto,
  type SchoolDashboardRow,
  type SchoolNewsDto,
  type SchoolSlotDto,
  type SchoolTimetableDto,
  type SurveyDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseMembers,
  courses,
  feeInvoices,
  guardianLinks,
  schoolAnnouncements,
  schoolEvents,
  schoolFees,
  schoolMembers,
  schools,
  schoolSurveys,
  surveyResponses,
  timetableEntries,
  users,
} from '../db/schema';
import { readableAttachment, ownAttachment, type StoredAttachment } from '../lib/attachments';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { computeGradebook } from '../lib/gradebook';
import { body, param, requireUser } from '../lib/http';
import { notify } from '../lib/notify';
import { messagePerson } from '../lib/parentMessages';
import { checkRate } from '../middleware';
import { paymentMethodsFor, paymob } from './catalog';
import { membership, requireSchoolRole } from './schools';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Admin, or the student themselves, or a parent linked to the student. */
async function canSeeStudent(deps: Deps, viewer: AuthUser, studentId: string): Promise<boolean> {
  if (viewer.id === studentId) return true;
  const [link] = await deps.db
    .select({ g: guardianLinks.guardianId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, viewer.id), eq(guardianLinks.studentId, studentId)));
  return !!link;
}

/* ───────── Principal dashboard ───────── */

function aggregate(rows: { students: number; attendance: { here: number; total: number }; percents: number[]; passed: number }[]): SchoolDashboardRow {
  const students = rows.reduce((n, r) => n + r.students, 0);
  const here = rows.reduce((n, r) => n + r.attendance.here, 0);
  const total = rows.reduce((n, r) => n + r.attendance.total, 0);
  const percents = rows.flatMap((r) => r.percents);
  const passed = rows.reduce((n, r) => n + r.passed, 0);
  return {
    students,
    attendance: total ? Math.round((here / total) * 100) : null,
    average: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    passRate: percents.length ? Math.round((passed / percents.length) * 100) : null,
    graded: percents.length,
  };
}

async function dashboard(deps: Deps, schoolId: string): Promise<SchoolDashboardDto> {
  const rows = await deps.db
    .select({ c: courses, teacher: users.displayName })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(and(eq(courses.schoolId, schoolId), eq(courses.archived, false)))
    .orderBy(asc(courses.schoolSection), asc(courses.title));
  const since = dayKey(Date.now() - 30 * 86_400_000);
  const parts: { courseId: string; students: number; attendance: { here: number; total: number }; percents: number[]; passed: number }[] = [];
  for (const { c } of rows) {
    const students = await deps.db
      .select({ id: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, c.id), eq(courseMembers.role, 'student')));
    const [att] = await deps.db
      .select({
        total: sql<number>`count(*)::int`,
        here: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present','late','excused'))::int`,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .where(and(eq(attendanceSessions.courseId, c.id), gte(attendanceSessions.day, since)));
    const g = await computeGradebook(
      deps,
      c,
      students.map((s) => s.id),
      false,
    );
    const graded = [...g.rows.values()].filter((r) => r.result.percent !== null);
    parts.push({
      courseId: c.id,
      students: students.length,
      attendance: { here: att?.here ?? 0, total: att?.total ?? 0 },
      percents: graded.map((r) => r.result.percent as number),
      passed: graded.filter((r) => r.result.passed).length,
    });
  }
  const classes = rows.map(({ c, teacher }, i) => ({
    courseId: c.id,
    title: c.title,
    section: c.schoolSection,
    subject: c.subjectCode ?? c.subject ?? c.title,
    teacher,
    ...aggregate([parts[i]!]),
  }));
  const bySubject = new Map<string, number[]>();
  classes.forEach((c, i) => bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), i]));
  const subjects = [...bySubject].map(([subject, idx]) => ({ subject, classes: idx.length, ...aggregate(idx.map((i) => parts[i]!)) }));
  return { totals: { ...aggregate(parts), classes: classes.length }, classes, subjects, generatedAt: Date.now() };
}

/* ───────── Fees ───────── */

async function invoiceDtos(deps: Deps, rows: (typeof feeInvoices.$inferSelect)[]): Promise<InvoiceDto[]> {
  if (!rows.length) return [];
  const [fees, people, schoolRows, counts] = await Promise.all([
    deps.db
      .select({ id: schoolFees.id, title: schoolFees.title, instalments: schoolFees.instalments })
      .from(schoolFees)
      .where(
        inArray(
          schoolFees.id,
          rows.map((r) => r.feeId),
        ),
      ),
    deps.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(
        inArray(
          users.id,
          rows.map((r) => r.studentId),
        ),
      ),
    deps.db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(
        inArray(
          schools.id,
          rows.map((r) => r.schoolId),
        ),
      ),
    Promise.resolve(null),
  ]);
  void counts;
  const feeBy = new Map(fees.map((f) => [f.id, f]));
  const person = new Map(people.map((p) => [p.id, p]));
  const school = new Map(schoolRows.map((s) => [s.id, s.name]));
  const today = dayKey(Date.now());
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      feeTitle: feeBy.get(r.feeId)?.title ?? '',
      schoolId: r.schoolId,
      schoolName: school.get(r.schoolId) ?? '',
      student: person.get(r.studentId)!,
      no: r.no,
      of: feeBy.get(r.feeId)?.instalments ?? 1,
      amountCents: r.amountCents,
      currency: r.currency,
      dueDay: r.dueDay,
      status: r.status,
      late: r.status === 'pending' && r.dueDay < today,
      method: r.method,
      reference: r.reference,
      reason: r.reason,
      paidAt: r.paidAt?.getTime() ?? null,
      receipt: await readableAttachment(deps, r.receipt as StoredAttachment | null),
    })),
  );
}

export const schoolFeeRoutes = new Hono<AppEnv>()
  /** The student's own instalments, or those of the children a parent is linked to. */
  .get('/fees/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const kids = await deps.db.select({ id: guardianLinks.studentId }).from(guardianLinks).where(eq(guardianLinks.guardianId, user.id));
    const ids = [user.id, ...kids.map((k) => k.id)];
    const rows = await deps.db
      .select()
      .from(feeInvoices)
      .where(and(inArray(feeInvoices.studentId, ids), ne(feeInvoices.status, 'cancelled')))
      .orderBy(asc(feeInvoices.dueDay))
      .limit(200);
    const schoolIds = [...new Set(rows.map((r) => r.schoolId))];
    const infos = schoolIds.length ? await deps.db.select({ id: schools.id, t: schools.transferInfo }).from(schools).where(inArray(schools.id, schoolIds)) : [];
    const dto: MyInvoicesDto = {
      items: await invoiceDtos(deps, rows),
      cardMethods: paymentMethodsFor(deps.env, 'EGP').filter((m): m is 'paymob_card' | 'paymob_wallet' => m !== 'stripe'),
      transfer: Object.fromEntries(infos.map((i) => [i.id, i.t ?? null])),
    };
    return c.json(dto);
  })
  .post('/fees/invoices/:iid/pay', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'fee-pay', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, invoicePaySchema);
    const [inv] = await deps.db
      .select()
      .from(feeInvoices)
      .where(eq(feeInvoices.id, param(c, 'iid')));
    if (!inv || !(await canSeeStudent(deps, user, inv.studentId))) throw notFound();
    if (inv.status !== 'pending') throw conflict('invoice_not_payable');
    if (inv.currency !== 'EGP' || !paymentMethodsFor(deps.env, 'EGP').includes(input.method)) throw new AppError(503, 'card_payments_off');
    if (input.method === 'paymob_wallet' && !input.phone) throw badRequest('phone_required');
    const [fee] = await deps.db.select({ title: schoolFees.title }).from(schoolFees).where(eq(schoolFees.id, inv.feeId));
    const [me] = await deps.db.select({ email: users.email, name: users.displayName }).from(users).where(eq(users.id, user.id));
    // Mark which payer and provider this attempt uses; a later webhook with this id settles the invoice.
    await deps.db.update(feeInvoices).set({ provider: 'paymob', method: input.method, paidBy: user.id }).where(eq(feeInvoices.id, inv.id));
    const [first, ...rest] = (me?.name ?? 'Parent').trim().split(/\s+/);
    const intention = await paymob<{ client_secret: string }>(deps, '/v1/intention/', {
      amount: inv.amountCents,
      currency: 'EGP',
      payment_methods: [input.method === 'paymob_card' ? deps.env.PAYMOB_CARD_INTEGRATION_ID : deps.env.PAYMOB_WALLET_INTEGRATION_ID],
      items: [{ name: (fee?.title ?? 'School fee').slice(0, 50), amount: inv.amountCents, quantity: 1, description: `Instalment ${inv.no}` }],
      billing_data: {
        first_name: first || 'Parent',
        last_name: rest.join(' ') || 'NA',
        email: me?.email ?? 'NA',
        phone_number: input.phone ?? 'NA',
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        city: 'NA',
        country: 'EG',
        state: 'NA',
        postal_code: 'NA',
      },
      special_reference: inv.id,
      notification_url: `${deps.env.API_PUBLIC_URL.replace(/\/$/, '')}/webhooks/paymob`,
      redirection_url: `${deps.env.APP_URL.replace(/\/$/, '')}/fees?paid=1`,
    });
    const base = deps.env.PAYMOB_API_URL.replace(/\/$/, '');
    return c.json({
      url: `${base}/unifiedcheckout/?publicKey=${encodeURIComponent(deps.env.PAYMOB_PUBLIC_KEY!)}&clientSecret=${encodeURIComponent(intention.client_secret)}`,
    });
  })
  .post('/fees/invoices/:iid/transfer', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'fee-transfer', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, transferRequestSchema);
    const [inv] = await deps.db
      .select()
      .from(feeInvoices)
      .where(eq(feeInvoices.id, param(c, 'iid')));
    if (!inv || !(await canSeeStudent(deps, user, inv.studentId))) throw notFound();
    if (inv.status !== 'pending') throw conflict('invoice_not_payable');
    const [school] = await deps.db.select({ t: schools.transferInfo }).from(schools).where(eq(schools.id, inv.schoolId));
    if (!school?.t || !school.t[input.method]) throw badRequest('transfer_method_off');
    const receipt = await ownAttachment(deps, user, input.receipt, '');
    if (!receipt.mime.startsWith('image/') && receipt.mime !== 'application/pdf') throw badRequest('invalid_media_url');
    await deps.db
      .update(feeInvoices)
      .set({ status: 'review', provider: 'transfer', method: input.method, reference: input.reference, receipt, paidBy: user.id, reason: null })
      .where(eq(feeInvoices.id, inv.id));
    const admins = await deps.db
      .select({ id: schoolMembers.userId })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, inv.schoolId), eq(schoolMembers.role, 'admin'), eq(schoolMembers.status, 'active')));
    await notify(
      deps,
      admins.map((a) => ({
        userId: a.id,
        actorId: user.id,
        type: 'fee_transfer_pending',
        icon: 'wallet',
        link: `/schools/${inv.schoolId}?tab=fees`,
        data: { name: user.displayName },
        pref: 'school' as const,
      })),
    );
    return c.json({ ok: true }, 201);
  })
  .get('/fees/invoices/:iid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [inv] = await deps.db
      .select()
      .from(feeInvoices)
      .where(eq(feeInvoices.id, param(c, 'iid')));
    if (!inv) throw notFound();
    const m = await membership(deps, inv.schoolId, user.id);
    if (!(m?.status === 'active' && m.role === 'admin') && !(await canSeeStudent(deps, user, inv.studentId))) throw notFound();
    return c.json((await invoiceDtos(deps, [inv]))[0]);
  })
  .get('/:id/fees', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const fees = await deps.db
      .select()
      .from(schoolFees)
      .where(eq(schoolFees.schoolId, param(c, 'id')))
      .orderBy(desc(schoolFees.createdAt));
    const sums = fees.length
      ? await deps.db
          .select({
            feeId: feeInvoices.feeId,
            students: sql<number>`count(distinct ${feeInvoices.studentId})::int`,
            paid: sql<number>`coalesce(sum(${feeInvoices.amountCents}) filter (where ${feeInvoices.status} = 'paid'), 0)::int`,
            open: sql<number>`coalesce(sum(${feeInvoices.amountCents}) filter (where ${feeInvoices.status} in ('pending','review')), 0)::int`,
          })
          .from(feeInvoices)
          .where(
            inArray(
              feeInvoices.feeId,
              fees.map((f) => f.id),
            ),
          )
          .groupBy(feeInvoices.feeId)
      : [];
    const by = new Map(sums.map((s) => [s.feeId, s]));
    const [school] = await deps.db
      .select({ t: schools.transferInfo })
      .from(schools)
      .where(eq(schools.id, param(c, 'id')));
    const items: FeeDto[] = fees.map((f) => ({
      id: f.id,
      title: f.title,
      amountCents: f.amountCents,
      currency: f.currency,
      instalments: f.instalments,
      firstDue: f.firstDue,
      section: f.section,
      students: by.get(f.id)?.students ?? 0,
      paidCents: by.get(f.id)?.paid ?? 0,
      outstandingCents: by.get(f.id)?.open ?? 0,
    }));
    return c.json({ items, transferInfo: school?.t ?? null });
  })
  .put('/:id/fees/transfer-info', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const info = await body(c, schoolTransferInfoSchema);
    await deps.db
      .update(schools)
      .set({ transferInfo: info })
      .where(eq(schools.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  /** Creates the fee and one invoice per instalment for every active student (of the section, when one is chosen). */
  .post('/:id/fees', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'fee-create', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    await requireSchoolRole(deps, schoolId, user, ['admin']);
    const input = await body(c, feeInputSchema);
    const students = await deps.db
      .select({ id: schoolMembers.userId })
      .from(schoolMembers)
      .where(
        and(
          eq(schoolMembers.schoolId, schoolId),
          eq(schoolMembers.role, 'student'),
          eq(schoolMembers.status, 'active'),
          input.section ? eq(schoolMembers.section, input.section) : undefined,
        ),
      );
    if (!students.length) throw badRequest('no_students');
    const plan = instalmentSchedule(input.amountCents, input.instalments, input.firstDue);
    const fee = await deps.db.transaction(async (tx) => {
      const [f] = await tx
        .insert(schoolFees)
        .values({
          schoolId,
          title: input.title,
          amountCents: input.amountCents,
          currency: input.currency,
          instalments: plan.length,
          firstDue: input.firstDue,
          section: input.section || null,
          createdBy: user.id,
        })
        .returning();
      await tx
        .insert(feeInvoices)
        .values(
          students.flatMap((s) =>
            plan.map((p) => ({ feeId: f!.id, schoolId, studentId: s.id, no: p.no, amountCents: p.amountCents, currency: input.currency, dueDay: p.dueDay })),
          ),
        );
      return f!;
    });
    return c.json({ id: fee.id, invoices: students.length * plan.length }, 201);
  })
  .get('/:id/invoices', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const status = c.req.query('status');
    const rows = await deps.db
      .select()
      .from(feeInvoices)
      .where(and(eq(feeInvoices.schoolId, param(c, 'id')), status ? eq(feeInvoices.status, status as 'pending') : undefined))
      .orderBy(asc(feeInvoices.dueDay), desc(feeInvoices.createdAt))
      .limit(300);
    return c.json({ items: await invoiceDtos(deps, rows) });
  })
  .patch('/:id/invoices/:iid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const { action, reason } = await body(c, invoiceActionSchema);
    const [inv] = await deps.db
      .select()
      .from(feeInvoices)
      .where(and(eq(feeInvoices.id, param(c, 'iid')), eq(feeInvoices.schoolId, param(c, 'id'))));
    if (!inv) throw notFound();
    if (inv.status === 'paid' || inv.status === 'cancelled') throw conflict('invoice_closed');
    const set =
      action === 'paid'
        ? { status: 'paid' as const, paidAt: new Date(), provider: inv.provider ?? 'transfer', method: inv.method ?? 'cash', reason: null }
        : action === 'cancel'
          ? { status: 'cancelled' as const, reason: reason ?? null }
          : { status: 'pending' as const, reason: reason ?? null, receipt: null, reference: null };
    await deps.db.update(feeInvoices).set(set).where(eq(feeInvoices.id, inv.id));
    const [fee] = await deps.db.select({ title: schoolFees.title }).from(schoolFees).where(eq(schoolFees.id, inv.feeId));
    const who = [...new Set([inv.studentId, inv.paidBy].filter((x): x is string => !!x))];
    if (action !== 'cancel')
      await notify(
        deps,
        who.map((userId) => ({
          userId,
          type: action === 'paid' ? 'fee_paid' : 'fee_rejected',
          icon: 'wallet',
          link: '/fees',
          data: { title: fee?.title ?? '', reason: reason ?? '' },
          pref: 'school' as const,
        })),
      );
    return c.json({ ok: true });
  });

/* ───────── Dashboard, news and calendar, timetable, surveys ───────── */

/** A member of the school, or a parent of one of its active students. */
async function memberRole(deps: Deps, schoolId: string, user: AuthUser): Promise<'admin' | 'teacher' | 'student' | 'parent'> {
  try {
    return await requireSchoolRole(deps, schoolId, user, ['admin', 'teacher', 'student', 'parent']);
  } catch (err) {
    const [link] = await deps.db
      .select({ g: guardianLinks.guardianId })
      .from(guardianLinks)
      .innerJoin(
        schoolMembers,
        and(
          eq(schoolMembers.userId, guardianLinks.studentId),
          eq(schoolMembers.schoolId, schoolId),
          eq(schoolMembers.role, 'student'),
          eq(schoolMembers.status, 'active'),
        ),
      )
      .where(eq(guardianLinks.guardianId, user.id))
      .limit(1);
    if (link) return 'parent';
    throw err;
  }
}

const audienceOf = (role: string) =>
  role === 'admin'
    ? ['all', 'students', 'teachers', 'parents']
    : role === 'student'
      ? ['all', 'students']
      : role === 'teacher'
        ? ['all', 'teachers']
        : ['all', 'parents'];

async function schoolAudience(deps: Deps, schoolId: string, audience: string): Promise<string[]> {
  const roles =
    audience === 'all'
      ? ['student', 'teacher', 'parent', 'admin']
      : audience === 'students'
        ? ['student']
        : audience === 'teachers'
          ? ['teacher', 'admin']
          : ['parent'];
  const members = await deps.db
    .select({ id: schoolMembers.userId, role: schoolMembers.role })
    .from(schoolMembers)
    .where(
      and(
        eq(schoolMembers.schoolId, schoolId),
        eq(schoolMembers.status, 'active'),
        inArray(schoolMembers.role, roles as ('admin' | 'teacher' | 'student' | 'parent')[]),
      ),
    );
  const ids = new Set(members.map((m) => m.id));
  if (roles.includes('parent')) {
    const students = await deps.db
      .select({ id: schoolMembers.userId })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, schoolId), eq(schoolMembers.role, 'student'), eq(schoolMembers.status, 'active')));
    const links = students.length
      ? await deps.db
          .select({ g: guardianLinks.guardianId })
          .from(guardianLinks)
          .where(
            inArray(
              guardianLinks.studentId,
              students.map((s) => s.id),
            ),
          )
      : [];
    for (const l of links) ids.add(l.g);
  }
  return [...ids];
}

export const schoolAdminRoutes = new Hono<AppEnv>()
  .get('/:id/dashboard', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    return c.json(await dashboard(deps, param(c, 'id')));
  })
  /* News and calendar */
  .get('/:id/news', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    const role = await memberRole(deps, schoolId, user);
    const today = dayKey(Date.now(), user.timezone);
    const [announcements, events] = await Promise.all([
      deps.db
        .select()
        .from(schoolAnnouncements)
        .where(and(eq(schoolAnnouncements.schoolId, schoolId), inArray(schoolAnnouncements.audience, audienceOf(role))))
        .orderBy(desc(schoolAnnouncements.createdAt))
        .limit(30),
      deps.db
        .select()
        .from(schoolEvents)
        .where(and(eq(schoolEvents.schoolId, schoolId), gte(schoolEvents.day, addDays(today, -30))))
        .orderBy(asc(schoolEvents.day))
        .limit(100),
    ]);
    const mine = await deps.db
      .select({ id: courseMembers.courseId })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .where(and(eq(courseMembers.userId, user.id), eq(courses.schoolId, schoolId)));
    const due = mine.length
      ? await deps.db
          .select({ title: assignments.title, dueAt: assignments.dueAt, courseId: assignments.courseId })
          .from(assignments)
          .where(
            and(
              inArray(
                assignments.courseId,
                mine.map((m) => m.id),
              ),
              eq(assignments.state, 'published'),
              gte(assignments.dueAt, new Date(Date.now() - 86_400_000)),
              lt(assignments.dueAt, new Date(Date.now() + 60 * 86_400_000)),
            ),
          )
          .orderBy(asc(assignments.dueAt))
          .limit(60)
      : [];
    const dto: SchoolNewsDto = {
      announcements: announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, createdAt: a.createdAt.getTime() })),
      events: events.map((e) => ({ id: e.id, title: e.title, day: e.day, endDay: e.endDay, kind: e.kind })),
      agenda: due.map((d) => ({ kind: 'assignment' as const, title: d.title, day: dayKey(d.dueAt!, user.timezone), courseId: d.courseId })),
    };
    return c.json(dto);
  })
  .post('/:id/announcements', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-news', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    await requireSchoolRole(deps, schoolId, user, ['admin']);
    const input = await body(c, announcementInputSchema);
    const [a] = await deps.db
      .insert(schoolAnnouncements)
      .values({ schoolId, title: input.title, body: input.body, audience: input.audience, createdBy: user.id })
      .returning();
    const [school] = await deps.db.select({ name: schools.name }).from(schools).where(eq(schools.id, schoolId));
    const people = (await schoolAudience(deps, schoolId, input.audience)).filter((id) => id !== user.id);
    await notify(
      deps,
      people.map((userId) => ({
        userId,
        actorId: user.id,
        type: 'school_news',
        icon: 'megaphone',
        link: `/schools/${schoolId}?tab=news`,
        data: { school: school?.name ?? '', title: input.title },
        pref: 'school' as const,
      })),
    );
    let phones = 0;
    if (input.whatsapp && (input.audience === 'all' || input.audience === 'parents')) {
      const parents = await schoolAudience(deps, schoolId, 'parents');
      const link = `${deps.env.APP_URL.replace(/\/$/, '')}/schools/${schoolId}?tab=news`;
      for (const p of parents)
        if (
          await messagePerson(deps, p, { kind: 'alert', key: 'school_news', vars: { school: school?.name ?? '', title: input.title, link } }).catch(() => false)
        )
          phones += 1;
    }
    return c.json({ id: a!.id, notified: people.length, phones }, 201);
  })
  .delete('/:id/announcements/:aid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    await deps.db.delete(schoolAnnouncements).where(and(eq(schoolAnnouncements.id, param(c, 'aid')), eq(schoolAnnouncements.schoolId, param(c, 'id'))));
    return c.json({ ok: true });
  })
  .post('/:id/events', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const input = await body(c, schoolEventInputSchema);
    if (input.endDay && input.endDay < input.day) throw badRequest('end_before_start');
    const [e] = await deps.db
      .insert(schoolEvents)
      .values({ schoolId: param(c, 'id'), title: input.title, day: input.day, endDay: input.endDay ?? null, kind: input.kind, createdBy: user.id })
      .returning({ id: schoolEvents.id });
    return c.json({ id: e!.id }, 201);
  })
  .delete('/:id/events/:eid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    await deps.db.delete(schoolEvents).where(and(eq(schoolEvents.id, param(c, 'eid')), eq(schoolEvents.schoolId, param(c, 'id'))));
    return c.json({ ok: true });
  })
  /* Timetable */
  .get('/:id/timetable', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await memberRole(deps, param(c, 'id'), user);
    const rows = await deps.db
      .select({ e: timetableEntries, c: courses, teacherName: users.displayName })
      .from(timetableEntries)
      .innerJoin(courses, eq(courses.id, timetableEntries.courseId))
      .innerJoin(users, eq(users.id, courses.ownerId))
      .where(and(eq(courses.schoolId, param(c, 'id')), eq(courses.archived, false)))
      .orderBy(asc(timetableEntries.day), asc(timetableEntries.start));
    const items: SchoolSlotDto[] = rows.map((r) => ({
      id: r.e.id,
      courseId: r.c.id,
      courseTitle: r.c.title,
      subject: r.c.subject ?? r.c.title,
      section: r.c.schoolSection,
      teacher: { id: r.c.ownerId, displayName: r.teacherName },
      room: r.e.room,
      day: r.e.day,
      start: r.e.start,
      end: r.e.end,
    }));
    const dto: SchoolTimetableDto = {
      items,
      conflicts: timetableConflicts(
        items.map((i) => ({
          id: i.id,
          courseId: i.courseId,
          section: i.section,
          teacherId: i.teacher.id,
          room: i.room,
          day: i.day,
          start: i.start,
          end: i.end,
        })),
      ),
      sections: [...new Set(items.map((i) => i.section).filter((s): s is string => !!s))].sort(),
    };
    return c.json(dto);
  })
  .post('/:id/timetable', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const input = await body(c, slotInputSchema);
    const [course] = await deps.db
      .select()
      .from(courses)
      .where(and(eq(courses.id, input.courseId), eq(courses.schoolId, param(c, 'id'))));
    if (!course) throw notFound('course_not_found');
    const [row] = await deps.db
      .insert(timetableEntries)
      .values({ userId: course.ownerId, courseId: course.id, day: input.day, start: input.start, end: input.end, title: course.title, room: input.room })
      .returning({ id: timetableEntries.id });
    return c.json({ id: row!.id }, 201);
  })
  .delete('/:id/timetable/:eid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const [e] = await deps.db
      .select({ id: timetableEntries.id })
      .from(timetableEntries)
      .innerJoin(courses, eq(courses.id, timetableEntries.courseId))
      .where(and(eq(timetableEntries.id, param(c, 'eid')), eq(courses.schoolId, param(c, 'id'))));
    if (!e) throw notFound();
    await deps.db.delete(timetableEntries).where(eq(timetableEntries.id, e.id));
    return c.json({ ok: true });
  })
  /** Gives a class to another teacher of the school; the previous teacher stays as an assistant. */
  .put('/:id/classes/:courseId/teacher', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    await requireSchoolRole(deps, schoolId, user, ['admin']);
    const { teacherId } = await body(c, classTeacherSchema);
    const [course] = await deps.db
      .select()
      .from(courses)
      .where(and(eq(courses.id, param(c, 'courseId')), eq(courses.schoolId, schoolId)));
    if (!course) throw notFound('course_not_found');
    const m = await membership(deps, schoolId, teacherId);
    if (!m || m.status !== 'active' || m.role !== 'teacher') throw badRequest('not_a_school_teacher');
    await deps.db.transaction(async (tx) => {
      await tx.update(courses).set({ ownerId: teacherId }).where(eq(courses.id, course.id));
      await tx
        .insert(courseMembers)
        .values({ courseId: course.id, userId: teacherId, role: 'teacher' })
        .onConflictDoUpdate({ target: [courseMembers.courseId, courseMembers.userId], set: { role: 'teacher' } });
      if (course.ownerId !== teacherId)
        await tx
          .update(courseMembers)
          .set({ role: 'assistant' })
          .where(and(eq(courseMembers.courseId, course.id), eq(courseMembers.userId, course.ownerId)));
      // The timetable of this class now belongs to the new teacher.
      await tx.update(timetableEntries).set({ userId: teacherId }).where(eq(timetableEntries.courseId, course.id));
    });
    await notify(deps, {
      userId: teacherId,
      actorId: user.id,
      type: 'class_assigned',
      icon: 'school',
      link: `/school/${course.id}`,
      data: { course: course.title },
      pref: 'school',
    });
    return c.json({ ok: true });
  })
  /* Surveys */
  .get('/:id/surveys', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    const role = await memberRole(deps, schoolId, user);
    const rows = await deps.db
      .select()
      .from(schoolSurveys)
      .where(and(eq(schoolSurveys.schoolId, schoolId), inArray(schoolSurveys.audience, audienceOf(role))))
      .orderBy(desc(schoolSurveys.createdAt))
      .limit(50);
    const counts = rows.length
      ? await deps.db
          .select({ surveyId: surveyResponses.surveyId, n: sql<number>`count(*)::int` })
          .from(surveyResponses)
          .where(
            inArray(
              surveyResponses.surveyId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(surveyResponses.surveyId)
      : [];
    const mine = rows.length
      ? await deps.db
          .select({ surveyId: surveyResponses.surveyId })
          .from(surveyResponses)
          .where(
            and(
              inArray(
                surveyResponses.surveyId,
                rows.map((r) => r.id),
              ),
              inArray(
                surveyResponses.respondentKey,
                rows.map((r) => respondentKey(deps, r.id, user.id)),
              ),
            ),
          )
      : [];
    const answered = new Set(mine.map((m) => m.surveyId));
    const n = new Map(counts.map((x) => [x.surveyId, x.n]));
    const items: SurveyDto[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      audience: r.audience,
      questions: r.questions,
      closed: !!r.closedAt,
      answered: answered.has(r.id),
      responses: role === 'admin' ? (n.get(r.id) ?? 0) : null,
      createdAt: r.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  .post('/:id/surveys', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-survey', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    await requireSchoolRole(deps, schoolId, user, ['admin']);
    const input = await body(c, surveyInputSchema);
    const questions = input.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text, kind: q.kind }));
    const [s] = await deps.db
      .insert(schoolSurveys)
      .values({ schoolId, title: input.title, audience: input.audience, questions, createdBy: user.id })
      .returning({ id: schoolSurveys.id });
    const [school] = await deps.db.select({ name: schools.name }).from(schools).where(eq(schools.id, schoolId));
    const people = (await schoolAudience(deps, schoolId, input.audience)).filter((id) => id !== user.id);
    await notify(
      deps,
      people.map((userId) => ({
        userId,
        actorId: user.id,
        type: 'survey_new',
        icon: 'clipboard-list',
        link: `/schools/${schoolId}?tab=surveys`,
        data: { school: school?.name ?? '', title: input.title },
        pref: 'school' as const,
      })),
    );
    return c.json({ id: s!.id }, 201);
  })
  .post('/:id/surveys/:sid/answer', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const schoolId = param(c, 'id');
    const role = await memberRole(deps, schoolId, user);
    const { answers } = await body(c, surveyAnswerSchema);
    const [s] = await deps.db
      .select()
      .from(schoolSurveys)
      .where(and(eq(schoolSurveys.id, param(c, 'sid')), eq(schoolSurveys.schoolId, schoolId)));
    if (!s || !audienceOf(role).includes(s.audience)) throw notFound();
    if (s.closedAt) throw conflict('survey_closed');
    const clean: Record<string, string | number> = {};
    for (const q of s.questions) {
      const v = answers[q.id];
      if (q.kind === 'rating' && typeof v === 'number') clean[q.id] = v;
      if (q.kind === 'text' && typeof v === 'string' && v.trim()) clean[q.id] = v.trim();
    }
    if (!Object.keys(clean).length) throw badRequest('empty_answers');
    const inserted = await deps.db
      .insert(surveyResponses)
      .values({ surveyId: s.id, respondentKey: respondentKey(deps, s.id, user.id), answers: clean })
      .onConflictDoNothing()
      .returning({ id: surveyResponses.id });
    if (!inserted.length) throw conflict('already_answered');
    return c.json({ ok: true }, 201);
  })
  .get('/:id/surveys/:sid/results', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const [s] = await deps.db
      .select()
      .from(schoolSurveys)
      .where(and(eq(schoolSurveys.id, param(c, 'sid')), eq(schoolSurveys.schoolId, param(c, 'id'))));
    if (!s) throw notFound();
    const rows = await deps.db.select({ answers: surveyResponses.answers }).from(surveyResponses).where(eq(surveyResponses.surveyId, s.id));
    return c.json({
      title: s.title,
      ...summarizeSurvey(
        s.questions,
        rows.map((r) => r.answers),
      ),
    });
  })
  .post('/:id/surveys/:sid/close', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    await deps.db
      .update(schoolSurveys)
      .set({ closedAt: new Date() })
      .where(and(eq(schoolSurveys.id, param(c, 'sid')), eq(schoolSurveys.schoolId, param(c, 'id')), isNull(schoolSurveys.closedAt)));
    return c.json({ ok: true });
  });

/** A one-way key per person and survey: it stops double answers without ever storing who answered. */
function respondentKey(deps: Deps, surveyId: string, userId: string) {
  return createHmac('sha256', deps.env.JWT_SECRET).update(`survey:${surveyId}:${userId}`).digest('hex');
}
