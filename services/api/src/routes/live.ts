import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  breakoutsSchema,
  canModerateGroup,
  hasPermission,
  liveBroadcastSchema,
  livePollSchema,
  livePollVoteSchema,
  liveRoomInputSchema,
  scheduledClassSchema,
  shuffleWith,
  seededRandom,
  type LiveAttendanceDto,
  type LivePollDto,
  type LiveRoomDto,
  type ScheduledClassDto,
} from '@qubedu/shared';
import {
  attendanceRecords,
  attendanceSessions,
  conversations,
  courseMembers,
  groupMembers,
  liveAttendance,
  livePollVotes,
  livePolls,
  liveRooms,
  privateLessons,
  scheduledClasses,
  users,
} from '../db/schema';
import { alertParents } from '../lib/parentMessages';
import { summaryColumns } from '../lib/mappers';
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
  hostTeacherVerifiedAt: users.teacherVerifiedAt,
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
    parentId: room.parentId,
    breakoutName: room.breakoutName,
    breakouts: room.breakouts ?? [],
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
  // Open public classes need a verified teacher (class and group rooms only need a role there).
  if (scopeType === 'open') return viewer.verifiedTeacher;
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

async function pollCounts(deps: Deps, pollId: string, n: number): Promise<number[]> {
  const rows = await deps.db
    .select({ choice: livePollVotes.choice, n: sql<number>`count(*)::int` })
    .from(livePollVotes)
    .where(eq(livePollVotes.pollId, pollId))
    .groupBy(livePollVotes.choice);
  const counts = Array.from({ length: n }, () => 0);
  for (const r of rows) if (r.choice < n) counts[r.choice] = r.n;
  return counts;
}

async function pollDtos(deps: Deps, rows: (typeof livePolls.$inferSelect)[], viewerId: string | null, moderator: boolean): Promise<LivePollDto[]> {
  const out: LivePollDto[] = [];
  for (const p of rows) {
    const counts = await pollCounts(deps, p.id, p.options.length);
    const [mine] = viewerId
      ? await deps.db
          .select({ choice: livePollVotes.choice })
          .from(livePollVotes)
          .where(and(eq(livePollVotes.pollId, p.id), eq(livePollVotes.userId, viewerId)))
      : [];
    const show = moderator || p.status === 'closed';
    out.push({
      id: p.id,
      question: p.question,
      options: p.options,
      status: p.status,
      correct: show ? p.correct : null,
      counts: show ? counts : null,
      total: counts.reduce((a, b) => a + b, 0),
      myChoice: mine?.choice ?? null,
      createdAt: p.createdAt.getTime(),
    });
  }
  return out;
}

/** Ends the main room's breakout rooms and sends everyone back. */
async function closeBreakouts(deps: Deps, main: RoomRow) {
  const open = main.breakouts ?? [];
  const children = await deps.db
    .select({ id: liveRooms.id })
    .from(liveRooms)
    .where(and(eq(liveRooms.parentId, main.id), sql`${liveRooms.status} <> 'ended'`));
  if (!open.length && !children.length) return;
  await deps.db
    .update(liveRooms)
    .set({ status: 'ended', endedAt: new Date() })
    .where(and(eq(liveRooms.parentId, main.id), sql`${liveRooms.status} <> 'ended'`));
  await deps.db.update(liveRooms).set({ breakouts: [] }).where(eq(liveRooms.id, main.id));
  for (const ch2 of children) await deps.realtime.publish(ch.live(ch2.id), 'room:breakouts-closed', { mainId: main.id });
  await deps.realtime.publish(ch.live(main.id), 'room:breakouts', { rooms: [] });
}

/**
 * When a class's live lesson ends, its register is filled in: present (stayed at least half the lesson, up to 10
 * minutes), late (arrived more than 10 minutes in), absent (never came or left almost at once). Teachers can correct it.
 */
async function recordAttendance(deps: Deps, room: RoomRow) {
  if (room.scopeType !== 'course' || !room.scopeId || !room.startedAt || room.attendanceSessionId) return;
  const started = room.startedAt.getTime();
  const durationSec = Math.max(60, Math.round(((room.endedAt?.getTime() ?? Date.now()) - started) / 1000));
  const need = Math.min(600, Math.max(60, durationSec / 2));
  const students = (
    await deps.db
      .select({ id: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, room.scopeId), eq(courseMembers.role, 'student')))
  ).map((r) => r.id);
  if (!students.length) return;
  const seen = new Map((await deps.db.select().from(liveAttendance).where(eq(liveAttendance.roomId, room.id))).map((a) => [a.userId, a]));
  const day = new Date(started).toISOString().slice(0, 10);
  const [session] = await deps.db
    .insert(attendanceSessions)
    .values({ courseId: room.scopeId, title: room.title, day })
    .returning({ id: attendanceSessions.id });
  const records = students.map((id) => {
    const a = seen.get(id);
    const status: 'present' | 'late' | 'absent' = !a || a.seconds < need ? 'absent' : a.firstAt.getTime() - started > 10 * 60_000 ? 'late' : 'present';
    return { sessionId: session!.id, studentId: id, status };
  });
  await deps.db.insert(attendanceRecords).values(records).onConflictDoNothing();
  await deps.db.update(liveRooms).set({ attendanceSessionId: session!.id }).where(eq(liveRooms.id, room.id));
  for (const r of records.filter((x) => x.status === 'absent'))
    await alertParents(deps, r.studentId, { type: 'child_absent', data: { course: room.title, day }, link: `/family?child=${r.studentId}` }).catch((err) =>
      deps.log.warn({ err }, 'absence alert failed'),
    );
}

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
      // Open rooms with a scope id are paid private lessons: only their two people see them.
      and(eq(liveRooms.scopeType, 'open'), isNull(liveRooms.scopeId)),
      eq(liveRooms.hostId, viewer.id),
      inArray(
        liveRooms.id,
        deps.db
          .select({ id: privateLessons.roomId })
          .from(privateLessons)
          .where(and(eq(privateLessons.studentId, viewer.id), isNotNull(privateLessons.roomId))),
      ),
      inArray(liveRooms.scopeId, deps.db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewer.id))),
      inArray(liveRooms.scopeId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, viewer.id))),
    );
    const rows = await deps.db
      .select({ r: liveRooms, ...hostCols })
      .from(liveRooms)
      .innerJoin(users, eq(users.id, liveRooms.hostId))
      .where(
        and(
          isNull(liveRooms.parentId),
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
    if (!room.parentId) {
      await closeBreakouts(deps, room);
      if (room.status === 'live') await recordAttendance(deps, await loadRoom(deps, room.id));
    }
    return c.json(await toDto(deps, viewer, await loadRoom(deps, room.id)));
  })
  /** Small groups: each group gets its own breakout room; everyone in a group is moved there. */
  .post('/:id/breakouts', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (room.parentId || room.status !== 'live') throw badRequest('not_a_main_room');
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const input = await body(c, breakoutsSchema);
    await closeBreakouts(deps, room);
    // Only people who may be in this room can be placed in a group.
    const allowed = [];
    for (const uid of [...new Set(input.participants)]) if (uid !== viewer.id && (await canAccessLiveRoom(deps.db, room, uid))) allowed.push(uid);
    const order = shuffleWith(allowed, seededRandom(`${room.id}:${Date.now()}`));
    const members: string[][] = Array.from({ length: input.groups }, () => []);
    order.forEach((uid, i) => members[input.assignments?.[uid] ?? i % input.groups]!.push(uid));
    const settings = { ...(room.settings as Record<string, boolean>), allowStudentCamera: true, allowStudentMic: true, allowChat: true };
    const groups: { id: string; name: string; members: string[] }[] = [];
    for (const [i, m] of members.entries()) {
      if (!m.length) continue;
      const name = `${i + 1}`;
      const [conv] = await deps.db
        .insert(conversations)
        .values({ kind: 'live', title: `${room.title} · ${name}` })
        .returning({ id: conversations.id });
      const [child] = await deps.db
        .insert(liveRooms)
        .values({
          title: room.title,
          scopeType: room.scopeType,
          scopeId: room.scopeId,
          hostId: room.hostId,
          status: 'live',
          startedAt: new Date(),
          settings,
          conversationId: conv!.id,
          parentId: room.id,
          breakoutName: name,
        })
        .returning({ id: liveRooms.id });
      groups.push({ id: child!.id, name, members: m });
    }
    await deps.db.update(liveRooms).set({ breakouts: groups }).where(eq(liveRooms.id, room.id));
    await deps.realtime.publish(ch.live(room.id), 'room:breakouts', { rooms: groups });
    return c.json({ rooms: groups });
  })
  .post('/:id/breakouts/close', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    const main = room.parentId ? await loadRoom(deps, room.parentId) : room;
    if (!(await canModerateLiveRoom(deps.db, main, viewer.id))) throw forbidden();
    await closeBreakouts(deps, main);
    return c.json({ ok: true });
  })
  /** A message to everyone, in the main room and every breakout room. */
  .post('/:id/broadcast', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    const main = room.parentId ? await loadRoom(deps, room.parentId) : room;
    if (!(await canModerateLiveRoom(deps.db, main, viewer.id))) throw forbidden();
    const { text } = await body(c, liveBroadcastSchema);
    const payload = { text, from: viewer.displayName };
    for (const id of [main.id, ...(main.breakouts ?? []).map((b) => b.id)]) await deps.realtime.publish(ch.live(id), 'room:broadcast', payload);
    return c.json({ ok: true });
  })
  /* polls and quick quiz questions */
  .get('/:id/polls', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canAccessLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const mod = await canModerateLiveRoom(deps.db, room, viewer.id);
    const rows = await deps.db.select().from(livePolls).where(eq(livePolls.roomId, room.id)).orderBy(desc(livePolls.createdAt)).limit(50);
    return c.json({ items: await pollDtos(deps, rows, viewer.id, mod) });
  })
  .post('/:id/polls', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'live-poll', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const input = await body(c, livePollSchema);
    if (input.correct !== null && input.correct !== undefined && input.correct >= input.options.length) throw badRequest('invalid_correct');
    // One open question at a time.
    await deps.db
      .update(livePolls)
      .set({ status: 'closed', closedAt: new Date() })
      .where(and(eq(livePolls.roomId, room.id), eq(livePolls.status, 'open')));
    const [p] = await deps.db
      .insert(livePolls)
      .values({ roomId: room.id, createdBy: viewer.id, question: input.question, options: input.options, correct: input.correct ?? null })
      .returning();
    const [studentView] = await pollDtos(deps, [p!], null, false);
    await deps.realtime.publish(ch.live(room.id), 'poll:open', studentView);
    return c.json((await pollDtos(deps, [p!], viewer.id, true))[0], 201);
  })
  .post('/polls/:pollId/vote', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [p] = await deps.db
      .select()
      .from(livePolls)
      .where(eq(livePolls.id, param(c, 'pollId')));
    if (!p) throw notFound();
    const room = await loadRoom(deps, p.roomId);
    if (!(await canAccessLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    if (p.status !== 'open') throw badRequest('poll_closed');
    const { choice } = await body(c, livePollVoteSchema);
    if (choice >= p.options.length) throw badRequest('invalid_choice');
    const added = await deps.db.insert(livePollVotes).values({ pollId: p.id, userId: viewer.id, choice }).onConflictDoNothing().returning();
    if (!added.length) throw badRequest('already_voted');
    const counts = await pollCounts(deps, p.id, p.options.length);
    await deps.realtime.publish(ch.live(room.id), 'poll:votes', { pollId: p.id, total: counts.reduce((a, b) => a + b, 0) });
    return c.json({ ok: true });
  })
  .post('/polls/:pollId/close', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [p] = await deps.db
      .select()
      .from(livePolls)
      .where(eq(livePolls.id, param(c, 'pollId')));
    if (!p) throw notFound();
    const room = await loadRoom(deps, p.roomId);
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const [closed] = await deps.db.update(livePolls).set({ status: 'closed', closedAt: new Date() }).where(eq(livePolls.id, p.id)).returning();
    const [dto] = await pollDtos(deps, [closed!], null, false);
    await deps.realtime.publish(ch.live(room.id), 'poll:closed', dto);
    return c.json(dto);
  })
  /* attendance */
  /** Sent every minute by each person in the class; breakout time counts toward the main class. */
  .post('/:id/presence', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (room.status !== 'live' || !(await canAccessLiveRoom(deps.db, room, viewer.id))) return c.json({ ok: false });
    const rootId = room.parentId ?? room.id;
    await deps.db
      .insert(liveAttendance)
      .values({ roomId: rootId, userId: viewer.id })
      .onConflictDoUpdate({
        target: [liveAttendance.roomId, liveAttendance.userId],
        // Count the time since the last beat, at most 90 s (a closed laptop doesn't earn attendance).
        set: {
          seconds: sql`${liveAttendance.seconds} + least(90, greatest(0, extract(epoch from (now() - ${liveAttendance.lastAt}))::int))`,
          lastAt: sql`now()`,
        },
      });
    return c.json({ ok: true });
  })
  .get('/:id/attendance', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const room = await loadRoom(deps, param(c, 'id'));
    if (!(await canModerateLiveRoom(deps.db, room, viewer.id))) throw forbidden();
    const rootId = room.parentId ?? room.id;
    const root = room.parentId ? await loadRoom(deps, rootId) : room;
    const rows = await deps.db
      .select({ a: liveAttendance, ...summaryColumns })
      .from(liveAttendance)
      .innerJoin(users, eq(users.id, liveAttendance.userId))
      .where(eq(liveAttendance.roomId, rootId))
      .orderBy(desc(liveAttendance.seconds));
    return c.json({
      startedAt: ms(root.startedAt),
      items: rows.map((r) => ({ user: toSummary(r), minutes: Math.round(r.a.seconds / 60), firstAt: r.a.firstAt.getTime(), lastAt: r.a.lastAt.getTime() })),
    } satisfies LiveAttendanceDto);
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
