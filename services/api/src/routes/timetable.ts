import { timetableEntrySchema, type TimetableEntryDto } from '@qubedu/shared';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { courseMembers, courses, timetableEntries } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { isGuardian } from '../lib/minors';
import { z } from 'zod';
import { requireRole, STAFF } from './school';

const MAX_ROWS = 120;

/** Personal rows of `userId` plus the schedules of every class they belong to. */
async function timetableOf(deps: Deps, userId: string, viewerId: string): Promise<TimetableEntryDto[]> {
  const memberOf = deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, userId));
  const rows = await deps.db
    .select({ e: timetableEntries, courseTitle: courses.title })
    .from(timetableEntries)
    .leftJoin(courses, eq(courses.id, timetableEntries.courseId))
    .where(or(and(eq(timetableEntries.userId, userId), isNull(timetableEntries.courseId)), inArray(timetableEntries.courseId, memberOf)))
    .limit(MAX_ROWS * 2);
  return rows.map(({ e, courseTitle }) => ({
    id: e.id,
    day: e.day as TimetableEntryDto['day'],
    start: e.start,
    end: e.end,
    title: e.title,
    room: e.room,
    color: e.color,
    courseId: e.courseId,
    courseTitle: courseTitle ?? null,
    mine: e.userId === viewerId,
  }));
}

/** Weekly timetable (mounted at /me/timetable). Parents can read a linked child's with ?studentId=. */
export const timetableRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const { studentId } = query(c, z.object({ studentId: z.string().uuid().optional() }));
    if (studentId && studentId !== user.id) {
      if (!(await isGuardian(deps.db, user.id, studentId))) throw forbidden('not_guardian');
      return c.json({ items: await timetableOf(deps, studentId, user.id) });
    }
    return c.json({ items: await timetableOf(deps, user.id, user.id) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, timetableEntrySchema);
    if (input.courseId) await requireRole(deps, input.courseId, user, STAFF);
    const count = await deps.db.$count(timetableEntries, eq(timetableEntries.userId, user.id));
    if (count >= MAX_ROWS) throw badRequest('limit_reached');
    const [row] = await deps.db
      .insert(timetableEntries)
      .values({ ...input, color: input.color ?? null, courseId: input.courseId ?? null, userId: user.id })
      .returning();
    return c.json(
      (await timetableOf(deps, user.id, user.id)).find((x) => x.id === row!.id),
      201,
    );
  })
  .put('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, timetableEntrySchema);
    if (input.courseId) await requireRole(deps, input.courseId, user, STAFF);
    const [row] = await deps.db
      .update(timetableEntries)
      .set({ ...input, color: input.color ?? null, courseId: input.courseId ?? null })
      .where(and(eq(timetableEntries.id, param(c, 'id')), eq(timetableEntries.userId, user.id)))
      .returning();
    if (!row) throw notFound();
    return c.json((await timetableOf(deps, user.id, user.id)).find((x) => x.id === row.id));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(timetableEntries).where(and(eq(timetableEntries.id, param(c, 'id')), eq(timetableEntries.userId, user.id)));
    return c.json({ ok: true });
  });
