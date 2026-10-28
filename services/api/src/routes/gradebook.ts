import { componentMarksSchema, gradeComponentsSchema, overallResult, round1, type CourseGradebookDto, type ReportCardDto } from '@qubedu/shared';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { componentMarks, courseMembers, courses, gradeComponents, guardianLinks, users } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { componentsOf, computeGradebook, gradingOf } from '../lib/gradebook';
import { body, param, requireUser } from '../lib/http';
import { summaryColumns, toSummary } from '../lib/mappers';
import { requireRole, STAFF } from './school';

async function loadCourse(deps: Deps, id: string) {
  const [course] = await deps.db.select().from(courses).where(eq(courses.id, id));
  if (!course) throw notFound('course_not_found');
  return course;
}

/** A student's own report card, or their linked parent's view of it. */
async function canSeeReport(deps: Deps, viewerId: string, studentId: string) {
  if (viewerId === studentId) return true;
  const [link] = await deps.db
    .select({ x: guardianLinks.studentId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, viewerId), eq(guardianLinks.studentId, studentId)));
  return !!link;
}

export async function reportCard(deps: Deps, studentId: string, term?: string | null, schoolId?: string): Promise<ReportCardDto> {
  const [student] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, studentId));
  if (!student) throw notFound('user_not_found');
  const mine = await deps.db
    .select({ c: courses, teacher: users.displayName })
    .from(courseMembers)
    .innerJoin(courses, eq(courses.id, courseMembers.courseId))
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(
      and(
        eq(courseMembers.userId, studentId),
        eq(courseMembers.role, 'student'),
        eq(courses.archived, false),
        schoolId ? eq(courses.schoolId, schoolId) : undefined,
      ),
    )
    .orderBy(asc(courses.subjectCode), asc(courses.title));
  const terms = [...new Set(mine.map((m) => m.c.term).filter((t): t is string => !!t))];
  const picked = term ? mine.filter((m) => m.c.term === term) : mine;
  const subjects = [];
  for (const m of picked) {
    const g = await computeGradebook(deps, m.c, [studentId], true);
    const row = g.rows.get(studentId)!;
    subjects.push({
      courseId: m.c.id,
      title: m.c.title,
      teacher: m.teacher,
      grading: gradingOf(m.c),
      components: g.components.map((c) => ({ id: c.id, name: c.name, maxMarks: c.maxMarks, earned: row.marks[c.id] ?? null })),
      result: row.result,
    });
  }
  return {
    student: toSummary(student),
    term: term ?? null,
    terms,
    subjects,
    overall: overallResult(subjects.map((s) => ({ result: s.result, countsInTotal: s.grading.countsInTotal }))),
  };
}

export const gradebookRoutes = new Hono<AppEnv>()
  .get('/courses/:id/components', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const course = await loadCourse(deps, param(c, 'id'));
    await requireRole(deps, course.id, user, ['teacher', 'assistant', 'student']);
    return c.json({ grading: gradingOf(course), items: await componentsOf(deps, course) });
  })
  /** Replaces the class's components (the teacher edits them as one list). Marks of kept components stay. */
  .put('/courses/:id/components', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const course = await loadCourse(deps, param(c, 'id'));
    await requireRole(deps, course.id, user, ['teacher']);
    const { components } = await body(c, gradeComponentsSchema);
    const total = round1(components.reduce((n, x) => n + x.maxMarks, 0));
    if (components.length && total > course.maxMarks) throw badRequest('components_over_total');
    await deps.db.transaction(async (tx) => {
      const existing = await tx.select({ id: gradeComponents.id }).from(gradeComponents).where(eq(gradeComponents.courseId, course.id));
      const keep = components.map((x) => x.id).filter((x): x is string => !!x && existing.some((e) => e.id === x));
      await tx.delete(gradeComponents).where(and(eq(gradeComponents.courseId, course.id), keep.length ? notInArray(gradeComponents.id, keep) : undefined));
      for (const [position, x] of components.entries()) {
        if (x.id && keep.includes(x.id))
          await tx.update(gradeComponents).set({ name: x.name, maxMarks: x.maxMarks, source: x.source, position }).where(eq(gradeComponents.id, x.id));
        else await tx.insert(gradeComponents).values({ courseId: course.id, name: x.name, maxMarks: x.maxMarks, source: x.source, position });
      }
    });
    return c.json({ grading: gradingOf(course), items: await componentsOf(deps, course) });
  })
  /** Teacher and assistants enter marks for manual components (a paper test, an oral exam…). */
  .put('/courses/:id/marks', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const course = await loadCourse(deps, param(c, 'id'));
    await requireRole(deps, course.id, user, STAFF);
    const { marks } = await body(c, componentMarksSchema);
    const comps = await deps.db.select().from(gradeComponents).where(eq(gradeComponents.courseId, course.id));
    const students = new Set(
      (
        await deps.db
          .select({ id: courseMembers.userId })
          .from(courseMembers)
          .where(and(eq(courseMembers.courseId, course.id), eq(courseMembers.role, 'student')))
      ).map((s) => s.id),
    );
    for (const m of marks) {
      const comp = comps.find((x) => x.id === m.componentId);
      if (!comp || comp.source !== 'manual') throw badRequest('invalid_component');
      if (!students.has(m.studentId)) throw badRequest('not_a_student');
      if (m.marks !== null && m.marks > comp.maxMarks) throw badRequest('marks_over_max');
    }
    await deps.db.transaction(async (tx) => {
      for (const m of marks) {
        if (m.marks === null)
          await tx.delete(componentMarks).where(and(eq(componentMarks.componentId, m.componentId), eq(componentMarks.studentId, m.studentId)));
        else
          await tx
            .insert(componentMarks)
            .values({ componentId: m.componentId, studentId: m.studentId, marks: m.marks, updatedBy: user.id })
            .onConflictDoUpdate({
              target: [componentMarks.componentId, componentMarks.studentId],
              set: { marks: m.marks, updatedBy: user.id, updatedAt: new Date() },
            });
      }
    });
    return c.json({ ok: true, saved: marks.length });
  })
  /** The full class gradebook (staff). */
  .get('/courses/:id/gradebook', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const course = await loadCourse(deps, param(c, 'id'));
    await requireRole(deps, course.id, user, STAFF);
    const students = await deps.db
      .select(summaryColumns)
      .from(courseMembers)
      .innerJoin(users, eq(users.id, courseMembers.userId))
      .where(and(eq(courseMembers.courseId, course.id), eq(courseMembers.role, 'student')))
      .orderBy(asc(users.displayName));
    const g = await computeGradebook(
      deps,
      course,
      students.map((s) => s.id),
      false,
    );
    return c.json({
      grading: gradingOf(course),
      components: g.components,
      componentsTotal: round1(g.components.reduce((n, x) => n + x.maxMarks, 0)),
      rows: students.map((s) => ({ student: toSummary(s), ...g.rows.get(s.id)! })),
    } satisfies CourseGradebookDto);
  })
  /** Report card: every subject the student is in, totals across subjects that count. `?studentId=` for parents. */
  .get('/report-card', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const studentId = c.req.query('studentId') || user.id;
    if (!(await canSeeReport(deps, user.id, studentId))) throw forbidden();
    return c.json(await reportCard(deps, studentId, c.req.query('term') || null));
  });
