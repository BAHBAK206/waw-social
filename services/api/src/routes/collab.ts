import {
  addDays,
  canMentor,
  classGoalSchema,
  dayKey,
  groupTaskSchema,
  groupTaskUpdateSchema,
  mentorQuerySchema,
  mentorSettingsSchema,
  rankClasses,
  weekStartOf,
  type ClassChallengeDto,
  type ClassGoalDto,
  type GroupStudyDto,
  type GroupTaskDto,
  type MentorDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { classGoals, comments, courseMembers, courses, groupMembers, groupTasks, posts, studyLog, users } from '../db/schema';
import { courseRole, groupRole, loadGroup } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { awardXp } from '../lib/progress';
import { checkRate } from '../middleware';

const GOAL_XP = 20;

/* ───────── Study group: shared tasks and this week's study time ───────── */

async function assertMember(deps: Deps, viewer: AuthUser, groupId: string) {
  const g = await loadGroup(deps.db, groupId);
  if (!(await groupRole(deps.db, g.id, viewer.id))) throw forbidden('not_a_member');
  return g;
}

const toTask = (r: typeof groupTasks.$inferSelect & { doneByName: string | null }): GroupTaskDto => ({
  id: r.id,
  title: r.title,
  done: !!r.doneAt,
  doneByName: r.doneByName,
  createdAt: r.createdAt.getTime(),
});

async function loadTasks(deps: Deps, groupId: string) {
  const rows = await deps.db
    .select({ t: groupTasks, doneByName: users.displayName })
    .from(groupTasks)
    .leftJoin(users, eq(users.id, groupTasks.doneBy))
    .where(eq(groupTasks.groupId, groupId))
    .orderBy(asc(groupTasks.doneAt), desc(groupTasks.createdAt))
    .limit(100);
  return rows.map((r) => toTask({ ...r.t, doneByName: r.doneByName }));
}

export const groupStudyRoutes = new Hono<AppEnv>()
  .get('/:id/study', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await assertMember(deps, viewer, param(c, 'id'));
    const weekStart = weekStartOf(dayKey(Date.now(), viewer.timezone));
    const [tasks, rows] = await Promise.all([
      loadTasks(deps, g.id),
      deps.db
        .select({ ...summaryColumns, minutes: sql<number>`coalesce(sum(${studyLog.minutes}), 0)::int` })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .leftJoin(studyLog, and(eq(studyLog.userId, users.id), gte(studyLog.day, weekStart)))
        .where(eq(groupMembers.groupId, g.id))
        .groupBy(users.id)
        .orderBy(desc(sql`coalesce(sum(${studyLog.minutes}), 0)`), asc(users.displayName))
        .limit(50),
    ]);
    const dto: GroupStudyDto = {
      weekStart,
      tasks,
      board: rows.map((r, i) => ({ rank: i + 1, user: toSummary(r), minutes: r.minutes })),
      totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
    };
    return c.json(dto);
  })
  .post('/:id/tasks', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'group-task', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const g = await assertMember(deps, viewer, param(c, 'id'));
    const { title } = await body(c, groupTaskSchema);
    const [{ n }] = (await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(groupTasks)
      .where(eq(groupTasks.groupId, g.id))) as [{ n: number }];
    if (n >= 200) throw forbidden('too_many_tasks');
    const [row] = await deps.db.insert(groupTasks).values({ groupId: g.id, title, createdBy: viewer.id }).returning();
    return c.json(toTask({ ...row!, doneByName: null }), 201);
  })
  .patch('/:id/tasks/:taskId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await assertMember(deps, viewer, param(c, 'id'));
    const { done } = await body(c, groupTaskUpdateSchema);
    const [row] = await deps.db
      .update(groupTasks)
      .set(done ? { doneBy: viewer.id, doneAt: new Date() } : { doneBy: null, doneAt: null })
      .where(and(eq(groupTasks.id, param(c, 'taskId')), eq(groupTasks.groupId, g.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(toTask({ ...row, doneByName: done ? viewer.displayName : null }));
  })
  .delete('/:id/tasks/:taskId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await assertMember(deps, viewer, param(c, 'id'));
    const role = await groupRole(deps.db, g.id, viewer.id);
    const [task] = await deps.db
      .select()
      .from(groupTasks)
      .where(and(eq(groupTasks.id, param(c, 'taskId')), eq(groupTasks.groupId, g.id)));
    if (!task) throw notFound();
    if (task.createdBy !== viewer.id && role !== 'owner' && role !== 'admin' && role !== 'teacher') throw forbidden();
    await deps.db.delete(groupTasks).where(eq(groupTasks.id, task.id));
    return c.json({ ok: true });
  });

/* ───────── Class challenge, class goals, mentors ───────── */

/** Students and study minutes per class between two days (from inclusive, to exclusive). */
async function classScores(deps: Deps, courseIds: string[], from: string, to: string) {
  if (!courseIds.length) return [];
  const rows = await deps.db
    .select({
      courseId: courseMembers.courseId,
      title: courses.title,
      students: sql<number>`count(distinct ${courseMembers.userId})::int`,
      minutes: sql<number>`coalesce(sum(${studyLog.minutes}), 0)::int`,
    })
    .from(courseMembers)
    .innerJoin(courses, eq(courses.id, courseMembers.courseId))
    .leftJoin(studyLog, and(eq(studyLog.userId, courseMembers.userId), gte(studyLog.day, from), lt(studyLog.day, to)))
    .where(and(inArray(courseMembers.courseId, courseIds), eq(courseMembers.role, 'student')))
    .groupBy(courseMembers.courseId, courses.title);
  return rankClasses(rows);
}

async function memberCourse(deps: Deps, viewer: AuthUser, courseId: string) {
  const role = await courseRole(deps.db, courseId, viewer.id);
  if (!role) throw forbidden('not_enrolled');
  const [course] = await deps.db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) throw notFound();
  return { course, role };
}

async function goalDto(deps: Deps, viewer: AuthUser, courseId: string, canSet: boolean): Promise<ClassGoalDto> {
  const weekStart = weekStartOf(dayKey(Date.now(), viewer.timezone));
  const [goal] = await deps.db
    .select()
    .from(classGoals)
    .where(and(eq(classGoals.courseId, courseId), eq(classGoals.weekStart, weekStart)));
  const [score] = await classScores(deps, [courseId], weekStart, addDays(weekStart, 7));
  const minutes = score?.minutes ?? 0;
  let reachedAt = goal?.reachedAt ?? null;
  if (goal && !reachedAt && minutes >= goal.targetMinutes) {
    // The first reader to see the goal reached records it and rewards the class; later readers see it already done.
    const [won] = await deps.db
      .update(classGoals)
      .set({ reachedAt: new Date() })
      .where(and(eq(classGoals.id, goal.id), isNull(classGoals.reachedAt)))
      .returning({ id: classGoals.id });
    if (won) {
      reachedAt = new Date();
      const students = await deps.db
        .select({ id: courseMembers.userId })
        .from(courseMembers)
        .where(and(eq(courseMembers.courseId, courseId), eq(courseMembers.role, 'student')));
      const day = dayKey(Date.now());
      await deps.db.transaction(async (tx) => {
        for (const s of students) await awardXp(tx, s.id, GOAL_XP, 'class_goal', goal.id, day);
      });
      const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId));
      await notify(
        deps,
        students.map((s) => ({
          userId: s.id,
          type: 'class_goal',
          icon: 'trophy',
          link: `/school/${courseId}`,
          data: { title: course?.title ?? '', minutes: goal.targetMinutes, xp: GOAL_XP },
          pref: 'school' as const,
        })),
      );
    }
  }
  const [{ n }] = (await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(classGoals)
    .where(and(eq(classGoals.courseId, courseId), isNotNull(classGoals.reachedAt)))) as [{ n: number }];
  return {
    courseId,
    weekStart,
    targetMinutes: goal?.targetMinutes ?? null,
    minutes,
    reached: !!reachedAt,
    badges: n,
    students: score?.students ?? 0,
    canSet,
  };
}

export const collabRoutes = new Hono<AppEnv>()
  .get('/challenge/:courseId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const { course } = await memberCourse(deps, viewer, param(c, 'courseId'));
    const weekStart = weekStartOf(dayKey(Date.now(), viewer.timezone));
    let standings: ClassChallengeDto['standings'] = [];
    let lastWeekWinner: ClassChallengeDto['lastWeekWinner'] = null;
    if (course.schoolId) {
      const siblings = await deps.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.schoolId, course.schoolId), eq(courses.archived, false)));
      const ids = siblings.map((s) => s.id);
      const [now, last] = await Promise.all([
        classScores(deps, ids, weekStart, addDays(weekStart, 7)),
        classScores(deps, ids, addDays(weekStart, -7), weekStart),
      ]);
      standings = now.map((s) => ({ ...s, mine: s.courseId === course.id }));
      const w = last.find((s) => s.minutes > 0 && s.rank === 1);
      lastWeekWinner = w ? { courseId: w.courseId, title: w.title, average: w.average } : null;
    }
    const dto: ClassChallengeDto = { weekStart, schoolId: course.schoolId, standings, lastWeekWinner };
    return c.json(dto);
  })
  .get('/goals/:courseId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const { role } = await memberCourse(deps, viewer, param(c, 'courseId'));
    return c.json(await goalDto(deps, viewer, param(c, 'courseId'), role === 'teacher' || role === 'assistant'));
  })
  .put('/goals/:courseId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const { role } = await memberCourse(deps, viewer, param(c, 'courseId'));
    if (role !== 'teacher' && role !== 'assistant') throw forbidden('course_staff_only');
    const { targetMinutes } = await body(c, classGoalSchema);
    const weekStart = weekStartOf(dayKey(Date.now(), viewer.timezone));
    await deps.db
      .insert(classGoals)
      .values({ courseId: param(c, 'courseId'), weekStart, targetMinutes, createdBy: viewer.id })
      .onConflictDoUpdate({ target: [classGoals.courseId, classGoals.weekStart], set: { targetMinutes } });
    return c.json(await goalDto(deps, viewer, param(c, 'courseId'), true));
  })
  .get('/mentors', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, mentorQuerySchema);
    const rows = await deps.db
      .select({ ...summaryColumns, subjects: users.mentorSubjects })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          isNull(users.bannedAt),
          ne(users.id, viewer.id),
          sql`jsonb_array_length(${users.mentorSubjects}) > 0`,
          q.subject ? sql`${users.mentorSubjects} @> ${JSON.stringify([q.subject])}::jsonb` : undefined,
        ),
      )
      .limit(60);
    const ids = rows.map((r) => r.id);
    const helped = ids.length
      ? await deps.db
          .select({ authorId: comments.authorId, n: sql<number>`count(*)::int` })
          .from(posts)
          .innerJoin(comments, eq(comments.id, posts.acceptedCommentId))
          .where(and(inArray(comments.authorId, ids), ne(posts.authorId, comments.authorId)))
          .groupBy(comments.authorId)
      : [];
    const count = new Map(helped.map((h) => [h.authorId, h.n]));
    const items: MentorDto[] = rows
      .map((r) => ({ user: toSummary(r), subjects: r.subjects, helped: count.get(r.id) ?? 0 }))
      .sort((a, b) => b.helped - a.helped || a.user.displayName.localeCompare(b.user.displayName));
    return c.json({ items });
  })
  .get('/mentors/me', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const [me] = await db.select({ subjects: users.mentorSubjects, grade: users.gradeLevel }).from(users).where(eq(users.id, viewer.id));
    return c.json({ subjects: me?.subjects ?? [], eligible: canMentor(me?.grade, viewer.accountType) });
  })
  .put('/mentors/me', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const { subjects } = await body(c, mentorSettingsSchema);
    const [me] = await db.select({ grade: users.gradeLevel }).from(users).where(eq(users.id, viewer.id));
    if (subjects.length && !canMentor(me?.grade, viewer.accountType)) throw forbidden('mentor_not_eligible');
    const clean = [...new Set(subjects.map((s) => s.trim()))];
    await db.update(users).set({ mentorSubjects: clean }).where(eq(users.id, viewer.id));
    return c.json({ subjects: clean, eligible: true });
  });
