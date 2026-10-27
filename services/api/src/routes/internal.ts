import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { courses, groups, liveRooms, users } from '../db/schema';
import { canAccessLiveRoom, conversationAccess, courseRole, groupRole } from '../lib/access';
import type { AppEnv } from '../lib/context';
import { safeEqual } from '../lib/crypto';
import { AppError, badRequest } from '../lib/errors';
import { body, query } from '../lib/http';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Endpoints for the Go realtime hub only (never exposed through the public proxy).
 * Authorization logic lives here once, so the hub never duplicates membership rules.
 */
export const internalRoutes = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    const token = c.req.header('x-internal-token') ?? '';
    if (!safeEqual(token, c.get('deps').env.INTERNAL_TOKEN)) throw new AppError(401, 'unauthorized');
    await next();
  })
  .get('/authorize', async (c) => {
    const { db } = c.get('deps');
    const { uid, channel } = query(c, z.object({ uid: z.string().regex(uuid), channel: z.string().max(80) }));
    const [kind, id] = channel.split(':') as [string, string | undefined];
    if (kind === 'site') return c.json({ allowed: true });
    if (!id || !uuid.test(id)) throw badRequest('invalid_channel');
    let allowed = false;
    try {
      if (kind === 'user') allowed = id === uid;
      else if (kind === 'conv') allowed = !!(await conversationAccess(db, id, uid));
      else if (kind === 'group') {
        const [g] = await db.select().from(groups).where(eq(groups.id, id));
        allowed = !!g && !g.deletedAt && (g.privacy === 'public' || !!(await groupRole(db, id, uid)));
      } else if (kind === 'course') {
        const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, id));
        allowed = !!course && !!(await courseRole(db, id, uid));
      } else if (kind === 'live') {
        const [room] = await db.select().from(liveRooms).where(eq(liveRooms.id, id));
        allowed = !!room && room.status !== 'ended' && (await canAccessLiveRoom(db, room, uid));
      }
    } catch {
      allowed = false;
    }
    return c.json({ allowed });
  })
  .post('/presence', async (c) => {
    const { db } = c.get('deps');
    const input = await body(c, z.object({ uid: z.string().regex(uuid), online: z.boolean() }));
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(users.id, input.uid)));
    return c.json({ ok: true });
  });
