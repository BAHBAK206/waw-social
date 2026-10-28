import { scaleTo, subjectResult, type CourseGradingDto, type GradeComponentDto, type SubjectResult } from '@qubedu/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { assignments, attendanceRecords, attendanceSessions, componentMarks, type courses, gradeComponents, submissions } from '../db/schema';
import type { Deps } from './context';

type CourseRow = typeof courses.$inferSelect;

export const gradingOf = (c: CourseRow): CourseGradingDto => ({
  subjectCode: c.subjectCode,
  maxMarks: c.maxMarks,
  passMarks: c.passMarks,
  countsInTotal: c.countsInTotal,
  term: c.term,
});

/** The class's components, or one "Coursework" component made from all assignments when none are set up yet. */
export async function componentsOf(deps: Deps, course: CourseRow): Promise<GradeComponentDto[]> {
  const rows = await deps.db.select().from(gradeComponents).where(eq(gradeComponents.courseId, course.id)).orderBy(asc(gradeComponents.position));
  if (rows.length) return rows.map((r) => ({ id: r.id, name: r.name, maxMarks: r.maxMarks, source: r.source, position: r.position }));
  return [{ id: 'coursework', name: '', maxMarks: course.maxMarks, source: 'assignments', position: 0 }];
}

/**
 * Marks per student and component, and the subject result.
 * `studentView`: only work the teacher has returned counts (what students and parents see).
 */
export async function computeGradebook(
  deps: Deps,
  course: CourseRow,
  studentIds: string[],
  studentView: boolean,
): Promise<{ components: GradeComponentDto[]; rows: Map<string, { marks: Record<string, number | null>; result: SubjectResult }> }> {
  const components = await componentsOf(deps, course);
  const out = new Map<string, { marks: Record<string, number | null>; result: SubjectResult }>();
  if (!studentIds.length) return { components, rows: out };

  const work = await deps.db
    .select({ id: assignments.id, points: assignments.points, componentId: assignments.componentId, dueAt: assignments.dueAt })
    .from(assignments)
    .where(and(eq(assignments.courseId, course.id), sql`${assignments.state} <> 'draft'`));
  const subs = work.length
    ? await deps.db
        .select({ a: submissions.assignmentId, s: submissions.studentId, grade: submissions.grade, status: submissions.status })
        .from(submissions)
        .where(
          and(
            inArray(
              submissions.assignmentId,
              work.map((w) => w.id),
            ),
            inArray(submissions.studentId, studentIds),
          ),
        )
    : [];
  const manual = components.some((c) => c.source === 'manual')
    ? await deps.db
        .select()
        .from(componentMarks)
        .where(
          and(
            inArray(
              componentMarks.componentId,
              components.map((c) => c.id),
            ),
            inArray(componentMarks.studentId, studentIds),
          ),
        )
    : [];
  const attendance = components.some((c) => c.source === 'attendance')
    ? await deps.db
        .select({ s: attendanceRecords.studentId, status: attendanceRecords.status })
        .from(attendanceRecords)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
        .where(and(eq(attendanceSessions.courseId, course.id), inArray(attendanceRecords.studentId, studentIds)))
    : [];

  // Assignments without a component count toward the first assignments component.
  const firstWork = components.find((c) => c.source === 'assignments')?.id;
  const workOf = (componentId: string) =>
    work.filter((w) => (w.componentId && components.some((c) => c.id === w.componentId) ? w.componentId : firstWork) === componentId);
  const now = Date.now();

  for (const sid of studentIds) {
    const marks: Record<string, number | null> = {};
    for (const comp of components) {
      if (comp.source === 'manual') {
        const m = manual.find((x) => x.componentId === comp.id && x.studentId === sid);
        marks[comp.id] = m ? Math.min(comp.maxMarks, m.marks) : null;
      } else if (comp.source === 'attendance') {
        const mine = attendance.filter((a) => a.s === sid && a.status !== 'excused');
        const attended = mine.filter((a) => a.status === 'present' || a.status === 'late').length;
        marks[comp.id] = mine.length ? scaleTo(comp.maxMarks, attended, mine.length) : null;
      } else {
        // Graded work counts; work past its due date with nothing handed in counts as zero.
        let earned = 0;
        let possible = 0;
        for (const w of workOf(comp.id)) {
          const sub = subs.find((x) => x.a === w.id && x.s === sid);
          const counted = sub && sub.grade !== null && (!studentView || sub.status === 'returned');
          if (counted) {
            earned += sub.grade!;
            possible += w.points;
          } else if (!sub && w.dueAt && w.dueAt.getTime() < now) possible += w.points;
        }
        marks[comp.id] = scaleTo(comp.maxMarks, earned, possible);
      }
    }
    out.set(sid, {
      marks,
      result: subjectResult({
        maxMarks: course.maxMarks,
        passMarks: course.passMarks,
        components: components.map((c) => ({ max: c.maxMarks, earned: marks[c.id] ?? null })),
      }),
    });
  }
  return { components, rows: out };
}
