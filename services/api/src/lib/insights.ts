import { riskOf, type StudentSignals } from '@qubedu/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Courses where this person is a student (all of them, or only those listed). */
function courseScope(studentId: string, courseIds?: string[]) {
  if (!courseIds) return sql`(select course_id from course_members where user_id = ${studentId} and role = 'student')`;
  if (!courseIds.length) return sql`(null::uuid)`;
  return sql`(${sql.join(
    courseIds.map((c) => sql`${c}::uuid`),
    sql`, `,
  )})`;
}

/**
 * Learning signals for one student: activity, study time trend, missing/late work, grades, attendance, quizzes.
 * With `courseIds`, coursework is limited to those courses (a teacher sees only their own classes).
 */
export async function studentSignals(db: Db, studentId: string, courseIds?: string[]): Promise<{ signals: StudentSignals; lastSeenAt: number | null }> {
  const now = Date.now();
  const scope = courseScope(studentId, courseIds);
  const [row] = await db.execute<{
    last_seen: Date | null;
    this_week: number;
    last_week: number;
    missing: number;
    late_recent: number;
    absences: number;
  }>(sql`
    select
      (select last_seen_at from users where id = ${studentId}) as last_seen,
      (select coalesce(sum(minutes), 0)::int from study_log where user_id = ${studentId} and day > ${isoDay(now - 7 * DAY)}) as this_week,
      (select coalesce(sum(minutes), 0)::int from study_log where user_id = ${studentId} and day > ${isoDay(now - 14 * DAY)} and day <= ${isoDay(now - 7 * DAY)}) as last_week,
      (select count(*)::int from assignments a
        where a.course_id in ${scope} and a.state = 'published' and a.due_at < now()
          and (a.release_at is null or a.release_at <= now())
          and not exists (select 1 from submissions s where s.assignment_id = a.id and s.student_id = ${studentId})) as missing,
      (select count(*)::int from submissions s join assignments a on a.id = s.assignment_id
        where s.student_id = ${studentId} and s.late and a.course_id in ${scope} and s.submitted_at > now() - interval '30 days') as late_recent,
      (select count(*)::int from attendance_records r join attendance_sessions x on x.id = r.session_id
        where r.student_id = ${studentId} and r.status = 'absent' and x.course_id in ${scope} and x.day > ${isoDay(now - 30 * DAY)}) as absences`);
  const grades = await db.execute<{ pct: number }>(sql`
    select (s.grade / nullif(a.points, 0) * 100)::float as pct
    from submissions s join assignments a on a.id = s.assignment_id
    where s.student_id = ${studentId} and s.grade is not null and a.course_id in ${scope}
    order by coalesce(s.graded_at, s.submitted_at) desc limit 10`);
  const quizzes = await db.execute<{ pct: number }>(sql`
    select qa.pct from quiz_attempts qa
    ${courseIds ? sql`join quizzes q on q.id = qa.quiz_id and q.course_id in ${scope}` : sql``}
    where qa.user_id = ${studentId} and qa.submitted_at is not null and qa.pct is not null and not qa.review
    order by qa.submitted_at desc limit 10`);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const g = grades.map((r) => Number(r.pct)).filter((x) => Number.isFinite(x));
  const lastSeen = row?.last_seen ? new Date(row.last_seen).getTime() : null;
  const signals: StudentSignals = {
    inactiveDays: lastSeen === null ? null : Math.floor((now - lastSeen) / DAY),
    minutesThisWeek: row?.this_week ?? 0,
    minutesLastWeek: row?.last_week ?? 0,
    missing: row?.missing ?? 0,
    lateRecent: row?.late_recent ?? 0,
    gradeAvg: avg(g.slice(0, 5)),
    gradePrevAvg: g.length >= 6 ? avg(g.slice(5, 10)) : null,
    absences30: row?.absences ?? 0,
    quizAvg: avg(quizzes.map((r) => Number(r.pct))),
  };
  return { signals, lastSeenAt: lastSeen };
}

export async function studentRisk(db: Db, studentId: string, courseIds?: string[]) {
  const { signals, lastSeenAt } = await studentSignals(db, studentId, courseIds);
  return { signals, lastSeenAt, risk: riskOf(signals) };
}
