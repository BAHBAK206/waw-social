import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  assignmentInputSchema,
  attendanceMarkSchema,
  attendanceSessionSchema,
  courseAnnouncementSchema,
  courseInputSchema,
  courseMaterialSchema,
  courseMemberRoleSchema,
  essayKeySchema,
  gradeInputSchema,
  hasPermission,
  joinCourseSchema,
  normalizeSearch,
  randomCode,
  rubricInputSchema,
  submissionInputSchema,
  synonymSchema,
  type AssignmentDto,
  type AttendanceSessionDto,
  type CourseAnalyticsDto,
  type CourseAnnouncementDto,
  type CourseDto,
  type CourseInsightsDto,
  type StudentInsightDto,
  type CourseMaterialDto,
  type RubricDto,
  type SubmissionDto,
} from '@qubedu/shared';
import {
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseAnnouncements,
  courseMaterials,
  courseMembers,
  courseSynonyms,
  courses,
  essayKeys,
  knowledgeChunks,
  rubrics,
  submissions,
  topicSamples,
  users,
} from '../db/schema';
import { courseRole, type CourseRole } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms, pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { ch } from '../lib/realtime';
import { claimAttachments, ownAttachment, readableAttachment, type StoredAttachment } from '../lib/attachments';
import { studentRisk } from '../lib/insights';
import { checkRate } from '../middleware';

const ownerCols = {
  ownerId: users.id,
  ownerDisplayName: users.displayName,
  ownerUsername: users.username,
  ownerAvatarUrl: users.avatarUrl,
  ownerAccountType: users.accountType,
  ownerLevel: users.level,
  ownerXp: users.xp,
  ownerBadge: users.badge,
};

export const STAFF: CourseRole[] = ['teacher', 'assistant'];

async function roleOrStaff(deps: Deps, courseId: string, user: AuthUser): Promise<CourseRole | null> {
  const r = await courseRole(deps.db, courseId, user.id);
  if (r) return r;
  return hasPermission(user.role, user.permissions, 'classes.manage') ? 'teacher' : null;
}

export async function requireRole(deps: Deps, courseId: string, user: AuthUser, allowed: CourseRole[]): Promise<CourseRole> {
  const [course] = await deps.db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
  if (!course) throw notFound('course_not_found');
  const r = await roleOrStaff(deps, courseId, user);
  if (!r) throw notFound('course_not_found');
  if (!allowed.includes(r)) throw forbidden('course_forbidden');
  return r;
}

export async function courseDtos(deps: Deps, user: AuthUser, ids: string[]): Promise<CourseDto[]> {
  if (!ids.length) return [];
  const rows = await deps.db
    .select({ c: courses, ...ownerCols })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(inArray(courses.id, ids));
  const roles = await deps.db
    .select({ id: courseMembers.courseId, role: courseMembers.role })
    .from(courseMembers)
    .where(and(inArray(courseMembers.courseId, ids), eq(courseMembers.userId, user.id)));
  const roleMap = new Map(roles.map((r) => [r.id, r.role]));
  const byId = new Map(rows.map((r) => [r.c.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => {
      const myRole = roleMap.get(r.c.id) ?? null;
      return {
        id: r.c.id,
        title: r.c.title,
        description: r.c.description,
        subject: r.c.subject,
        coverUrl: r.c.coverUrl,
        color: r.c.color,
        owner: toSummary(pickSummary('owner', r as unknown as Record<string, unknown>)),
        joinCode: myRole === 'teacher' || myRole === 'assistant' ? r.c.joinCode : null,
        memberCount: r.c.memberCount,
        myRole,
        archived: r.c.archived,
        listed: r.c.listed,
        priceCents: r.c.priceCents,
        currency: r.c.currency,
        createdAt: r.c.createdAt.getTime(),
      };
    });
}

async function submissionDtos(deps: Deps, rows: (typeof submissions.$inferSelect)[]): Promise<SubmissionDto[]> {
  if (!rows.length) return [];
  const students = await deps.db
    .select(summaryColumns)
    .from(users)
    .where(inArray(users.id, [...new Set(rows.map((r) => r.studentId))]));
  const map = new Map(students.map((s) => [s.id, toSummary(s)]));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      assignmentId: r.assignmentId,
      student: map.get(r.studentId)!,
      text: r.text,
      attachments: await Promise.all(
        (r.attachments as SubmissionDto['attachments'] & { key?: string }[]).map(async (a) => {
          const key = (a as { key?: string }).key;
          return key?.startsWith('private/') ? { ...a, url: await deps.storage.urlFor(key) } : a;
        }),
      ),
      status: r.status,
      late: r.late,
      grade: r.grade,
      feedback: r.feedback,
      feedbackAudio: await readableAttachment(deps, r.feedbackAudio as StoredAttachment | null),
      rubricScores: r.rubricScores,
      submittedAt: r.submittedAt.getTime(),
      gradedAt: ms(r.gradedAt),
    })),
  );
}

async function assignmentDto(deps: Deps, user: AuthUser, role: CourseRole, a: typeof assignments.$inferSelect): Promise<AssignmentDto> {
  let mySubmission: SubmissionDto | null = null;
  let stats: AssignmentDto['stats'] = null;
  if (role === 'student') {
    const [s] = await deps.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, user.id)));
    if (s) {
      mySubmission = (await submissionDtos(deps, [s]))[0]!;
      if (s.status === 'submitted') mySubmission = { ...mySubmission, grade: null, feedback: '', rubricScores: null };
    }
  } else {
    const [[agg], [students]] = await Promise.all([
      deps.db
        .select({ submitted: count(), graded: sql<number>`count(*) filter (where ${submissions.status} <> 'submitted')::int` })
        .from(submissions)
        .where(eq(submissions.assignmentId, a.id)),
      deps.db
        .select({ n: count() })
        .from(courseMembers)
        .where(and(eq(courseMembers.courseId, a.courseId), eq(courseMembers.role, 'student'))),
    ]);
    stats = { submitted: agg?.submitted ?? 0, graded: agg?.graded ?? 0, total: students?.n ?? 0 };
  }
  return {
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    description: a.description,
    dueAt: ms(a.dueAt),
    releaseAt: ms(a.releaseAt),
    points: a.points,
    rubricId: a.rubricId,
    allowLate: a.allowLate,
    state: a.state,
    attachments: a.attachments as AssignmentDto['attachments'],
    topic: a.topic,
    createdAt: a.createdAt.getTime(),
    mySubmission,
    stats,
  };
}

async function loadAssignment(deps: Deps, id: string) {
  const [a] = await deps.db.select().from(assignments).where(eq(assignments.id, id));
  if (!a) throw notFound('assignment_not_found');
  return a;
}

function chunkText(text: string, size = 900): { heading: string | null; page: number | null; text: string }[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: { heading: string | null; page: number | null; text: string }[] = [];
  let heading: string | null = null;
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push({ heading, page: null, text: buf.trim() });
    buf = '';
  };
  for (const p of paras) {
    if (p.length < 90 && !/[.!?؟。]$/.test(p) && p.split(/\s+/).length <= 12) {
      flush();
      heading = p.replace(/^#+\s*/, '');
      continue;
    }
    if ((buf + '\n\n' + p).length > size) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  return out.slice(0, 2000);
}

export async function storeChunks(deps: Deps, courseId: string, materialId: string, chunks: { heading: string | null; page: number | null; text: string }[]) {
  await deps.db.delete(knowledgeChunks).where(eq(knowledgeChunks.materialId, materialId));
  const rows = chunks.filter((c) => c.text.trim()).slice(0, 2000);
  for (let i = 0; i < rows.length; i += 200) {
    await deps.db.insert(knowledgeChunks).values(
      rows.slice(i, i + 200).map((c, j) => ({
        materialId,
        courseId,
        position: i + j,
        heading: c.heading?.slice(0, 200) ?? null,
        page: c.page,
        text: c.text.slice(0, 4000),
        searchText: normalizeSearch(`${c.heading ?? ''} ${c.text}`).slice(0, 4000),
      })),
    );
  }
  await deps.db.update(courseMaterials).set({ chunkCount: rows.length }).where(eq(courseMaterials.id, materialId));
  return rows.length;
}

/** Students sorted by who needs help first (high → watch → ok, then by the number of reasons). */
const byRisk = (a: StudentInsightDto, b: StudentInsightDto) => {
  const rank = { high: 0, watch: 1, ok: 2 } as const;
  return rank[a.risk.level] - rank[b.risk.level] || b.risk.reasons.length - a.risk.reasons.length;
};

export const schoolRoutes = new Hono<AppEnv>()
  /* ───── Who needs help ───── */
  .get('/courses/:id/insights', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, id));
    const students = await deps.db
      .select(summaryColumns)
      .from(courseMembers)
      .innerJoin(users, eq(users.id, courseMembers.userId))
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student'), isNull(users.deletedAt)));
    const out: StudentInsightDto[] = [];
    for (const s of students) {
      const r = await studentRisk(deps.db, s.id, [id]);
      out.push({ student: toSummary(s), lastSeenAt: r.lastSeenAt, signals: r.signals, risk: r.risk });
    }
    return c.json({ courseId: id, title: course?.title ?? '', students: out.sort(byRisk) } satisfies CourseInsightsDto);
  })
  /** Across every class I teach: only the students to keep an eye on. */
  .get('/at-risk', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const mine = await deps.db
      .select({ id: courseMembers.courseId, title: courses.title })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .where(and(eq(courseMembers.userId, user.id), inArray(courseMembers.role, STAFF), eq(courses.archived, false)));
    if (!mine.length) return c.json({ items: [] });
    const courseIds = mine.map((m) => m.id);
    const rows = await deps.db
      .selectDistinct({ ...summaryColumns })
      .from(courseMembers)
      .innerJoin(users, eq(users.id, courseMembers.userId))
      .where(and(inArray(courseMembers.courseId, courseIds), eq(courseMembers.role, 'student'), isNull(users.deletedAt)))
      .limit(300);
    const items: (StudentInsightDto & { courses: string[] })[] = [];
    for (const s of rows) {
      const r = await studentRisk(deps.db, s.id, courseIds);
      if (r.risk.level === 'ok') continue;
      const theirs = await deps.db
        .select({ title: courses.title })
        .from(courseMembers)
        .innerJoin(courses, eq(courses.id, courseMembers.courseId))
        .where(and(eq(courseMembers.userId, s.id), inArray(courseMembers.courseId, courseIds)));
      items.push({ student: toSummary(s), lastSeenAt: r.lastSeenAt, signals: r.signals, risk: r.risk, courses: theirs.map((t) => t.title) });
    }
    return c.json({ items: items.sort(byRisk) });
  })
  /** A short encouraging message to one student (arrives as a notification and on their phone). */
  .post('/courses/:id/nudge', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'nudge', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, z.object({ studentId: z.string().uuid(), message: z.string().trim().min(1).max(500) }));
    const [m] = await deps.db
      .select({ role: courseMembers.role })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.userId, input.studentId)));
    if (m?.role !== 'student') throw notFound('student_not_found');
    const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, id));
    await notify(deps, {
      userId: input.studentId,
      type: 'teacher_nudge',
      icon: 'heart',
      actorId: user.id,
      link: `/school/${id}`,
      data: { name: user.displayName, message: input.message, course: course?.title ?? '' },
      pref: 'school',
    });
    return c.json({ ok: true });
  })
  .get('/courses', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, z.object({ archived: z.coerce.boolean().default(false) }));
    const rows = await deps.db
      .select({ id: courses.id })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .where(and(eq(courseMembers.userId, user.id), eq(courses.archived, q.archived)))
      .orderBy(desc(courses.updatedAt));
    return c.json({
      items: await courseDtos(
        deps,
        user,
        rows.map((r) => r.id),
      ),
    });
  })
  .post('/courses', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'course-create', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    if (user.accountType !== 'teacher' && !hasPermission(user.role, user.permissions, 'classes.manage')) throw forbidden('teachers_only');
    const input = await body(c, courseInputSchema);
    const id = await deps.db.transaction(async (tx) => {
      let code = randomCode(7);
      for (let i = 0; i < 5; i++) {
        const [taken] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.joinCode, code));
        if (!taken) break;
        code = randomCode(7);
      }
      const [row] = await tx
        .insert(courses)
        .values({ ...input, searchTitle: normalizeSearch(`${input.title} ${input.subject ?? ''}`), ownerId: user.id, joinCode: code, memberCount: 1 })
        .returning({ id: courses.id });
      await tx.insert(courseMembers).values({ courseId: row!.id, userId: user.id, role: 'teacher' });
      return row!.id;
    });
    return c.json((await courseDtos(deps, user, [id]))[0], 201);
  })
  .post('/join', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'course-join', limit: 20, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const { code } = await body(c, joinCourseSchema);
    const [course] = await deps.db
      .select()
      .from(courses)
      .where(and(eq(courses.joinCode, code.trim().toLowerCase()), eq(courses.archived, false)));
    if (!course) throw notFound('invalid_code');
    const inserted = await deps.db.insert(courseMembers).values({ courseId: course.id, userId: user.id, role: 'student' }).onConflictDoNothing().returning();
    if (inserted.length)
      await deps.db
        .update(courses)
        .set({ memberCount: sql`${courses.memberCount} + 1` })
        .where(eq(courses.id, course.id));
    return c.json((await courseDtos(deps, user, [course.id]))[0]);
  })
  .get('/courses/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    return c.json((await courseDtos(deps, user, [id]))[0]);
  })
  .patch('/courses/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const input = await body(c, courseInputSchema.partial().extend({ archived: z.boolean().optional(), regenerateCode: z.boolean().optional() }));
    const { regenerateCode, ...rest } = input;
    await deps.db
      .update(courses)
      .set({
        ...rest,
        ...(rest.title ? { searchTitle: normalizeSearch(rest.title) } : {}),
        ...(regenerateCode ? { joinCode: randomCode(7) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id));
    return c.json((await courseDtos(deps, user, [id]))[0]);
  })
  .delete('/courses/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const [course] = await deps.db.select().from(courses).where(eq(courses.id, id));
    if (!course) throw notFound();
    if (course.ownerId !== user.id && !hasPermission(user.role, user.permissions, 'classes.manage')) throw forbidden('owner_only');
    await deps.db.delete(courses).where(eq(courses.id, id));
    return c.json({ ok: true });
  })
  .get('/courses/:id/members', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db
      .select({ ...summaryColumns, role: courseMembers.role, joinedAt: courseMembers.joinedAt })
      .from(courseMembers)
      .innerJoin(users, eq(users.id, courseMembers.userId))
      .where(eq(courseMembers.courseId, id))
      .orderBy(asc(courseMembers.role), asc(users.displayName));
    return c.json({ items: rows.map((r) => ({ user: toSummary(r), role: r.role, joinedAt: r.joinedAt.getTime() })) });
  })
  .patch('/courses/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const { role } = await body(c, courseMemberRoleSchema);
    const target = param(c, 'userId');
    const [course] = await deps.db.select({ owner: courses.ownerId }).from(courses).where(eq(courses.id, id));
    if (course?.owner === target) throw forbidden('cannot_change_owner');
    await deps.db
      .update(courseMembers)
      .set({ role })
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.userId, target)));
    return c.json({ ok: true });
  })
  .delete('/courses/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const target = param(c, 'userId');
    if (target !== user.id) await requireRole(deps, id, user, ['teacher']);
    const [course] = await deps.db.select({ owner: courses.ownerId }).from(courses).where(eq(courses.id, id));
    if (course?.owner === target) throw badRequest('owner_cannot_leave');
    const removed = await deps.db
      .delete(courseMembers)
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.userId, target)))
      .returning();
    if (removed.length)
      await deps.db
        .update(courses)
        .set({ memberCount: sql`greatest(${courses.memberCount} - 1, 0)` })
        .where(eq(courses.id, id));
    return c.json({ ok: true });
  })
  .get('/courses/:id/announcements', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db
      .select({ a: courseAnnouncements, ...ownerCols })
      .from(courseAnnouncements)
      .innerJoin(users, eq(users.id, courseAnnouncements.authorId))
      .where(eq(courseAnnouncements.courseId, id))
      .orderBy(desc(courseAnnouncements.createdAt))
      .limit(100);
    const items: CourseAnnouncementDto[] = rows.map((r) => ({
      id: r.a.id,
      author: toSummary(pickSummary('owner', r as unknown as Record<string, unknown>)),
      text: r.a.text,
      attachments: r.a.attachments as CourseAnnouncementDto['attachments'],
      createdAt: r.a.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  .post('/courses/:id/announcements', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, courseAnnouncementSchema);
    const [row] = await deps.db
      .insert(courseAnnouncements)
      .values({ courseId: id, authorId: user.id, text: input.text, attachments: await claimAttachments(deps, user, input.attachments) })
      .returning();
    const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, id));
    const students = await deps.db
      .select({ id: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student')));
    await notify(
      deps,
      students.map((s) => ({
        userId: s.id,
        type: 'course_announcement',
        icon: 'megaphone',
        actorId: user.id,
        link: `/school/${id}`,
        data: { course: course?.title, preview: input.text.slice(0, 80) },
        pref: 'school' as const,
      })),
    );
    await deps.realtime.publish(ch.course(id), 'announcement:new', { id: row!.id });
    return c.json({ id: row!.id }, 201);
  })
  .delete('/courses/:id/announcements/:annId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    await deps.db.delete(courseAnnouncements).where(and(eq(courseAnnouncements.id, param(c, 'annId')), eq(courseAnnouncements.courseId, id)));
    return c.json({ ok: true });
  })
  /* assignments */
  .get('/courses/:id/assignments', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.courseId, id),
          role === 'student' ? sql`${assignments.state} <> 'draft' and (${assignments.releaseAt} is null or ${assignments.releaseAt} <= now())` : undefined,
        ),
      )
      .orderBy(asc(sql`coalesce(${assignments.dueAt}, 'infinity'::timestamptz)`), desc(assignments.createdAt));
    return c.json({ items: await Promise.all(rows.map((a) => assignmentDto(deps, user, role, a))) });
  })
  .post('/courses/:id/assignments', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, assignmentInputSchema);
    if (input.rubricId) {
      const [r] = await deps.db.select({ c: rubrics.courseId }).from(rubrics).where(eq(rubrics.id, input.rubricId));
      if (r?.c !== id) throw badRequest('invalid_rubric');
    }
    const [row] = await deps.db
      .insert(assignments)
      .values({
        ...input,
        attachments: await claimAttachments(deps, user, input.attachments),
        courseId: id,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        releaseAt: input.releaseAt ? new Date(input.releaseAt) : null,
        createdBy: user.id,
      })
      .returning();
    if (row!.state === 'published') {
      const students = await deps.db
        .select({ id: courseMembers.userId })
        .from(courseMembers)
        .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student')));
      await notify(
        deps,
        students.map((s) => ({
          userId: s.id,
          type: 'assignment_new',
          icon: 'clipboard-list',
          actorId: user.id,
          link: `/school/${id}?assignment=${row!.id}`,
          data: { title: row!.title },
          pref: 'school' as const,
        })),
      );
    }
    return c.json(await assignmentDto(deps, user, 'teacher', row!), 201);
  })
  .get('/assignments/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    const role = await requireRole(deps, a.courseId, user, ['teacher', 'assistant', 'student']);
    if (role === 'student' && (a.state === 'draft' || (a.releaseAt && a.releaseAt.getTime() > Date.now()))) throw notFound('assignment_not_found');
    return c.json(await assignmentDto(deps, user, role, a));
  })
  .patch('/assignments/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    await requireRole(deps, a.courseId, user, STAFF);
    const input = await body(c, assignmentInputSchema.partial());
    const [row] = await deps.db
      .update(assignments)
      .set({
        ...input,
        ...(input.attachments ? { attachments: await claimAttachments(deps, user, input.attachments, a.attachments as { key?: string }[]) } : {}),
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
        releaseAt: input.releaseAt === undefined ? undefined : input.releaseAt ? new Date(input.releaseAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, a.id))
      .returning();
    return c.json(await assignmentDto(deps, user, 'teacher', row!));
  })
  .delete('/assignments/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    await requireRole(deps, a.courseId, user, STAFF);
    await deps.db.delete(assignments).where(eq(assignments.id, a.id));
    return c.json({ ok: true });
  })
  .post('/assignments/:id/submit', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'submit', limit: 30, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    await requireRole(deps, a.courseId, user, ['student']);
    if (a.state !== 'published') throw forbidden('assignment_closed');
    if (a.releaseAt && a.releaseAt.getTime() > Date.now()) throw forbidden('assignment_not_released');
    const late = !!a.dueAt && a.dueAt.getTime() < Date.now();
    if (late && !a.allowLate) throw forbidden('deadline_passed');
    const input = await body(c, submissionInputSchema);
    const [prev] = await deps.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, user.id)));
    if (prev && prev.status !== 'submitted') throw conflict('already_graded');
    const values = {
      text: input.text,
      attachments: await claimAttachments(deps, user, input.attachments),
      late,
      submittedAt: new Date(),
      status: 'submitted' as const,
    };
    const [row] = await deps.db
      .insert(submissions)
      .values({ assignmentId: a.id, studentId: user.id, ...values })
      .onConflictDoUpdate({ target: [submissions.assignmentId, submissions.studentId], set: values })
      .returning();
    const staff = await deps.db
      .select({ id: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, a.courseId), inArray(courseMembers.role, STAFF)));
    await notify(
      deps,
      staff.map((s) => ({
        userId: s.id,
        type: 'submission_new',
        icon: 'inbox',
        actorId: user.id,
        link: `/school/${a.courseId}?assignment=${a.id}`,
        data: { title: a.title, name: user.displayName },
        pref: 'school' as const,
      })),
    );
    return c.json((await submissionDtos(deps, [row!]))[0], prev ? 200 : 201);
  })
  .delete('/assignments/:id/submit', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    const [prev] = await deps.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, user.id)));
    if (!prev) throw notFound();
    if (prev.status !== 'submitted') throw conflict('already_graded');
    await deps.db.delete(submissions).where(eq(submissions.id, prev.id));
    return c.json({ ok: true });
  })
  .get('/assignments/:id/submissions', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const a = await loadAssignment(deps, param(c, 'id'));
    await requireRole(deps, a.courseId, user, STAFF);
    const rows = await deps.db.select().from(submissions).where(eq(submissions.assignmentId, a.id)).orderBy(desc(submissions.submittedAt));
    return c.json({ items: await submissionDtos(deps, rows) });
  })
  .post('/submissions/:id/grade', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [s] = await deps.db
      .select()
      .from(submissions)
      .where(eq(submissions.id, param(c, 'id')));
    if (!s) throw notFound('submission_not_found');
    const a = await loadAssignment(deps, s.assignmentId);
    await requireRole(deps, a.courseId, user, STAFF);
    const input = await body(c, gradeInputSchema);
    let grade = input.grade;
    if (input.rubricScores && a.rubricId) {
      const [r] = await deps.db.select().from(rubrics).where(eq(rubrics.id, a.rubricId));
      const max = (r?.criteria ?? []).reduce((sum, cr) => sum + Math.max(0, ...cr.levels.map((l) => l.points)), 0);
      const got = Object.values(input.rubricScores).reduce((x, y) => x + y, 0);
      if (max > 0) grade = Math.round((got / max) * a.points * 10) / 10;
    }
    if (grade > a.points) throw badRequest('grade_exceeds_points');
    const feedbackAudio =
      input.feedbackAudio === undefined ? undefined : input.feedbackAudio ? await ownAttachment(deps, user, input.feedbackAudio, 'audio/') : null;
    const [row] = await deps.db
      .update(submissions)
      .set({
        grade,
        feedback: input.feedback,
        ...(feedbackAudio !== undefined ? { feedbackAudio } : {}),
        rubricScores: input.rubricScores ?? null,
        status: input.returned ? 'returned' : 'graded',
        gradedBy: user.id,
        gradedAt: new Date(),
      })
      .where(eq(submissions.id, s.id))
      .returning();
    if (input.returned)
      await notify(deps, {
        userId: s.studentId,
        type: 'submission_graded',
        icon: 'award',
        actorId: user.id,
        link: `/school/${a.courseId}?assignment=${a.id}`,
        data: { title: a.title, grade, points: a.points },
        pref: 'school',
      });
    return c.json((await submissionDtos(deps, [row!]))[0]);
  })
  /* rubrics */
  .get('/courses/:id/rubrics', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db.select().from(rubrics).where(eq(rubrics.courseId, id)).orderBy(asc(rubrics.title));
    return c.json({ items: rows.map((r): RubricDto => ({ id: r.id, courseId: r.courseId, title: r.title, criteria: r.criteria })) });
  })
  .post('/courses/:id/rubrics', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, rubricInputSchema);
    const [r] = await deps.db.insert(rubrics).values({ courseId: id, title: input.title, criteria: input.criteria }).returning();
    return c.json({ id: r!.id, courseId: id, title: r!.title, criteria: r!.criteria } satisfies RubricDto, 201);
  })
  .delete('/rubrics/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [r] = await deps.db
      .select()
      .from(rubrics)
      .where(eq(rubrics.id, param(c, 'id')));
    if (!r) throw notFound();
    await requireRole(deps, r.courseId, user, STAFF);
    await deps.db.delete(rubrics).where(eq(rubrics.id, r.id));
    return c.json({ ok: true });
  })
  /* attendance */
  .get('/courses/:id/attendance', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const sessions = await deps.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.courseId, id))
      .orderBy(desc(attendanceSessions.day))
      .limit(200);
    const records = sessions.length
      ? await deps.db
          .select()
          .from(attendanceRecords)
          .where(
            and(
              inArray(
                attendanceRecords.sessionId,
                sessions.map((s) => s.id),
              ),
              role === 'student' ? eq(attendanceRecords.studentId, user.id) : undefined,
            ),
          )
      : [];
    const items: AttendanceSessionDto[] = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      day: s.day,
      records: Object.fromEntries(records.filter((r) => r.sessionId === s.id).map((r) => [r.studentId, r.status])),
    }));
    return c.json({ items });
  })
  .post('/courses/:id/attendance', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, attendanceSessionSchema);
    const [s] = await deps.db.insert(attendanceSessions).values({ courseId: id, title: input.title, day: input.day }).returning();
    return c.json({ id: s!.id, title: s!.title, day: s!.day, records: {} } satisfies AttendanceSessionDto, 201);
  })
  .put('/attendance/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [s] = await deps.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, param(c, 'id')));
    if (!s) throw notFound();
    await requireRole(deps, s.courseId, user, STAFF);
    const { records } = await body(c, attendanceMarkSchema);
    const students = new Set(
      (
        await deps.db
          .select({ id: courseMembers.userId })
          .from(courseMembers)
          .where(and(eq(courseMembers.courseId, s.courseId), eq(courseMembers.role, 'student')))
      ).map((r) => r.id),
    );
    const valid = records.filter((r) => students.has(r.studentId));
    for (const r of valid) {
      await deps.db
        .insert(attendanceRecords)
        .values({ sessionId: s.id, studentId: r.studentId, status: r.status })
        .onConflictDoUpdate({ target: [attendanceRecords.sessionId, attendanceRecords.studentId], set: { status: r.status } });
    }
    return c.json({ ok: true, saved: valid.length });
  })
  .delete('/attendance/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [s] = await deps.db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, param(c, 'id')));
    if (!s) throw notFound();
    await requireRole(deps, s.courseId, user, STAFF);
    await deps.db.delete(attendanceSessions).where(eq(attendanceSessions.id, s.id));
    return c.json({ ok: true });
  })
  /* course knowledge (AI grounding) */
  .get('/courses/:id/materials', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db
      .select()
      .from(courseMaterials)
      .where(and(eq(courseMaterials.courseId, id), role === 'student' ? eq(courseMaterials.visibleToStudents, true) : undefined))
      .orderBy(desc(courseMaterials.createdAt));
    return c.json({
      items: rows.map((m): CourseMaterialDto => ({
        id: m.id,
        title: m.title,
        topic: m.topic,
        fileUrl: m.fileUrl,
        chunkCount: m.chunkCount,
        visibleToStudents: m.visibleToStudents,
        createdAt: m.createdAt.getTime(),
      })),
    });
  })
  .post('/courses/:id/materials', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'material', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, courseMaterialSchema);
    let chunks = input.text ? chunkText(input.text) : [];
    if (!chunks.length && input.fileUrl) {
      const m = input.fileUrl.match(/\/files\/((?:public|private)\/[^?]+)/);
      const obj = m ? await deps.storage.get(m[1]!) : null;
      if (!obj) throw badRequest('file_not_found');
      const ext = m![1]!.split('.').pop() ?? '';
      const mime =
        {
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          txt: 'text/plain',
          md: 'text/markdown',
          csv: 'text/csv',
        }[ext] ?? 'application/octet-stream';
      const extracted = await deps.ai.extract({ filename: `material.${ext}`, mime, data: obj.data });
      chunks = extracted.chunks;
    }
    if (!chunks.length) throw badRequest('material_empty');
    const [row] = await deps.db
      .insert(courseMaterials)
      .values({
        courseId: id,
        title: input.title,
        topic: input.topic ?? null,
        fileUrl: input.fileUrl ?? null,
        visibleToStudents: input.visibleToStudents,
        createdBy: user.id,
      })
      .returning();
    const n = await storeChunks(deps, id, row!.id, chunks);
    return c.json(
      {
        id: row!.id,
        title: row!.title,
        topic: row!.topic,
        fileUrl: row!.fileUrl,
        chunkCount: n,
        visibleToStudents: row!.visibleToStudents,
        createdAt: row!.createdAt.getTime(),
      } satisfies CourseMaterialDto,
      201,
    );
  })
  .delete('/materials/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [m] = await deps.db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.id, param(c, 'id')));
    if (!m) throw notFound();
    await requireRole(deps, m.courseId, user, STAFF);
    await deps.db.delete(courseMaterials).where(eq(courseMaterials.id, m.id));
    return c.json({ ok: true });
  })
  .get('/courses/:id/essay-keys', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const rows = await deps.db.select().from(essayKeys).where(eq(essayKeys.courseId, id)).orderBy(desc(essayKeys.createdAt));
    return c.json({
      items: rows.map((k) => ({
        id: k.id,
        prompt: k.prompt,
        topic: k.topic,
        keyPointCount: k.keyPoints.length,
        ...(role === 'student' ? {} : { modelAnswer: k.modelAnswer, keyPoints: k.keyPoints }),
      })),
    });
  })
  .post('/courses/:id/essay-keys', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, essayKeySchema);
    const [row] = await deps.db
      .insert(essayKeys)
      .values({ courseId: id, ...input, topic: input.topic ?? null })
      .returning();
    return c.json({ id: row!.id }, 201);
  })
  .delete('/essay-keys/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [k] = await deps.db
      .select()
      .from(essayKeys)
      .where(eq(essayKeys.id, param(c, 'id')));
    if (!k) throw notFound();
    await requireRole(deps, k.courseId, user, STAFF);
    await deps.db.delete(essayKeys).where(eq(essayKeys.id, k.id));
    return c.json({ ok: true });
  })
  .get('/courses/:id/synonyms', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const rows = await deps.db.select().from(courseSynonyms).where(eq(courseSynonyms.courseId, id)).orderBy(asc(courseSynonyms.term));
    return c.json({ items: rows.map((r) => ({ id: r.id, term: r.term, synonyms: r.synonyms })) });
  })
  .post('/courses/:id/synonyms', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const input = await body(c, synonymSchema);
    const term = input.term.trim().toLowerCase();
    await deps.db
      .insert(courseSynonyms)
      .values({ courseId: id, term, synonyms: input.synonyms })
      .onConflictDoUpdate({ target: [courseSynonyms.courseId, courseSynonyms.term], set: { synonyms: input.synonyms } });
    return c.json({ ok: true }, 201);
  })
  .delete('/synonyms/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [s] = await deps.db
      .select()
      .from(courseSynonyms)
      .where(eq(courseSynonyms.id, param(c, 'id')));
    if (!s) throw notFound();
    await requireRole(deps, s.courseId, user, STAFF);
    await deps.db.delete(courseSynonyms).where(eq(courseSynonyms.id, s.id));
    return c.json({ ok: true });
  })
  /* gradebook & analytics */
  .get('/courses/:id/grades', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireRole(deps, id, user, ['teacher', 'assistant', 'student']);
    const assigns = await deps.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.courseId, id), sql`${assignments.state} <> 'draft'`))
      .orderBy(asc(assignments.createdAt));
    const subs = assigns.length
      ? await deps.db
          .select()
          .from(submissions)
          .where(
            and(
              inArray(
                submissions.assignmentId,
                assigns.map((a) => a.id),
              ),
              role === 'student' ? eq(submissions.studentId, user.id) : undefined,
            ),
          )
      : [];
    const students =
      role === 'student'
        ? [{ ...(await deps.db.select(summaryColumns).from(users).where(eq(users.id, user.id)))[0]! }]
        : await deps.db
            .select(summaryColumns)
            .from(courseMembers)
            .innerJoin(users, eq(users.id, courseMembers.userId))
            .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student')))
            .orderBy(asc(users.displayName));
    return c.json({
      assignments: assigns.map((a) => ({ id: a.id, title: a.title, points: a.points, dueAt: ms(a.dueAt) })),
      rows: students.map((s) => ({
        student: toSummary(s),
        grades: Object.fromEntries(
          assigns.map((a) => {
            const sub = subs.find((x) => x.assignmentId === a.id && x.studentId === s.id);
            const visible = sub && (role !== 'student' || sub.status === 'returned');
            return [a.id, sub ? { status: sub.status, grade: visible ? sub.grade : null, late: sub.late } : null];
          }),
        ),
      })),
    });
  })
  .get('/courses/:id/analytics', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, STAFF);
    const students = await deps.db
      .select(summaryColumns)
      .from(courseMembers)
      .innerJoin(users, eq(users.id, courseMembers.userId))
      .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student')));
    const assigns = await deps.db
      .select({ id: assignments.id, points: assignments.points })
      .from(assignments)
      .where(and(eq(assignments.courseId, id), eq(assignments.state, 'published')));
    const subs = assigns.length
      ? await deps.db
          .select()
          .from(submissions)
          .where(
            inArray(
              submissions.assignmentId,
              assigns.map((a) => a.id),
            ),
          )
      : [];
    const pointsOf = new Map(assigns.map((a) => [a.id, a.points]));
    const sessions = await deps.db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.courseId, id));
    const records = sessions.length
      ? await deps.db
          .select()
          .from(attendanceRecords)
          .where(
            inArray(
              attendanceRecords.sessionId,
              sessions.map((s) => s.id),
            ),
          )
      : [];
    const pct = (s: typeof subs) => {
      const graded = s.filter((x) => x.grade !== null);
      if (!graded.length) return null;
      return Math.round((graded.reduce((sum, x) => sum + (x.grade! / Math.max(1, pointsOf.get(x.assignmentId) ?? 100)) * 100, 0) / graded.length) * 10) / 10;
    };
    const att = (r: typeof records) =>
      r.length ? Math.round((r.filter((x) => x.status === 'present' || x.status === 'late').length / r.length) * 1000) / 10 : null;
    const topicRows = students.length
      ? await deps.db
          .select({
            topic: topicSamples.topic,
            correct: sql<number>`sum(${topicSamples.correct})::int`,
            total: sql<number>`sum(${topicSamples.total})::int`,
            students: sql<number>`count(distinct ${topicSamples.userId})::int`,
          })
          .from(topicSamples)
          .where(
            and(
              eq(topicSamples.courseId, id),
              inArray(
                topicSamples.userId,
                students.map((s) => s.id),
              ),
            ),
          )
          .groupBy(topicSamples.topic)
      : [];
    const dto: CourseAnalyticsDto = {
      students: students.length,
      assignments: assigns.length,
      submissionRate: students.length && assigns.length ? Math.round((subs.length / (students.length * assigns.length)) * 1000) / 10 : 0,
      averageGrade: pct(subs),
      attendanceRate: att(records),
      topicMastery: topicRows
        .map((t) => ({ topic: t.topic, mastery: Math.round((t.correct / Math.max(1, t.total)) * 100), students: t.students }))
        .sort((a, b) => a.mastery - b.mastery),
      perStudent: students.map((s) => {
        const mine = subs.filter((x) => x.studentId === s.id);
        return { student: toSummary(s), submitted: mine.length, averageGrade: pct(mine), attendance: att(records.filter((r) => r.studentId === s.id)) };
      }),
    };
    return c.json(dto);
  });
