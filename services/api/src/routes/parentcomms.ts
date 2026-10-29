import { createTranslator, isLocale } from '@qubedu/i18n';
import {
  behaviorNoteSchema,
  homeworkAckSchema,
  meetingBookSchema,
  meetingSlotsSchema,
  type BehaviorNoteDto,
  type HomeworkAckItemDto,
  type MeetingSlotDto,
  type VoiceSummaryDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { assignments, behaviorNotes, courseMembers, courses, guardianLinks, homeworkAcks, meetingSlots, submissions, users } from '../db/schema';
import { courseRole } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { studentRisk } from '../lib/insights';
import { body, param, requireUser } from '../lib/http';
import { notify } from '../lib/notify';
import { whenFor } from '../lib/when';
import { messagePerson } from '../lib/parentMessages';
import { checkRate } from '../middleware';

const isTeacher = (u: AuthUser) => u.accountType === 'teacher';
const names = async (deps: Deps, ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = list.length ? await deps.db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, list)) : [];
  return new Map(rows.map((r) => [r.id, { id: r.id, displayName: r.displayName }]));
};

async function childrenOf(deps: Deps, parentId: string): Promise<string[]> {
  return (await deps.db.select({ id: guardianLinks.studentId }).from(guardianLinks).where(eq(guardianLinks.guardianId, parentId))).map((r) => r.id);
}

/* ───────── Parent–teacher meetings ───────── */

async function slotDtos(deps: Deps, rows: (typeof meetingSlots.$inferSelect)[], viewerId: string): Promise<MeetingSlotDto[]> {
  const who = await names(
    deps,
    rows.flatMap((r) => [r.teacherId, r.bookedBy, r.studentId]),
  );
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt.getTime(),
    endsAt: r.endsAt.getTime(),
    status: r.status,
    teacher: who.get(r.teacherId)!,
    booking:
      r.bookedBy && r.studentId && (viewerId === r.teacherId || viewerId === r.bookedBy)
        ? { parent: who.get(r.bookedBy)!, student: who.get(r.studentId)!, note: r.note }
        : null,
    mine: r.teacherId === viewerId || r.bookedBy === viewerId,
  }));
}

export const meetingRoutes = new Hono<AppEnv>()
  /** A teacher opens a window (e.g. 16:00–18:00); it is cut into slots of the chosen length. */
  .post('/slots', async (c) => {
    const user = requireUser(c);
    if (!isTeacher(user)) throw forbidden('teachers_only');
    await checkRate(c, { bucket: 'meeting-slots', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, meetingSlotsSchema);
    const step = input.slotMinutes * 60_000;
    const rows: { teacherId: string; startsAt: Date; endsAt: Date }[] = [];
    for (let t = input.startsAt; t + step <= input.endsAt; t += step) rows.push({ teacherId: user.id, startsAt: new Date(t), endsAt: new Date(t + step) });
    if (!rows.length) throw badRequest('invalid_window');
    // Never double-publish the same time.
    const existing = await deps.db
      .select({ s: meetingSlots.startsAt })
      .from(meetingSlots)
      .where(
        and(
          eq(meetingSlots.teacherId, user.id),
          gte(meetingSlots.startsAt, new Date(input.startsAt)),
          lt(meetingSlots.startsAt, new Date(input.endsAt)),
          sql`${meetingSlots.status} <> 'cancelled'`,
        ),
      );
    const taken = new Set(existing.map((e) => e.s.getTime()));
    const fresh = rows.filter((r) => !taken.has(r.startsAt.getTime()));
    if (fresh.length) await deps.db.insert(meetingSlots).values(fresh);
    return c.json({ created: fresh.length }, 201);
  })
  /** The teacher's own slots (with bookings), or a parent's bookings. */
  .get('/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const from = new Date(Date.now() - 3_600_000);
    const rows = await deps.db
      .select()
      .from(meetingSlots)
      .where(
        and(
          gte(meetingSlots.startsAt, from),
          isTeacher(user) ? eq(meetingSlots.teacherId, user.id) : and(eq(meetingSlots.bookedBy, user.id), eq(meetingSlots.status, 'booked')),
        ),
      )
      .orderBy(asc(meetingSlots.startsAt))
      .limit(200);
    return c.json({ items: await slotDtos(deps, rows, user.id) });
  })
  /** For a parent: the teachers of their children and each teacher's free slots. */
  .get('/teachers', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const kids = await childrenOf(deps, user.id);
    if (!kids.length) return c.json({ items: [] });
    const rows = await deps.db
      .select({ teacherId: courseMembers.userId, courseTitle: courses.title, studentId: sql<string>`kid.user_id` })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .innerJoin(
        sql`course_members kid`,
        sql`kid.course_id = ${courseMembers.courseId} and kid.role = 'student' and kid.user_id in (${sql.join(
          kids.map((k) => sql`${k}::uuid`),
          sql`, `,
        )})`,
      )
      .where(and(eq(courseMembers.role, 'teacher'), eq(courses.archived, false)));
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const who = await names(deps, [...teacherIds, ...rows.map((r) => r.studentId)]);
    const slots = teacherIds.length
      ? await deps.db
          .select()
          .from(meetingSlots)
          .where(
            and(inArray(meetingSlots.teacherId, teacherIds), eq(meetingSlots.status, 'open'), gte(meetingSlots.startsAt, new Date(Date.now() + 3_600_000))),
          )
          .orderBy(asc(meetingSlots.startsAt))
          .limit(300)
      : [];
    const items = await Promise.all(
      teacherIds.map(async (tid) => ({
        teacher: who.get(tid)!,
        children: [...new Map(rows.filter((r) => r.teacherId === tid).map((r) => [r.studentId, who.get(r.studentId)!])).values()],
        courses: [...new Set(rows.filter((r) => r.teacherId === tid).map((r) => r.courseTitle))],
        slots: await slotDtos(
          deps,
          slots.filter((s) => s.teacherId === tid),
          user.id,
        ),
      })),
    );
    return c.json({ items });
  })
  .post('/slots/:id/book', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'meeting-book', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { studentId, note } = await body(c, meetingBookSchema);
    if (!(await childrenOf(deps, user.id)).includes(studentId)) throw forbidden('not_your_child');
    const [slot] = await deps.db
      .select()
      .from(meetingSlots)
      .where(eq(meetingSlots.id, param(c, 'id')));
    if (!slot) throw notFound();
    // The teacher must actually teach this child.
    const role = await courseRole(
      deps.db,
      (
        await deps.db
          .select({ c: courseMembers.courseId })
          .from(courseMembers)
          .where(
            and(
              eq(courseMembers.userId, slot.teacherId),
              eq(courseMembers.role, 'teacher'),
              inArray(
                courseMembers.courseId,
                deps.db
                  .select({ c: courseMembers.courseId })
                  .from(courseMembers)
                  .where(and(eq(courseMembers.userId, studentId), eq(courseMembers.role, 'student'))),
              ),
            ),
          )
          .limit(1)
      )[0]?.c ?? '00000000-0000-0000-0000-000000000000',
      slot.teacherId,
    );
    if (role !== 'teacher') throw forbidden('not_their_teacher');
    const [won] = await deps.db
      .update(meetingSlots)
      .set({ status: 'booked', bookedBy: user.id, studentId, note })
      .where(and(eq(meetingSlots.id, slot.id), eq(meetingSlots.status, 'open'), gte(meetingSlots.startsAt, new Date())))
      .returning();
    if (!won) throw conflict('slot_taken');
    const who = await names(deps, [studentId]);
    await notify(deps, {
      userId: slot.teacherId,
      actorId: user.id,
      type: 'meeting_booked',
      icon: 'calendar-clock',
      link: '/meetings',
      data: { name: user.displayName, student: who.get(studentId)?.displayName ?? '', when: await whenFor(deps, slot.teacherId, slot.startsAt) },
      pref: 'school',
    });
    return c.json((await slotDtos(deps, [won], user.id))[0]);
  })
  /** The parent frees a booked slot, or the teacher cancels a slot (the parent is told). */
  .post('/slots/:id/cancel', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [slot] = await deps.db
      .select()
      .from(meetingSlots)
      .where(eq(meetingSlots.id, param(c, 'id')));
    if (!slot || (slot.teacherId !== user.id && slot.bookedBy !== user.id)) throw notFound();
    if (slot.status === 'cancelled') return c.json({ ok: true });
    if (slot.teacherId === user.id) {
      await deps.db.update(meetingSlots).set({ status: 'cancelled' }).where(eq(meetingSlots.id, slot.id));
      if (slot.bookedBy)
        await notify(deps, {
          userId: slot.bookedBy,
          actorId: user.id,
          type: 'meeting_cancelled',
          icon: 'calendar-x',
          link: '/meetings',
          data: { name: user.displayName, when: await whenFor(deps, slot.bookedBy, slot.startsAt) },
          pref: 'school',
        });
    } else {
      await deps.db
        .update(meetingSlots)
        .set({ status: 'open', bookedBy: null, studentId: null, note: '', remindedDayAt: null, remindedHourAt: null })
        .where(eq(meetingSlots.id, slot.id));
      await notify(deps, {
        userId: slot.teacherId,
        actorId: user.id,
        type: 'meeting_cancelled',
        icon: 'calendar-x',
        link: '/meetings',
        data: { name: user.displayName, when: await whenFor(deps, slot.teacherId, slot.startsAt) },
        pref: 'school',
      });
    }
    return c.json({ ok: true });
  });

/* ───────── Behavior log ───────── */

export const behaviorRoutes = new Hono<AppEnv>()
  .post('/', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'behavior-note', limit: 100, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, behaviorNoteSchema);
    const role = await courseRole(deps.db, input.courseId, user.id);
    if (role !== 'teacher' && role !== 'assistant') throw forbidden('course_staff_only');
    const [member] = await deps.db
      .select({ role: courseMembers.role })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, input.courseId), eq(courseMembers.userId, input.studentId)));
    if (member?.role !== 'student') throw badRequest('not_a_student');
    const [row] = await deps.db
      .insert(behaviorNotes)
      .values({ ...input, teacherId: user.id })
      .returning();
    const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, input.courseId));
    const parents = await childrenParents(deps, input.studentId);
    const data = { name: user.displayName, course: course?.title ?? '', kind: input.kind };
    await notify(
      deps,
      [input.studentId, ...parents].map((userId) => ({
        userId,
        actorId: user.id,
        type: 'behavior_note',
        icon: input.kind === 'positive' ? 'smile' : 'meh',
        link: userId === input.studentId ? '/grades' : '/family',
        data,
        pref: 'school' as const,
      })),
    );
    if (input.kind === 'concern') {
      const [child] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, input.studentId));
      const link = `${deps.env.APP_URL.replace(/\/$/, '')}/family`;
      for (const p of parents)
        await messagePerson(deps, p, { kind: 'alert', key: 'behavior_concern', vars: { name: child?.name ?? '', course: course?.title ?? '', link } }).catch(
          () => false,
        );
    }
    return c.json({ id: row!.id }, 201);
  })
  /** Notes about me (student) or my children (parent); a teacher sees the ones they wrote. */
  .get('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const kids = await childrenOf(deps, user.id);
    const where = isTeacher(user) ? eq(behaviorNotes.teacherId, user.id) : inArray(behaviorNotes.studentId, [user.id, ...kids]);
    const rows = await deps.db
      .select({ n: behaviorNotes, courseTitle: courses.title })
      .from(behaviorNotes)
      .innerJoin(courses, eq(courses.id, behaviorNotes.courseId))
      .where(where)
      .orderBy(desc(behaviorNotes.createdAt))
      .limit(60);
    const who = await names(
      deps,
      rows.flatMap((r) => [r.n.studentId, r.n.teacherId]),
    );
    const items: BehaviorNoteDto[] = rows.map((r) => ({
      id: r.n.id,
      kind: r.n.kind,
      text: r.n.text,
      courseTitle: r.courseTitle,
      teacherName: who.get(r.n.teacherId ?? '')?.displayName ?? null,
      student: who.get(r.n.studentId)!,
      createdAt: r.n.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await deps.db.delete(behaviorNotes).where(and(eq(behaviorNotes.id, param(c, 'id')), eq(behaviorNotes.teacherId, user.id)));
    return c.json({ ok: true });
  });

async function childrenParents(deps: Deps, studentId: string): Promise<string[]> {
  return (await deps.db.select({ id: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, studentId))).map((r) => r.id);
}

/* ───────── Homework acknowledgement and the spoken weekly summary ───────── */

export const parentRoutes = new Hono<AppEnv>()
  /** Homework of my children that is due soon or not handed in yet, with whether I already said "I saw it". */
  .get('/homework', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const kids = await childrenOf(deps, user.id);
    if (!kids.length) return c.json({ items: [] });
    const rows = await deps.db
      .select({ a: assignments, courseTitle: courses.title, studentId: courseMembers.userId, sub: submissions })
      .from(courseMembers)
      .innerJoin(courses, eq(courses.id, courseMembers.courseId))
      .innerJoin(assignments, eq(assignments.courseId, courseMembers.courseId))
      .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, courseMembers.userId)))
      .where(
        and(
          inArray(courseMembers.userId, kids),
          eq(courseMembers.role, 'student'),
          eq(assignments.state, 'published'),
          or(isNull(assignments.releaseAt), sql`${assignments.releaseAt} <= now()`),
          or(isNull(assignments.dueAt), gte(assignments.dueAt, new Date(Date.now() - 7 * 86_400_000))),
        ),
      )
      .orderBy(asc(assignments.dueAt))
      .limit(100);
    const acks = rows.length
      ? await deps.db
          .select()
          .from(homeworkAcks)
          .where(
            and(
              eq(homeworkAcks.guardianId, user.id),
              inArray(
                homeworkAcks.assignmentId,
                rows.map((r) => r.a.id),
              ),
            ),
          )
      : [];
    const acked = new Set(acks.map((a) => `${a.assignmentId}:${a.studentId}`));
    const who = await names(
      deps,
      rows.map((r) => r.studentId),
    );
    const items: HomeworkAckItemDto[] = rows.map((r) => {
      const due = r.a.dueAt?.getTime() ?? null;
      const status: HomeworkAckItemDto['status'] =
        r.sub?.grade != null ? 'graded' : r.sub ? 'submitted' : due !== null && due < Date.now() ? 'missing' : 'upcoming';
      return {
        assignmentId: r.a.id,
        title: r.a.title,
        courseTitle: r.courseTitle,
        student: who.get(r.studentId)!,
        dueAt: due,
        status,
        acked: acked.has(`${r.a.id}:${r.studentId}`),
      };
    });
    return c.json({ items });
  })
  .post('/homework/:assignmentId/ack', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const { studentId } = await body(c, homeworkAckSchema);
    if (!(await childrenOf(deps, user.id)).includes(studentId)) throw forbidden('not_your_child');
    const [a] = await deps.db
      .select({ id: assignments.id, courseId: assignments.courseId })
      .from(assignments)
      .where(eq(assignments.id, param(c, 'assignmentId')));
    if (!a) throw notFound();
    const [m] = await deps.db
      .select({ r: courseMembers.role })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, a.courseId), eq(courseMembers.userId, studentId), eq(courseMembers.role, 'student')));
    if (!m) throw notFound();
    await deps.db.insert(homeworkAcks).values({ assignmentId: a.id, studentId, guardianId: user.id }).onConflictDoNothing();
    return c.json({ ok: true });
  })
  /** Teachers: which students' parents said they saw this assignment. */
  .get('/homework/:assignmentId/acks', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [a] = await deps.db
      .select({ id: assignments.id, courseId: assignments.courseId })
      .from(assignments)
      .where(eq(assignments.id, param(c, 'assignmentId')));
    if (!a) throw notFound();
    const role = await courseRole(deps.db, a.courseId, user.id);
    if (role !== 'teacher' && role !== 'assistant') throw forbidden('course_staff_only');
    const students = await deps.db
      .select({ id: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, a.courseId), eq(courseMembers.role, 'student')));
    const acks = await deps.db.select({ s: homeworkAcks.studentId }).from(homeworkAcks).where(eq(homeworkAcks.assignmentId, a.id));
    const seen = new Set(acks.map((x) => x.s));
    const who = await names(
      deps,
      students.map((s) => s.id),
    );
    return c.json({ items: students.map((s) => ({ student: who.get(s.id)!, acked: seen.has(s.id) })), acked: seen.size, total: students.length });
  })
  /** A short text for the week, in the parent's language, for the phone to read aloud. */
  .get('/summary', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const kids = await childrenOf(deps, user.id);
    const studentId = c.req.query('studentId') ?? kids[0];
    if (!studentId || !kids.includes(studentId)) throw forbidden('not_your_child');
    const [me] = await deps.db.select({ appearance: users.appearance }).from(users).where(eq(users.id, user.id));
    const [child] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, studentId));
    const l = (me?.appearance as { language?: string } | undefined)?.language;
    const language = isLocale(l) ? l : 'ar';
    const tr = createTranslator(language);
    const { signals, risk } = await studentRisk(deps.db, studentId);
    const first = (child?.name ?? '').split(' ')[0] ?? '';
    const parts = [
      tr.t('parentComms.summary.intro', { name: first }),
      tr.t('parentComms.summary.study', { name: first, minutes: signals.minutesThisWeek }),
      signals.quizAvg !== null ? tr.t('parentComms.summary.quiz', { avg: signals.quizAvg }) : '',
      signals.missing > 0 ? tr.t('parentComms.summary.missing', { count: signals.missing }) : tr.t('parentComms.summary.noMissing'),
      signals.absences30 > 0 ? tr.t('parentComms.summary.absences', { count: signals.absences30 }) : '',
      tr.t(`parentComms.summary.close_${risk.level}` as 'parentComms.summary.close_ok', { name: first }),
    ].filter(Boolean);
    const dto: VoiceSummaryDto = { text: parts.join(' '), language };
    return c.json(dto);
  });
