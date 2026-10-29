import { dayKey, toCsv } from '@qubedu/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseMembers,
  courses,
  feeInvoices,
  schoolAnnouncements,
  schoolEvents,
  schoolFees,
  schoolMembers,
  schoolSurveys,
  schoolTemplates,
  schools,
  submissions,
  surveyResponses,
  users,
} from '../db/schema';
import type { AppEnv } from '../lib/context';
import { audit } from '../lib/audit';
import { param, requireUser } from '../lib/http';
import { makeZip } from '../lib/zip';
import { checkRate } from '../middleware';
import { requireSchoolRole } from './schools';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');
const csv = (rows: unknown[][]) => `\uFEFF${toCsv(rows)}\r\n`;

/** One click: everything a school keeps in Qubedu, as a ZIP of spreadsheets (and a note on what each file holds). */
export const schoolExportRoutes = new Hono<AppEnv>().get('/:id/export', async (c) => {
  const user = requireUser(c);
  await checkRate(c, { bucket: 'school-export', limit: 6, windowSec: 3600, by: 'user' });
  const deps = c.get('deps');
  const id = param(c, 'id');
  await requireSchoolRole(deps, id, user, ['admin']);
  const [school] = await deps.db.select().from(schools).where(eq(schools.id, id));
  const db = deps.db;

  const members = await db
    .select({ m: schoolMembers, name: users.displayName, email: users.email, grade: users.gradeLevel })
    .from(schoolMembers)
    .innerJoin(users, eq(users.id, schoolMembers.userId))
    .where(eq(schoolMembers.schoolId, id))
    .orderBy(asc(schoolMembers.role), asc(users.displayName));
  const classes = await db
    .select({ c: courses, teacher: users.displayName })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(eq(courses.schoolId, id))
    .orderBy(asc(courses.schoolSection), asc(courses.title));
  const classIds = classes.map((x) => x.c.id);
  const byClass = new Map(classes.map((x) => [x.c.id, x.c.title]));
  const enrolled = classIds.length
    ? await db
        .select({ courseId: courseMembers.courseId, name: users.displayName, role: courseMembers.role })
        .from(courseMembers)
        .innerJoin(users, eq(users.id, courseMembers.userId))
        .where(inArray(courseMembers.courseId, classIds))
    : [];
  const grades = classIds.length
    ? await db
        .select({
          courseId: assignments.courseId,
          title: assignments.title,
          points: assignments.points,
          student: users.displayName,
          grade: submissions.grade,
          status: submissions.status,
        })
        .from(submissions)
        .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
        .innerJoin(users, eq(users.id, submissions.studentId))
        .where(inArray(assignments.courseId, classIds))
    : [];
  const attendance = classIds.length
    ? await db
        .select({ courseId: attendanceSessions.courseId, day: attendanceSessions.day, student: users.displayName, status: attendanceRecords.status })
        .from(attendanceRecords)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
        .innerJoin(users, eq(users.id, attendanceRecords.studentId))
        .where(inArray(attendanceSessions.courseId, classIds))
        .orderBy(asc(attendanceSessions.day))
    : [];
  const invoices = await db
    .select({ i: feeInvoices, fee: schoolFees.title, student: users.displayName })
    .from(feeInvoices)
    .innerJoin(schoolFees, eq(schoolFees.id, feeInvoices.feeId))
    .innerJoin(users, eq(users.id, feeInvoices.studentId))
    .where(eq(feeInvoices.schoolId, id))
    .orderBy(asc(feeInvoices.dueDay));
  const news = await db.select().from(schoolAnnouncements).where(eq(schoolAnnouncements.schoolId, id)).orderBy(asc(schoolAnnouncements.createdAt));
  const events = await db.select().from(schoolEvents).where(eq(schoolEvents.schoolId, id)).orderBy(asc(schoolEvents.day));
  const surveys = await db.select().from(schoolSurveys).where(eq(schoolSurveys.schoolId, id)).orderBy(asc(schoolSurveys.createdAt));
  const surveyIds = surveys.map((s) => s.id);
  const answers = surveyIds.length ? await db.select().from(surveyResponses).where(inArray(surveyResponses.surveyId, surveyIds)) : [];
  const templates = await db.select().from(schoolTemplates).where(eq(schoolTemplates.schoolId, id));

  const today = dayKey(Date.now());
  const files = [
    {
      name: 'README.txt',
      data: `Qubedu school export\r\nSchool: ${school!.name}\r\nExported: ${new Date().toISOString()}\r\n\r\nmembers.csv - people and their roles\r\nclasses.csv - classes and teachers\r\nenrollment.csv - who is in which class\r\ngrades.csv - assignment marks\r\nattendance.csv - attendance registers\r\nfees.csv - fee instalments and payment status\r\nannouncements.csv, events.csv - the school news and calendar\r\nsurvey-responses.csv - anonymous survey answers (no names)\r\ntemplates.json - shared quiz and assignment templates\r\nschool.json - the school profile\r\n`,
    },
    {
      name: 'school.json',
      data: JSON.stringify(
        {
          id: school!.id,
          name: school!.name,
          code: school!.code,
          system: school!.system,
          address: school!.address,
          phone: school!.phone,
          principal: school!.principal,
        },
        null,
        2,
      ),
    },
    {
      name: 'members.csv',
      data: csv([
        ['name', 'email_or_login', 'role', 'status', 'class', 'student_number', 'grade_level'],
        ...members.map((r) => [r.name, r.email, r.m.role, r.m.status, r.m.section, r.m.studentNumber, r.grade]),
      ]),
    },
    {
      name: 'classes.csv',
      data: csv([['class', 'section', 'teacher', 'students'], ...classes.map((x) => [x.c.title, x.c.schoolSection, x.teacher, x.c.memberCount])]),
    },
    { name: 'enrollment.csv', data: csv([['class', 'person', 'role'], ...enrolled.map((r) => [byClass.get(r.courseId), r.name, r.role])]) },
    {
      name: 'grades.csv',
      data: csv([
        ['class', 'assignment', 'student', 'grade', 'out_of', 'status'],
        ...grades.map((r) => [byClass.get(r.courseId), r.title, r.student, r.grade, r.points, r.status]),
      ]),
    },
    {
      name: 'attendance.csv',
      data: csv([['class', 'day', 'student', 'status'], ...attendance.map((r) => [byClass.get(r.courseId), r.day, r.student, r.status])]),
    },
    {
      name: 'fees.csv',
      data: csv([
        ['fee', 'student', 'instalment', 'amount', 'currency', 'due', 'status', 'method', 'reference', 'paid_at'],
        ...invoices.map((r) => [
          r.fee,
          r.student,
          r.i.no,
          (r.i.amountCents / 100).toFixed(2),
          r.i.currency,
          r.i.dueDay,
          r.i.status,
          r.i.method,
          r.i.reference,
          iso(r.i.paidAt),
        ]),
      ]),
    },
    { name: 'announcements.csv', data: csv([['date', 'title', 'audience', 'text'], ...news.map((r) => [iso(r.createdAt), r.title, r.audience, r.body])]) },
    { name: 'events.csv', data: csv([['day', 'end_day', 'kind', 'title'], ...events.map((r) => [r.day, r.endDay, r.kind, r.title])]) },
    {
      name: 'survey-responses.csv',
      data: csv([['survey', 'answers'], ...answers.map((r) => [surveys.find((s) => s.id === r.surveyId)?.title, JSON.stringify(r.answers)])]),
    },
    {
      name: 'templates.json',
      data: JSON.stringify(
        templates.map((t) => ({ kind: t.kind, title: t.title, data: t.payload })),
        null,
        2,
      ),
    },
  ];
  await audit(deps.db, user.id, 'school.export', 'school', id, { files: files.length });
  const zip = makeZip(files);
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="qubedu-${school!.code}-${today}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});
