import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { canModerateGroup, hasPermission, liveRoomInputSchema, scheduledClassSchema, type LiveRoomDto, type ScheduledClassDto } from '@qubedu/shared';
import { conversations, courseMembers, groupMembers, liveRooms, scheduledClasses, users } from '../db/schema';
import { canAccessLiveRoom, canModerateLiveRoom, courseRole, groupRole, loadGroup } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms, pickSummary, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { ch } from '../lib/realtime';
import { checkRate } from '../middleware';

const hostCols = {
  hostId: users.id,
  hostDisplayName: users.displayName,
  hostUsername: users.username,
  hostAvatarUrl: users.avatarUrl,
  hostAccountType: users.accountType,
  hostLevel: users.level,
  hostXp: users.xp,
  hostBadge: users.badge,
};

function iceServers(deps: Deps): LiveRoomDto['iceServers'] {
  const list: LiveRoomDto['iceServers'] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (deps.env.TURN_URLS) {
    list.push({ urls: deps.env.TURN_URLS.split(',').map((u) => u.trim()), username: deps.env.TURN_USERNAME, credential: deps.env.TURN_CREDENTIAL });
  }
  return list;
}

type RoomRow = typeof liveRooms.$inferSelect;

async function toDto(deps: Deps, viewer: AuthUser, room: RoomRow & Record<string, unknown>): Promise<LiveRoomDto> {
  return {
    id: room.id,
    title: room.title,
    scopeType: room.scopeType,
    scopeId: room.scopeId,
    host: toSummary(pickSummary('host', room)),
    status: room.status,
    scheduledAt: ms(room.scheduledAt),
    startedAt: ms(room.startedAt),
    endedAt: ms(room.endedAt),
    settings: room.settings as LiveRoomDto['settings'],
    conversationId: room.conversationId,
    isHost: room.hostId === viewer.id,
    canModerate: await canModerateLiveRoom(deps.db, room, viewer.id),
    iceServers: iceServers(deps),
  };
}

async function loadRoom(deps: Deps, id: string) {
  const [row] = await deps.db
    .select({ r: liveRooms, ...hostCols })
    .from(liveRooms)
    .innerJoin(users, eq(users.id, liveRooms.hostId))
    .where(eq(liveRooms.id, id));
  if (!row) throw notFound('room_not_found');
  return { ...row.r, ...row } as RoomRow & Record<string, unknown>;
}

async function canCreateIn(deps: Deps, viewer: AuthUser, scopeType: string, scopeId: string | null | undefined) {
  if (hasPermission(viewer.role, viewer.permissions, 'classes.manage')) return true;
  if (scopeType === 'open') return viewer.accountType === 'teacher';
  if (!scopeId) return false;
  if (scopeType === 'course') {
    const r = await courseRole(deps.db, scopeId, viewer.id);
    return r === 'teacher' || r === 'assistant';
  }
  await loadGroup(deps.db, scopeId);
  return canModerateGroup(await groupRole(deps.db, scopeId, viewer.id));
}

async function scopeMemberIds(deps: Deps, room: RoomRow): Promise<string[]> {
  if (!room.scopeId) return [];
  if (room.scopeType === 'course') {
    return (await deps.db.select({ id: courseMembers.userId }).from(courseMembers).where(eq(courseMembers.courseId, room.scopeId))).map((r) => r.id);
  }
  return (await deps.db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, room.scopeId))).map((r) => r.id);
}

const moderateSchema = z.object({
  action: z.enum(['mute', 'camera-off', 'stop-screen', 'lower-hand', 'remove', 'lower-all-hands', 'mute-all']),
  targetUserId: z.string().uuid().optional(),
});

export const liveRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, z.object({ scopeType: z.enum(['group', 'community', 'course', 'open']).optional(), scopeId: z.string().uuid().optional() }));
    if (q.scopeId) {
      const isCourse = q.scopeType === 'course';
      const ok = isCourse ? await courseRole(deps.db, q.scopeId, viewer.id) : await groupRole(deps.db, q.scopeId, viewer.id);
      if (!ok && !hasPermission(viewer.role, viewer.permissions, 'classes.manage')) throw forbidden('not_a_member');
    }
    const memberScopes = or(
      eq(liveRooms.scopeType, 'open'),
      eq(liveRooms.hostId, viewer.id),
      inArray(liveRooms.scopeId, deps.db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewer.id))),
      inArray(liveRooms.scopeId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, viewer.id))),
    );
    const rows = await deps.db
      .select({ r: liveRooms, ...hostCols })
      .from(liveRooms)
      .innerJoin(users, eq(users.id, liveRooms.hostId))
      .where(
        and(
          q.scopeId ? eq(liveRooms.scopeId, q.scopeId) : memberScopes,
          or(sql`${liveRooms.status} <> 'ended'`, gte(liveRooms.endedAt, new Date(Date.now() - 7 * 86400_000))),
        ),
      )
      .orderBy(sql`case ${liveRooms.status} when 'live' then 0 when 'scheduled' then 1 else 2 end`, asc(liveRooms.scheduledAt), desc(liveRooms.createdAt))
      .limit(100);
    return c.json({ items: await Promise.all(rows.map((r) => toDto(deps, viewer, { ...r.r, ...r } as RoomRow & Record<string, unknown>))) });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'live-create', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, liveRoomInputSchema);
    if (input.scopeType !== 'open' && !input.scopeId) throw badRequest('scope_required');
    if (!(await canCreateIn(deps, viewer, input.scopeType, input.scopeId))) throw forbidden('cannot_create_room');
    const id = await deps.db.transaction(async (tx) => {
      const [conv] = await tx.insert(conversations).values({ kind: 'live', title: input.title }).returning({ id: conversations.id });
      const [room] = await tx
        .insert(liveRooms)
        .values({
          title: input.title,
          scopeType: input.scopeType,
          scopeId: input.scopeType === 'open' ? null : input.scopeId!,
          hostId: viewer.id,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          settings: input.settings,
          conversationId: conv!.id,
        })
        .returning({ id: liveRooms.id });
      return room!.id;
    });
    const room = await loadRoom(deps, id);
    if (room.scheduledAt) {
      const members = (await scopeMemberIds(deps, room)).filter((m) => m !== viewer.id);
      await notify(
        deps,
        members.map((m) => ({
          userId: m,
          type: 'live_scheduled',
          icon: 'calendar-clock',
          actorId: viewer.id,
          link: `/live/${id}`,
          data: { title: room.title, startAt: ms(room.scheduledAt) },
          pref: 'live' as const,
        })),
      );
    }
    return c.json(await toDto(deps, viewer, room), 201);
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canAccessLiveRoom(deps.db, room, viewer.id))) throw forbidden('room_forbidden');
    return c.json(await toDto(deps, viewer, room));
  })
  .post('/:id/start', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    if (room.status === 'live') return c.json(await toDto(deps, viewer, room));
    await deps.db.update(liveRooms).set({ status: 'live', startedAt: new Date(), endedAt: null }).where(eq(liveRooms.id, room.id));
    const updated = await loadRoom(deps, room.id);
    await deps.realtime.publish(ch.live(room.id), 'room:status', { status: 'live' });
    const members = (await scopeMemberIds(deps, room)).filter((m) => m !== viewer.id);
    await notify(
      deps,
      members.map((m) => ({
        userId: m,
        type: 'live_started',
        icon: 'radio',
        actorId: viewer.id,
        link: `/live/${room.id}`,
        data: { title: room.title },
        pref: 'live' as const,
      })),
    );
    return c.json(await toDto(deps, viewer, updated));
  })
  .post('/:id/end', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    await deps.db.update(liveRooms).set({ status: 'ended', endedAt: new Date() }).where(eq(liveRooms.id, room.id));
    await deps.realtime.publish(ch.live(room.id), 'room:status', { status: 'ended' });
    return c.json(await toDto(deps, viewer, await loadRoom(deps, room.id)));
  })
  .put('/:id/settings', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const settings = await body(c, liveRoomInputSchema.shape.settings);
    await deps.db.update(liveRooms).set({ settings }).where(eq(liveRooms.id, room.id));
    await deps.realtime.publish(ch.live(room.id), 'room:settings', settings);
    return c.json({ settings });
  })
  .post('/:id/moderate', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const input = await body(c, moderateSchema);
    if (!input.action.endsWith('-all') && !input.targetUserId) throw badRequest('target_required');
    await deps.realtime.publish(ch.live(room.id), 'room:moderate', { ...input, by: viewer.id });
    return c.json({ ok: true });
  })
  .get('/:id/whiteboard', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canAccessLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    return c.json({ strokes: room.whiteboard });
  })
  .put('/:id/whiteboard', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const { strokes } = await body(c, z.object({ strokes: z.array(z.unknown()).max(5000) }));
    if (JSON.stringify(strokes).length > 2_000_000) throw badRequest('whiteboard_too_large');
    await deps.db.update(liveRooms).set({ whiteboard: strokes }).where(eq(liveRooms.id, room.id));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (room.hostId !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'classes.manage')) throw forbidden();
    await deps.db.delete(liveRooms).where(eq(liveRooms.id, room.id));
    if (room.conversationId) await deps.db.delete(conversations).where(eq(conversations.id, room.conversationId));
    return c.json({ ok: true });
  });

const toClass = (r: typeof scheduledClasses.$inferSelect & Record<string, unknown>): ScheduledClassDto => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  description: r.description,
  link: r.link,
  startsAt: ms(r.startsAt),
  createdBy: r.hostId ? toSummary(pickSummary('host', r)) : null,
  createdAt: r.createdAt.getTime(),
});

export const classRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    requireUser(c);
    const { db } = c.get('deps');
    const rows = await db
      .select({ k: scheduledClasses, ...hostCols })
      .from(scheduledClasses)
      .leftJoin(users, eq(users.id, scheduledClasses.createdBy))
      .where(
        and(isNull(scheduledClasses.deletedAt), or(isNull(scheduledClasses.startsAt), gte(scheduledClasses.startsAt, new Date(Date.now() - 3 * 3600_000)))),
      )
      .orderBy(asc(sql`coalesce(${scheduledClasses.startsAt}, 'infinity'::timestamptz)`))
      .limit(100);
    return c.json({ items: rows.map((r) => toClass({ ...r.k, ...r } as typeof scheduledClasses.$inferSelect & Record<string, unknown>)) });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    if (viewer.accountType !== 'teacher' && !hasPermission(viewer.role, viewer.permissions, 'classes.manage')) throw forbidden('teachers_only');
    const input = await body(c, scheduledClassSchema);
    const [row] = await db
      .insert(scheduledClasses)
      .values({ ...input, startsAt: input.startsAt ? new Date(input.startsAt) : null, createdBy: viewer.id })
      .returning({ id: scheduledClasses.id });
    return c.json({ id: row!.id }, 201);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const [row] = await db
      .select()
      .from(scheduledClasses)
      .where(eq(scheduledClasses.id, param(c, 'id')));
    if (!row) throw notFound();
    if (row.createdBy !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'classes.manage')) throw forbidden();
    await db.update(scheduledClasses).set({ deletedAt: new Date() }).where(eq(scheduledClasses.id, row.id));
    return c.json({ ok: true });
  });
