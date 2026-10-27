import { and, asc, desc, eq, getTableColumns, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { eventInputSchema, eventListQuerySchema, eventRsvpSchema, hasPermission, normalizeSearch, type EventDto, type Page } from '@qubedu/shared';
import { eventRsvps, events, groupMembers, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { groupRole, loadGroup } from '../lib/access';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';

const hostCols = {
  hostUserId: users.id,
  hostDisplayName: users.displayName,
  hostUsername: users.username,
  hostAvatarUrl: users.avatarUrl,
  hostAccountType: users.accountType,
  hostLevel: users.level,
  hostXp: users.xp,
  hostBadge: users.badge,
};
const select = { ...getTableColumns(events), ...hostCols };
type Row = typeof events.$inferSelect & Record<string, unknown>;

/** A group's events are visible to members, or to everyone when the group is public. */
const visibleTo = (viewer: AuthUser) =>
  sql`(${events.groupId} is null
    or ${events.groupId} in (select id from groups where privacy = 'public' and deleted_at is null)
    or ${events.groupId} in (select group_id from group_members where user_id = ${viewer.id}))`;

export async function hydrateEvents(deps: Deps, viewer: AuthUser, rows: Row[]): Promise<EventDto[]> {
  if (!rows.length) return [];
  const mine = await deps.db
    .select({ eventId: eventRsvps.eventId, status: eventRsvps.status })
    .from(eventRsvps)
    .where(
      and(
        eq(eventRsvps.userId, viewer.id),
        sql`${eventRsvps.eventId} in (${sql.join(
          rows.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
      ),
    );
  const status = new Map(mine.map((m) => [m.eventId, m.status]));
  const staff = hasPermission(viewer.role, viewer.permissions, 'content.manage');
  return rows.map((r) => {
    const host = { ...pickSummary('host', { ...r, hostId: r.hostUserId }) };
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      coverUrl: r.coverUrl,
      startsAt: r.startsAt.getTime(),
      endsAt: r.endsAt ? r.endsAt.getTime() : null,
      location: r.location,
      onlineUrl: r.onlineUrl,
      host: toSummary(host),
      groupId: r.groupId,
      goingCount: r.goingCount,
      interestedCount: r.interestedCount,
      myStatus: status.get(r.id) ?? null,
      canEdit: r.hostId === viewer.id || staff,
      createdAt: r.createdAt.getTime(),
    };
  });
}

async function loadEvent(deps: Deps, viewer: AuthUser, id: string): Promise<Row> {
  const [row] = await deps.db
    .select(select)
    .from(events)
    .innerJoin(users, eq(users.id, events.hostId))
    .where(and(eq(events.id, id), isNull(events.deletedAt), visibleTo(viewer)));
  if (!row) throw notFound('event_not_found');
  return row as Row;
}

export const eventRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, eventListQuerySchema);
    const now = new Date();
    const upcoming = q.scope !== 'past';
    const cursor = decodeCursor(q.cursor);
    // Upcoming sorts soonest-first, past sorts most-recent-first; the cursor compares in the matching direction.
    const cmp = upcoming
      ? sql`(${events.startsAt}, ${events.id}) > (to_timestamp(${cursor?.t ?? 0} / 1000.0), ${cursor?.id ?? ''})`
      : sql`(${events.startsAt}, ${events.id}) < (to_timestamp(${cursor?.t ?? 0} / 1000.0), ${cursor?.id ?? ''})`;
    const rows = (await deps.db
      .select(select)
      .from(events)
      .innerJoin(users, eq(users.id, events.hostId))
      .where(
        and(
          isNull(events.deletedAt),
          visibleTo(viewer),
          q.groupId ? eq(events.groupId, q.groupId) : undefined,
          upcoming ? or(gt(events.startsAt, now), gt(events.endsAt, now)) : lt(events.startsAt, now),
          q.scope === 'mine'
            ? sql`(${events.hostId} = ${viewer.id} or ${events.id} in (select event_id from event_rsvps where user_id = ${viewer.id}))`
            : undefined,
          cursor ? cmp : undefined,
        ),
      )
      .orderBy(...(upcoming ? [asc(events.startsAt), asc(events.id)] : [desc(events.startsAt), desc(events.id)]))
      .limit(q.limit + 1)) as Row[];
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    const page: Page<EventDto> = {
      items: await hydrateEvents(deps, viewer, items),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.startsAt, last.id) : null,
    };
    return c.json(page);
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'event', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, eventInputSchema);
    if (input.groupId) {
      await loadGroup(deps.db, input.groupId);
      const role = await groupRole(deps.db, input.groupId, viewer.id);
      if (!role) throw forbidden('not_a_member');
    }
    const [row] = await deps.db
      .insert(events)
      .values({
        hostId: viewer.id,
        groupId: input.groupId ?? null,
        title: input.title,
        description: input.description,
        searchText: normalizeSearch(`${input.title} ${input.location}`),
        coverUrl: input.coverUrl ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        location: input.location,
        onlineUrl: input.onlineUrl ?? null,
        goingCount: 1,
      })
      .returning({ id: events.id });
    await deps.db.insert(eventRsvps).values({ eventId: row!.id, userId: viewer.id, status: 'going' });
    if (input.groupId) {
      const members = await deps.db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, input.groupId)).limit(300);
      await notify(
        deps,
        members.map((m) => ({
          userId: m.id,
          type: 'event_new',
          icon: 'calendar',
          actorId: viewer.id,
          link: `/events/${row!.id}`,
          data: { name: viewer.displayName, title: input.title, eventId: row!.id },
          pref: 'groups' as const,
        })),
      );
    }
    const [dto] = await hydrateEvents(deps, viewer, [await loadEvent(deps, viewer, row!.id)]);
    return c.json(dto, 201);
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [dto] = await hydrateEvents(deps, viewer, [await loadEvent(deps, viewer, param(c, 'id'))]);
    return c.json(dto);
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const ev = await loadEvent(deps, viewer, param(c, 'id'));
    if (ev.hostId !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'content.manage')) throw forbidden();
    const input = await body(c, eventInputSchema);
    await deps.db
      .update(events)
      .set({
        title: input.title,
        description: input.description,
        searchText: normalizeSearch(`${input.title} ${input.location}`),
        coverUrl: input.coverUrl ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        location: input.location,
        onlineUrl: input.onlineUrl ?? null,
      })
      .where(eq(events.id, ev.id));
    const going = await deps.db.select({ id: eventRsvps.userId }).from(eventRsvps).where(eq(eventRsvps.eventId, ev.id)).limit(300);
    if (input.startsAt !== ev.startsAt.getTime())
      await notify(
        deps,
        going.map((g) => ({
          userId: g.id,
          type: 'event_updated',
          icon: 'calendar',
          actorId: viewer.id,
          link: `/events/${ev.id}`,
          data: { title: input.title, eventId: ev.id },
          pref: 'groups' as const,
        })),
      );
    const [dto] = await hydrateEvents(deps, viewer, [await loadEvent(deps, viewer, ev.id)]);
    return c.json(dto);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const ev = await loadEvent(deps, viewer, param(c, 'id'));
    if (ev.hostId !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'content.manage')) throw forbidden();
    await deps.db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, ev.id));
    return c.json({ ok: true });
  })
  .put('/:id/rsvp', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const ev = await loadEvent(deps, viewer, param(c, 'id'));
    const { status } = await body(c, eventRsvpSchema);
    const counts = await deps.db.transaction(async (tx) => {
      if (status === 'none') await tx.delete(eventRsvps).where(and(eq(eventRsvps.eventId, ev.id), eq(eventRsvps.userId, viewer.id)));
      else
        await tx
          .insert(eventRsvps)
          .values({ eventId: ev.id, userId: viewer.id, status })
          .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status } });
      const [agg] = await tx
        .select({
          going: sql<number>`count(*) filter (where ${eventRsvps.status} = 'going')::int`,
          interested: sql<number>`count(*) filter (where ${eventRsvps.status} = 'interested')::int`,
        })
        .from(eventRsvps)
        .where(eq(eventRsvps.eventId, ev.id));
      await tx.update(events).set({ goingCount: agg!.going, interestedCount: agg!.interested }).where(eq(events.id, ev.id));
      return agg!;
    });
    return c.json({ myStatus: status === 'none' ? null : status, goingCount: counts.going, interestedCount: counts.interested });
  })
  .get('/:id/attendees', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const ev = await loadEvent(deps, viewer, param(c, 'id'));
    const rows = await deps.db
      .select({
        status: eventRsvps.status,
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        accountType: users.accountType,
        level: users.level,
        xp: users.xp,
        badge: users.badge,
      })
      .from(eventRsvps)
      .innerJoin(users, eq(users.id, eventRsvps.userId))
      .where(eq(eventRsvps.eventId, ev.id))
      .orderBy(desc(eventRsvps.createdAt))
      .limit(100);
    return c.json({ items: rows.map((r) => ({ status: r.status, user: toSummary(r) })) });
  });
