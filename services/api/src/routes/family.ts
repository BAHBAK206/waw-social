import { randomInt } from 'node:crypto';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { levelFromXp, type ChildReportDto, type FamilyDto } from '@qubedu/shared';
import { guardianLinks, users } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { studentRisk } from '../lib/insights';
import { summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL = 24 * 3600;
const MAX_CHILDREN = 10;
const DAY = 86_400_000;

async function isGuardianOf(deps: Deps, guardianId: string, studentId: string) {
  const [l] = await deps.db
    .select({ s: guardianLinks.studentId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, guardianId), eq(guardianLinks.studentId, studentId)));
  return !!l;
}

/** Everything a parent sees about one child: study time, quizzes, coursework, attendance and "needs help" signals. */
export async function childReport(deps: Deps, studentId: string): Promise<ChildReportDto> {
  const [u] = await deps.db
    .select({ ...summaryColumns, streak: users.streak })
    .from(users)
    .where(and(eq(users.id, studentId), isNull(users.deletedAt)));
  if (!u) throw notFound('user_not_found');
  const since = new Date(Date.now() - 13 * DAY).toISOString().slice(0, 10);
  const [days, quizzes, courses, risk] = await Promise.all([
    deps.db.execute<{ day: string; minutes: number }>(sql`select day::text as day, minutes from study_log where user_id = ${studentId} and day >= ${since}`),
    deps.db.execute<{ title: string; pct: number; at: Date }>(sql`
      select coalesce(q.title, 'Practice') as title, qa.pct, qa.submitted_at as at
      from quiz_attempts qa left join quizzes q on q.id = qa.quiz_id
      where qa.user_id = ${studentId} and qa.submitted_at is not null and qa.pct is not null and not qa.review
      order by qa.submitted_at desc limit 10`),
    deps.db.execute<{ id: string; title: string; teacher: string }>(sql`
      select c.id, c.title, coalesce((select u.display_name from course_members m join users u on u.id = m.user_id
        where m.course_id = c.id and m.role = 'teacher' order by m.joined_at limit 1), '') as teacher
      from course_members cm join courses c on c.id = cm.course_id
      where cm.user_id = ${studentId} and cm.role = 'student' and not c.archived
      order by c.title`),
    studentRisk(deps.db, studentId),
  ]);
  const byDay = new Map(days.map((d) => [d.day, Number(d.minutes)]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * DAY).toISOString().slice(0, 10);
    return { day, minutes: byDay.get(day) ?? 0 };
  });
  const courseList: ChildReportDto['courses'] = [];
  for (const c of courses) {
    const work = await deps.db.execute<{
      id: string;
      title: string;
      due_at: Date | null;
      points: number;
      status: string | null;
      late: boolean | null;
      grade: number | null;
    }>(sql`
      select a.id, a.title, a.due_at, a.points, s.status, s.late, s.grade
      from assignments a left join submissions s on s.assignment_id = a.id and s.student_id = ${studentId}
      where a.course_id = ${c.id} and a.state <> 'draft' and (a.release_at is null or a.release_at <= now())
      order by coalesce(a.due_at, a.created_at) desc limit 12`);
    const [att] = await deps.db.execute<{ present: number; absent: number; late: number; excused: number }>(sql`
      select count(*) filter (where r.status = 'present')::int as present, count(*) filter (where r.status = 'absent')::int as absent,
             count(*) filter (where r.status = 'late')::int as late, count(*) filter (where r.status = 'excused')::int as excused
      from attendance_records r join attendance_sessions x on x.id = r.session_id
      where r.student_id = ${studentId} and x.course_id = ${c.id}`);
    courseList.push({
      id: c.id,
      title: c.title,
      teacher: c.teacher,
      assignments: work.map((w) => {
        const due = w.due_at ? new Date(w.due_at).getTime() : null;
        const status: ChildReportDto['courses'][number]['assignments'][number]['status'] =
          w.grade !== null ? 'graded' : w.status ? 'submitted' : due !== null && due < Date.now() ? 'missing' : 'upcoming';
        return { id: w.id, title: w.title, dueAt: due, status, late: !!w.late, grade: w.grade === null ? null : Number(w.grade), points: w.points };
      }),
      attendance: att ?? { present: 0, absent: 0, late: 0, excused: 0 },
    });
  }
  return {
    child: toSummary(u),
    streak: u.streak,
    xp: u.xp,
    level: levelFromXp(u.xp),
    days: series,
    quizzes: quizzes.map((q) => ({ title: q.title, pct: Number(q.pct), at: new Date(q.at).getTime() })),
    courses: courseList,
    signals: risk.signals,
    risk: risk.risk,
  };
}

export const familyRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const kids = await deps.db
      .select(summaryColumns)
      .from(guardianLinks)
      .innerJoin(users, eq(users.id, guardianLinks.studentId))
      .where(and(eq(guardianLinks.guardianId, viewer.id), isNull(users.deletedAt)))
      .orderBy(users.displayName);
    const guardians = await deps.db
      .select(summaryColumns)
      .from(guardianLinks)
      .innerJoin(users, eq(users.id, guardianLinks.guardianId))
      .where(and(eq(guardianLinks.studentId, viewer.id), isNull(users.deletedAt)))
      .orderBy(users.displayName);
    const children: FamilyDto['children'] = [];
    for (const k of kids) {
      const r = await studentRisk(deps.db, k.id);
      children.push({ ...toSummary(k), risk: r.risk.level, minutesThisWeek: r.signals.minutesThisWeek });
    }
    return c.json({ children, guardians: guardians.map(toSummary) } satisfies FamilyDto);
  })
  /** A student creates a one-time code (valid 24 hours) to give to a parent. */
  .post('/code', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'family-code', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    if (viewer.accountType !== 'student') throw forbidden('students_only');
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    await deps.kv.set(`family-code:${code}`, viewer.id, CODE_TTL);
    return c.json({ code, expiresAt: Date.now() + CODE_TTL * 1000 });
  })
  /** A parent enters the code. Codes work once. */
  .post('/link', async (c) => {
    const viewer = requireUser(c);
    // Guessing codes is rate limited per account and per address.
    await checkRate(c, { bucket: 'family-link', limit: 10, windowSec: 3600, by: 'user' });
    await checkRate(c, { bucket: 'family-link-ip', limit: 30, windowSec: 3600 });
    const deps = c.get('deps');
    if (viewer.accountType !== 'parent') throw forbidden('parents_only');
    const { code } = await body(c, z.object({ code: z.string().trim().toUpperCase().length(8) }));
    const studentId = await deps.kv.get(`family-code:${code}`);
    if (!studentId) throw badRequest('invalid_code');
    if (studentId === viewer.id) throw badRequest('invalid_code');
    const [n] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(guardianLinks)
      .where(eq(guardianLinks.guardianId, viewer.id));
    if ((n?.n ?? 0) >= MAX_CHILDREN) throw conflict('too_many_children');
    await deps.kv.del(`family-code:${code}`);
    const inserted = await deps.db
      .insert(guardianLinks)
      .values({ guardianId: viewer.id, studentId, lastReportAt: new Date() })
      .onConflictDoNothing()
      .returning({ s: guardianLinks.studentId });
    if (inserted.length)
      await notify(deps, {
        userId: studentId,
        type: 'guardian_linked',
        icon: 'users',
        actorId: viewer.id,
        link: '/settings?tab=family',
        data: { name: viewer.displayName },
        pref: 'system',
      });
    const [child] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, studentId));
    return c.json({ child: child ? toSummary(child) : null });
  })
  /** Either side can end the link (a parent removes a child, a student removes a parent). */
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const other = param(c, 'id');
    await deps.db
      .delete(guardianLinks)
      .where(
        or(
          and(eq(guardianLinks.guardianId, viewer.id), eq(guardianLinks.studentId, other)),
          and(eq(guardianLinks.studentId, viewer.id), eq(guardianLinks.guardianId, other)),
        ),
      );
    return c.json({ ok: true });
  })
  .get('/children/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    if (!(await isGuardianOf(deps, viewer.id, id))) throw forbidden('not_linked');
    return c.json(await childReport(deps, id));
  });

/** Weekly summary to every parent (in-app/push notification + email when the address is verified). */
export async function sendWeeklyReports(deps: Deps, limit = 200): Promise<number> {
  const due = await deps.db
    .select({ guardianId: guardianLinks.guardianId, studentId: guardianLinks.studentId })
    .from(guardianLinks)
    .where(sql`${guardianLinks.lastReportAt} is null or ${guardianLinks.lastReportAt} < now() - interval '7 days'`)
    .limit(limit);
  if (!due.length) return 0;
  const people = await deps.db
    .select({ id: users.id, name: users.displayName, email: users.email, verified: users.emailVerifiedAt, appearance: users.appearance })
    .from(users)
    .where(inArray(users.id, [...new Set(due.flatMap((d) => [d.guardianId, d.studentId]))]));
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const d of due) {
    const child = byId.get(d.studentId);
    const parent = byId.get(d.guardianId);
    if (!child || !parent) continue;
    const r = await studentRisk(deps.db, d.studentId);
    const data = {
      name: child.name,
      minutes: r.signals.minutesThisWeek,
      quizAvg: r.signals.quizAvg ?? '—',
      missing: r.signals.missing,
      level: r.risk.level,
    };
    await notify(deps, { userId: d.guardianId, type: 'weekly_report', icon: 'chart', link: `/family?child=${d.studentId}`, data, pref: 'school' });
    if (parent.verified) {
      const ar = (parent.appearance as { language?: string } | null)?.language !== 'en';
      await deps.mailer
        .send({
          to: parent.email,
          subject: ar ? `تقرير ${child.name} الأسبوعي — Qubedu` : `${child.name}'s week — Qubedu`,
          text: ar
            ? `مذاكرة هذا الأسبوع: ${data.minutes} دقيقة\nمتوسط الاختبارات: ${data.quizAvg}\nواجبات متأخرة: ${data.missing}\n\nالتفاصيل: ${deps.env.APP_URL}/family?child=${d.studentId}`
            : `Study this week: ${data.minutes} min\nQuiz average: ${data.quizAvg}\nMissing assignments: ${data.missing}\n\nDetails: ${deps.env.APP_URL}/family?child=${d.studentId}`,
        })
        .catch((err) => deps.log.warn({ err }, 'weekly report email failed'));
    }
    await deps.db
      .update(guardianLinks)
      .set({ lastReportAt: new Date() })
      .where(and(eq(guardianLinks.guardianId, d.guardianId), eq(guardianLinks.studentId, d.studentId)));
  }
  return due.length;
}

export function startWeeklyReports(deps: Deps): () => void {
  const tick = () => void sendWeeklyReports(deps).catch((err) => deps.log.warn({ err }, 'weekly reports failed'));
  const timer = setInterval(tick, 3600_000);
  setTimeout(tick, 60_000);
  return () => clearInterval(timer);
}
