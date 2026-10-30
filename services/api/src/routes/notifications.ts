import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { paginationSchema, type NotificationDto, boolQuery } from '@qubedu/shared';
import { notifications, users } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, toSummary } from '../lib/mappers';

export const notificationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, paginationSchema.extend({ unread: boolQuery.optional() }));
    const cursor = decodeCursor(q.cursor);
    const rows = await db
      .select({
        n: notifications,
        actorId: users.id,
        actorDisplayName: users.displayName,
        actorUsername: users.username,
        actorAvatarUrl: users.avatarUrl,
        actorAccountType: users.accountType,
        actorTeacherVerifiedAt: users.teacherVerifiedAt,
        actorLevel: users.level,
        actorXp: users.xp,
        actorBadge: users.badge,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(
        and(
          eq(notifications.userId, user.id),
          q.unread ? isNull(notifications.readAt) : undefined,
          cursor ? sql`(${notifications.createdAt}, ${notifications.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.n.createdAt, id: r.n.id }));
    const items: NotificationDto[] = page.items.map((r) => ({
      id: r.n.id,
      type: r.n.type,
      title: r.n.title,
      body: r.n.body,
      icon: r.n.icon,
      link: r.n.link,
      actor: r.actorId ? toSummary(pickSummary('actor', r as unknown as Record<string, unknown>)) : null,
      data: r.n.data,
      read: !!r.n.readAt,
      createdAt: r.n.createdAt.getTime(),
    }));
    const [unread] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return c.json({ items, nextCursor: page.nextCursor, unread: unread?.n ?? 0 });
  })
  .post('/read', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const { ids } = await body(c, z.object({ ids: z.array(z.string().uuid()).max(200).optional() }));
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(notifications).where(and(eq(notifications.id, param(c, 'id')), eq(notifications.userId, user.id)));
    return c.json({ ok: true });
  })
  .delete('/', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(notifications).where(eq(notifications.userId, user.id));
    return c.json({ ok: true });
  });
