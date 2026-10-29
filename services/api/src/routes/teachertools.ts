import { createTranslator, isLocale } from '@qubedu/i18n';
import {
  commentSendSchema,
  commentSuggestSchema,
  compareQuerySchema,
  lessonPlanSchema,
  lessonTimeline,
  paperReadSchema,
  paperSuggestSchema,
  suggestPaperMarks,
  templateInputSchema,
  templateUseSchema,
  tierQuestions,
  worksheetSchema,
  hasPermission,
  type ClassComparisonDto,
  type LessonPlanDto,
  type PaperGradeDto,
  type QuizInput,
  type SchoolTemplateDto,
  type StudentCommentDto,
  type WorksheetDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  assignments,
  attendanceRecords,
  attendanceSessions,
  courseMembers,
  courses,
  curriculumLinks,
  curriculumNodes,
  guardianLinks,
  objectiveSamples,
  quizQuestions,
  quizzes,
  schoolMembers,
  schoolTemplates,
  studentComments,
  submissions,
  uploads,
  users,
  videos,
} from '../db/schema';
import { courseRole } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { computeGradebook } from '../lib/gradebook';
import { body, param, query, requireUser } from '../lib/http';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { quizValues, saveQuestions } from './quizzes';

const IMAGE = /^image\/(jpeg|png|webp|heic|gif)$/;

function assertTeacher(u: AuthUser) {
  if (u.accountType !== 'teacher' && !hasPermission(u.role, u.permissions, 'content.manage')) throw forbidden('teachers_only');
}

async function staffCourse(deps: Deps, user: AuthUser, courseId: string) {
  const role = await courseRole(deps.db, courseId, user.id);
  if (role !== 'teacher' && role !== 'assistant') throw forbidden('course_staff_only');
  const [course] = await deps.db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) throw notFound();
  return course;
}

type QuestionRow = typeof quizQuestions.$inferSelect;
const toInputQuestion = (q: QuestionRow): QuizInput['questions'][number] =>
  ({
    type: q.type,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    options: q.type === 'short' ? [] : q.options,
    answer: q.answer,
    explanation: q.explanation,
    topic: q.topic,
    points: q.points,
    objectiveId: q.objectiveId,
    bloom: q.bloom,
    level: q.level,
  }) as QuizInput['questions'][number];

/** Creates a quiz owned by the teacher (a plain quiz, published) and returns its id. */
async function createQuiz(
  deps: Deps,
  user: AuthUser,
  input: { title: string; description?: string; courseId?: string | null; questions: QuizInput['questions']; durationSec?: number },
) {
  const full = {
    title: input.title,
    description: input.description ?? '',
    kind: 'quiz',
    difficulty: 'medium',
    durationSec: input.durationSec ?? Math.max(300, input.questions.length * 90),
    published: true,
    shuffle: false,
    shuffleOptions: false,
    integrity: false,
    questions: input.questions,
  } as unknown as QuizInput;
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(quizzes)
      .values({ ...quizValues(full, input.questions.length), courseId: input.courseId ?? null, createdBy: user.id })
      .returning({ id: quizzes.id });
    await saveQuestions(tx, row!.id, full);
    return row!.id;
  });
}

/* ───────── Student comment ───────── */

async function studentFacts(deps: Deps, course: typeof courses.$inferSelect, studentId: string) {
  const [member] = await deps.db
    .select({ role: courseMembers.role })
    .from(courseMembers)
    .where(and(eq(courseMembers.courseId, course.id), eq(courseMembers.userId, studentId)));
  if (member?.role !== 'student') throw badRequest('not_a_student');
  const g = await computeGradebook(deps, course, [studentId], false);
  const percent = g.rows.get(studentId)?.result.percent ?? null;
  const [att] = await deps.db
    .select({
      total: sql<number>`count(*)::int`,
      here: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present','late','excused'))::int`,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
    .where(and(eq(attendanceSessions.courseId, course.id), eq(attendanceRecords.studentId, studentId)));
  const due = await deps.db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.courseId, course.id), eq(assignments.state, 'published'), lt(assignments.dueAt, new Date())));
  const done = due.length
    ? await deps.db
        .select({ id: submissions.assignmentId })
        .from(submissions)
        .where(
          and(
            eq(submissions.studentId, studentId),
            inArray(
              submissions.assignmentId,
              due.map((d) => d.id),
            ),
          ),
        )
    : [];
  return {
    percent: percent === null ? null : Math.round(percent),
    attendance: att?.total ? Math.round((att.here / att.total) * 100) : null,
    missing: due.length - done.length,
  };
}

export async function suggestComment(deps: Deps, teacher: AuthUser, courseId: string, studentId: string, language?: string) {
  const course = await staffCourse(deps, teacher, courseId);
  const facts = await studentFacts(deps, course, studentId);
  const [student] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, studentId));
  const [me] = await deps.db.select({ appearance: users.appearance }).from(users).where(eq(users.id, teacher.id));
  const lang = language ?? (me?.appearance as { language?: string } | undefined)?.language;
  const tr = createTranslator(isLocale(lang) ? lang : 'en');
  const name = (student?.name ?? '').split(' ')[0] ?? '';
  const subject = course.subject ?? course.title;
  const band = facts.percent === null ? 'none' : facts.percent >= 85 ? 'strong' : facts.percent >= 65 ? 'good' : facts.percent >= 50 ? 'fair' : 'weak';
  const parts = [tr.tDyn(`teacherTools.comment.${band}`, { name, subject, percent: facts.percent ?? 0 })];
  if (facts.attendance !== null && facts.attendance < 85) parts.push(tr.t('teacherTools.comment.attendance', { rate: facts.attendance }));
  if (facts.missing > 0) parts.push(tr.t('teacherTools.comment.missing', { count: facts.missing }));
  parts.push(tr.t(band === 'weak' || band === 'fair' || facts.missing > 0 ? 'teacherTools.comment.closeSupport' : 'teacherTools.comment.closeKeepGoing'));
  return { text: parts.join(' '), facts };
}

/* ───────── Routes ───────── */

export const teacherToolRoutes = new Hono<AppEnv>()
  .post('/lesson-plan', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    const deps = c.get('deps');
    const { objectiveId, minutes } = await body(c, lessonPlanSchema);
    const [node] = await deps.db.select().from(curriculumNodes).where(eq(curriculumNodes.id, objectiveId));
    if (!node || node.kind !== 'objective') throw notFound('objective_not_found');
    const path: string[] = [];
    for (let id = node.parentId, i = 0; id && i < 4; i++) {
      const [p] = await deps.db
        .select({ title: curriculumNodes.title, parentId: curriculumNodes.parentId })
        .from(curriculumNodes)
        .where(eq(curriculumNodes.id, id));
      if (!p) break;
      path.unshift(p.title);
      id = p.parentId;
    }
    const links = await deps.db.select().from(curriculumLinks).where(eq(curriculumLinks.nodeId, node.id)).limit(20);
    const quizIds = links.filter((l) => l.targetType === 'quiz').map((l) => l.targetId);
    const videoIds = links.filter((l) => l.targetType === 'video').map((l) => l.targetId);
    const [quizRows, videoRows, questions] = await Promise.all([
      quizIds.length
        ? deps.db
            .select({ id: quizzes.id, title: quizzes.title })
            .from(quizzes)
            .where(and(inArray(quizzes.id, quizIds), eq(quizzes.published, true), isNull(quizzes.deletedAt)))
        : [],
      videoIds.length
        ? deps.db
            .select({ id: videos.id, title: videos.title })
            .from(videos)
            .where(and(inArray(videos.id, videoIds), isNull(videos.deletedAt), eq(videos.visibility, 'public')))
        : [],
      deps.db
        .select({ q: quizQuestions })
        .from(quizQuestions)
        .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
        .where(and(eq(quizQuestions.objectiveId, node.id), isNull(quizzes.deletedAt), or(eq(quizzes.published, true), eq(quizzes.createdBy, user.id))))
        .limit(8),
    ]);
    const dto: LessonPlanDto = {
      objective: { id: node.id, title: node.title, description: node.description },
      path,
      minutes,
      sections: lessonTimeline(minutes),
      resources: [...quizRows.map((r) => ({ kind: 'quiz' as const, ...r })), ...videoRows.map((r) => ({ kind: 'video' as const, ...r }))],
      questions: questions.map(({ q }) => ({ type: q.type, prompt: q.prompt.slice(0, 300), level: q.level })),
    };
    return c.json(dto);
  })
  .post('/paper/read', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    await checkRate(c, { bucket: 'paper-ocr', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { fileUrl, language } = await body(c, paperReadSchema);
    const key = /\/files\/((?:public|private)\/[^?#]+)/.exec(fileUrl)?.[1];
    if (!key) throw badRequest('invalid_media_url');
    const [row] = await deps.db
      .select({ mime: uploads.mime })
      .from(uploads)
      .where(and(eq(uploads.key, key), eq(uploads.ownerId, user.id)));
    if (!row || !IMAGE.test(row.mime)) throw badRequest('invalid_media_url');
    const file = await deps.storage.get(key);
    if (!file) throw badRequest('invalid_media_url');
    return c.json(await deps.ai.ocr({ image: file.data, mime: row.mime, language }));
  })
  .post('/paper/suggest', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    const { text, key } = await body(c, paperSuggestSchema);
    const dto: PaperGradeDto = suggestPaperMarks(text, key);
    return c.json(dto);
  })
  .get('/compare', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    const deps = c.get('deps');
    const ids = [
      ...new Set(
        query(c, compareQuerySchema)
          .courseIds.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 8);
    const rows: { course: typeof courses.$inferSelect; students: string[] }[] = [];
    for (const id of ids) {
      const course = await staffCourse(deps, user, id);
      const st = await deps.db
        .select({ id: courseMembers.userId })
        .from(courseMembers)
        .where(and(eq(courseMembers.courseId, id), eq(courseMembers.role, 'student')));
      rows.push({ course, students: st.map((s) => s.id) });
    }
    const all = [...new Set(rows.flatMap((r) => r.students))];
    const samples = all.length
      ? await deps.db
          .select({
            userId: objectiveSamples.userId,
            objectiveId: objectiveSamples.objectiveId,
            correct: sql<number>`sum(${objectiveSamples.correct})::int`,
            total: sql<number>`sum(${objectiveSamples.total})::int`,
          })
          .from(objectiveSamples)
          .where(and(inArray(objectiveSamples.userId, all), gte(objectiveSamples.createdAt, new Date(Date.now() - 180 * 86_400_000))))
          .groupBy(objectiveSamples.userId, objectiveSamples.objectiveId)
      : [];
    const volume = new Map<string, number>();
    for (const s of samples) volume.set(s.objectiveId, (volume.get(s.objectiveId) ?? 0) + s.total);
    const top = [...volume]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);
    const titles = top.length
      ? await deps.db.select({ id: curriculumNodes.id, title: curriculumNodes.title }).from(curriculumNodes).where(inArray(curriculumNodes.id, top))
      : [];
    const objectives = top.map((id) => ({ id, title: titles.find((t) => t.id === id)?.title ?? '' }));
    const dto: ClassComparisonDto = {
      objectives,
      classes: rows.map((r) => {
        const mine = new Set(r.students);
        const cells: ClassComparisonDto['classes'][number]['cells'] = {};
        for (const o of top) {
          const part = samples.filter((s) => s.objectiveId === o && mine.has(s.userId));
          const total = part.reduce((n, s) => n + s.total, 0);
          cells[o] = total ? { pct: Math.round((part.reduce((n, s) => n + s.correct, 0) / total) * 100), questions: total } : null;
        }
        return { courseId: r.course.id, title: r.course.title, students: r.students.length, cells };
      }),
    };
    return c.json(dto);
  })
  .post('/worksheet', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    await checkRate(c, { bucket: 'worksheet', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, worksheetSchema);
    if (!input.objectiveId && !input.bankId) throw badRequest('objective_or_bank_required');
    const rows = await deps.db
      .select({ q: quizQuestions })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
      .where(
        and(
          isNull(quizzes.deletedAt),
          input.objectiveId ? eq(quizQuestions.objectiveId, input.objectiveId) : eq(quizQuestions.quizId, input.bankId!),
          // Questions of published quizzes, or the teacher's own banks and quizzes.
          or(eq(quizzes.published, true), eq(quizzes.createdBy, user.id)),
        ),
      )
      .orderBy(asc(quizQuestions.position))
      .limit(400);
    if (!rows.length) throw new AppError(422, 'no_questions_found');
    const tiers = tierQuestions(
      rows.map((r) => r.q),
      input.perTier,
    );
    const pick = (q: QuestionRow) => ({ type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, level: q.level });
    const dto: WorksheetDto = {
      tiers: { easy: tiers.easy.map(pick), medium: tiers.medium.map(pick), advanced: tiers.advanced.map(pick) },
      quizIds: {},
    };
    if (input.save) {
      const base = input.title?.trim() || 'Worksheet';
      for (const t of ['easy', 'medium', 'advanced'] as const) {
        if (!tiers[t].length) continue;
        dto.quizIds[t] = await createQuiz(deps, user, { title: `${base} (${t})`, courseId: input.courseId ?? null, questions: tiers[t].map(toInputQuestion) });
      }
    }
    return c.json(dto);
  })
  .post('/comments/suggest', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    const deps = c.get('deps');
    const { courseId, studentId, language } = await body(c, commentSuggestSchema);
    return c.json(await suggestComment(deps, user, courseId, studentId, language));
  })
  .post('/comments/send', async (c) => {
    const user = requireUser(c);
    assertTeacher(user);
    await checkRate(c, { bucket: 'student-comment', limit: 100, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { courseId, studentId, text } = await body(c, commentSendSchema);
    const course = await staffCourse(deps, user, courseId);
    const [member] = await deps.db
      .select({ role: courseMembers.role })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, courseId), eq(courseMembers.userId, studentId)));
    if (member?.role !== 'student') throw badRequest('not_a_student');
    const [row] = await deps.db.insert(studentComments).values({ courseId, studentId, teacherId: user.id, text }).returning();
    const parents = await deps.db.select({ id: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, studentId));
    await notify(
      deps,
      [studentId, ...parents.map((p) => p.id)].map((userId) => ({
        userId,
        type: 'teacher_comment',
        icon: 'message-square-text',
        actorId: user.id,
        link: userId === studentId ? '/grades' : '/family',
        data: { name: user.displayName, course: course.title },
        pref: 'school' as const,
      })),
    );
    return c.json({ id: row!.id }, 201);
  })
  .get('/comments/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    // A student sees comments about themselves; a parent sees their children's.
    const kids = await deps.db.select({ id: guardianLinks.studentId }).from(guardianLinks).where(eq(guardianLinks.guardianId, user.id));
    const ids = [user.id, ...kids.map((k) => k.id)];
    const rows = await deps.db
      .select({ c: studentComments, courseTitle: courses.title, teacherName: users.displayName })
      .from(studentComments)
      .innerJoin(courses, eq(courses.id, studentComments.courseId))
      .leftJoin(users, eq(users.id, studentComments.teacherId))
      .where(inArray(studentComments.studentId, ids))
      .orderBy(desc(studentComments.createdAt))
      .limit(50);
    const items: StudentCommentDto[] = rows.map((r) => ({
      id: r.c.id,
      courseId: r.c.courseId,
      courseTitle: r.courseTitle,
      text: r.c.text,
      teacherName: r.teacherName,
      createdAt: r.c.createdAt.getTime(),
    }));
    return c.json({ items });
  });

/* ───────── Shared templates inside a school ───────── */

async function schoolTeacher(deps: Deps, user: AuthUser, schoolId: string) {
  const [m] = await deps.db
    .select({ role: schoolMembers.role, status: schoolMembers.status })
    .from(schoolMembers)
    .where(and(eq(schoolMembers.schoolId, schoolId), eq(schoolMembers.userId, user.id)));
  if (!m || m.status !== 'active' || (m.role !== 'teacher' && m.role !== 'admin')) throw forbidden('school_staff_only');
  return m.role;
}

export const schoolTemplateRoutes = new Hono<AppEnv>()
  .get('/:id/templates', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await schoolTeacher(deps, user, param(c, 'id'));
    const kind = c.req.query('kind');
    const rows = await deps.db
      .select({ t: schoolTemplates, author: users.displayName })
      .from(schoolTemplates)
      .leftJoin(users, eq(users.id, schoolTemplates.authorId))
      .where(and(eq(schoolTemplates.schoolId, param(c, 'id')), kind === 'quiz' || kind === 'assignment' ? eq(schoolTemplates.kind, kind) : undefined))
      .orderBy(desc(schoolTemplates.createdAt))
      .limit(100);
    const items: SchoolTemplateDto[] = rows.map(({ t, author }) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      authorName: author,
      uses: t.uses,
      questionCount: t.kind === 'quiz' ? ((t.payload.questions as unknown[] | undefined)?.length ?? 0) : null,
      mine: t.authorId === user.id,
      createdAt: t.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  .post('/:id/templates', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-template', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    await schoolTeacher(deps, user, param(c, 'id'));
    const input = await body(c, templateInputSchema);
    let title: string;
    let payload: Record<string, unknown>;
    if (input.kind === 'quiz') {
      const [quiz] = await deps.db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, input.quizId), isNull(quizzes.deletedAt)));
      if (!quiz || quiz.createdBy !== user.id) throw forbidden('quiz_not_yours');
      const qs = await deps.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position));
      title = quiz.title;
      payload = { description: quiz.description, durationSec: quiz.durationSec, questions: qs.map(toInputQuestion) };
    } else {
      title = input.title;
      payload = { description: input.description, points: input.points };
    }
    const [row] = await deps.db
      .insert(schoolTemplates)
      .values({ schoolId: param(c, 'id'), kind: input.kind, title, payload, authorId: user.id })
      .returning({ id: schoolTemplates.id });
    return c.json({ id: row!.id }, 201);
  })
  .post('/:id/templates/:tid/use', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await schoolTeacher(deps, user, param(c, 'id'));
    const { courseId } = await body(c, templateUseSchema);
    const [t] = await deps.db
      .select()
      .from(schoolTemplates)
      .where(and(eq(schoolTemplates.id, param(c, 'tid')), eq(schoolTemplates.schoolId, param(c, 'id'))));
    if (!t) throw notFound();
    if (courseId) await staffCourse(deps, user, courseId);
    let result: { quizId?: string; assignmentId?: string };
    if (t.kind === 'quiz') {
      const p = t.payload as { description?: string; durationSec?: number; questions: QuizInput['questions'] };
      result = {
        quizId: await createQuiz(deps, user, {
          title: t.title,
          description: p.description,
          durationSec: p.durationSec,
          courseId: courseId ?? null,
          questions: p.questions,
        }),
      };
    } else {
      if (!courseId) throw badRequest('course_required');
      const p = t.payload as { description?: string; points?: number };
      const [a] = await deps.db
        .insert(assignments)
        .values({ courseId, title: t.title, description: p.description ?? '', points: p.points ?? 100, state: 'draft', createdBy: user.id })
        .returning({ id: assignments.id });
      result = { assignmentId: a!.id };
    }
    await deps.db
      .update(schoolTemplates)
      .set({ uses: sql`${schoolTemplates.uses} + 1` })
      .where(eq(schoolTemplates.id, t.id));
    return c.json(result, 201);
  })
  .delete('/:id/templates/:tid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const role = await schoolTeacher(deps, user, param(c, 'id'));
    const [t] = await deps.db
      .select()
      .from(schoolTemplates)
      .where(and(eq(schoolTemplates.id, param(c, 'tid')), eq(schoolTemplates.schoolId, param(c, 'id'))));
    if (!t) throw notFound();
    if (t.authorId !== user.id && role !== 'admin') throw forbidden();
    await deps.db.delete(schoolTemplates).where(eq(schoolTemplates.id, t.id));
    return c.json({ ok: true });
  });
