import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  canModerateGroup,
  channelSchema,
  createGroupSchema,
  groupResourceSchema,
  hasPermission,
  joinRequestSchema,
  memberRoleSchema,
  normalizeSearch,
  paginationSchema,
  updateGroupSchema,
  type ChannelDto,
  type GroupDto,
  type GroupMemberDto,
  type GroupResourceDto,
} from '@qubedu/shared';
import { conversations, groupChannels, groupJoinRequests, groupMembers, groupResources, groups, users } from '../db/schema';
import { groupRole, loadGroup } from '../lib/access';
import { audit } from '../lib/audit';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { requireControl } from '../lib/minors';
import { pickSummary, summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkAchievements } from '../lib/progress';
import { ch } from '../lib/realtime';
import { checkRate } from '../middleware';
import { groupPostsPage } from './posts';

const ownerCols = {
  ownerId: users.id,
  ownerDisplayName: users.displayName,
  ownerUsername: users.username,
  ownerAvatarUrl: users.avatarUrl,
  ownerAccountType: users.accountType,
  ownerTeacherVerifiedAt: users.teacherVerifiedAt,
  ownerLevel: users.level,
  ownerXp: users.xp,
  ownerBadge: users.badge,
};

type GroupRow = typeof groups.$inferSelect;

async function toGroupDtos(deps: Deps, viewer: AuthUser, rows: (GroupRow & Record<string, unknown>)[]): Promise<GroupDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [roles, requests, pending] = await Promise.all([
    deps.db
      .select({ g: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(and(inArray(groupMembers.groupId, ids), eq(groupMembers.userId, viewer.id))),
    deps.db
      .select({ g: groupJoinRequests.groupId })
      .from(groupJoinRequests)
      .where(and(inArray(groupJoinRequests.groupId, ids), eq(groupJoinRequests.userId, viewer.id))),
    deps.db
      .select({ g: groupJoinRequests.groupId, n: count() })
      .from(groupJoinRequests)
      .where(inArray(groupJoinRequests.groupId, ids))
      .groupBy(groupJoinRequests.groupId),
  ]);
  const roleMap = new Map(roles.map((r) => [r.g, r.role]));
  const reqSet = new Set(requests.map((r) => r.g));
  const pendingMap = new Map(pending.map((p) => [p.g, p.n]));
  return rows.map((r) => {
    const myRole = roleMap.get(r.id) ?? null;
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      description: r.description,
      privacy: r.privacy,
      avatarUrl: r.avatarUrl,
      coverUrl: r.coverUrl,
      tags: r.tags,
      owner: toSummary(pickSummary('owner', r)),
      memberCount: r.memberCount,
      postCount: r.postCount,
      myRole,
      pendingRequest: reqSet.has(r.id),
      requestCount: canModerateGroup(myRole) ? (pendingMap.get(r.id) ?? 0) : 0,
      conversationId: myRole ? r.conversationId : null,
      createdAt: r.createdAt.getTime(),
    };
  });
}

async function groupDto(deps: Deps, viewer: AuthUser, id: string) {
  const [row] = await deps.db
    .select({ g: groups, ...ownerCols })
    .from(groups)
    .innerJoin(users, eq(users.id, groups.ownerId))
    .where(and(eq(groups.id, id), isNull(groups.deletedAt)));
  if (!row) throw notFound('group_not_found');
  return (await toGroupDtos(deps, viewer, [{ ...row.g, ...row }]))[0]!;
}

async function requireModerator(deps: Deps, viewer: AuthUser, groupId: string) {
  const role = await groupRole(deps.db, groupId, viewer.id);
  if (!canModerateGroup(role) && !hasPermission(viewer.role, viewer.permissions, 'communities.manage')) throw forbidden('moderator_only');
  return role;
}

async function addMember(deps: Deps, groupId: string, userId: string, role: 'owner' | 'admin' | 'teacher' | 'member' = 'member') {
  const inserted = await deps.db.insert(groupMembers).values({ groupId, userId, role }).onConflictDoNothing().returning();
  if (inserted.length)
    await deps.db
      .update(groups)
      .set({ memberCount: sql`${groups.memberCount} + 1` })
      .where(eq(groups.id, groupId));
  await deps.db.delete(groupJoinRequests).where(and(eq(groupJoinRequests.groupId, groupId), eq(groupJoinRequests.userId, userId)));
  return inserted.length > 0;
}

async function removeMember(deps: Deps, groupId: string, userId: string) {
  const removed = await deps.db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .returning();
  if (removed.length)
    await deps.db
      .update(groups)
      .set({ memberCount: sql`greatest(${groups.memberCount} - 1, 0)` })
      .where(eq(groups.id, groupId));
}

const listQuery = paginationSchema.extend({
  kind: z.enum(['group', 'community']).default('group'),
  scope: z.enum(['all', 'mine', 'discover']).default('all'),
  q: z.string().trim().max(80).default(''),
});

export const groupRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, listQuery);
    const cursor = decodeCursor(q.cursor);
    const term = normalizeSearch(q.q);
    const memberOf = sql`${groups.id} in (select group_id from group_members where user_id = ${viewer.id})`;
    const rows = await deps.db
      .select({ g: groups, ...ownerCols })
      .from(groups)
      .innerJoin(users, eq(users.id, groups.ownerId))
      .where(
        and(
          isNull(groups.deletedAt),
          eq(groups.kind, q.kind),
          q.scope === 'mine' ? memberOf : q.scope === 'discover' ? sql`not ${memberOf}` : undefined,
          term ? or(ilike(groups.searchName, `%${term}%`), sql`${groups.searchName} % ${term}`) : undefined,
          cursor ? sql`(${groups.createdAt}, ${groups.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(groups.createdAt), desc(groups.id))
      .limit(q.limit + 1);
    const flat = rows.map((r) => ({ ...r.g, ...r }));
    const page = pageOf(flat, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    return c.json({ items: await toGroupDtos(deps, viewer, page.items), nextCursor: page.nextCursor });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'group-create', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, createGroupSchema);
    await requireControl(deps.db, viewer.id, 'joinGroups');
    const groupId = await deps.db.transaction(async (tx) => {
      const [conv] = await tx.insert(conversations).values({ kind: 'group', title: input.name }).returning({ id: conversations.id });
      const [g] = await tx
        .insert(groups)
        .values({
          kind: input.kind,
          name: input.name,
          searchName: normalizeSearch(input.name),
          description: input.description,
          privacy: input.privacy,
          avatarUrl: input.avatarUrl ?? null,
          coverUrl: input.coverUrl ?? null,
          tags: input.tags,
          ownerId: viewer.id,
          memberCount: 1,
          conversationId: conv!.id,
        })
        .returning({ id: groups.id });
      await tx.update(conversations).set({ groupId: g!.id }).where(eq(conversations.id, conv!.id));
      await tx.insert(groupMembers).values({ groupId: g!.id, userId: viewer.id, role: 'owner' });
      if (input.kind === 'community') {
        for (const [i, ch] of [
          { name: 'announcements', kind: 'announcement' as const },
          { name: 'general', kind: 'text' as const },
        ].entries()) {
          const [cc] = await tx.insert(conversations).values({ kind: 'channel', groupId: g!.id, title: ch.name }).returning({ id: conversations.id });
          await tx.insert(groupChannels).values({ groupId: g!.id, name: ch.name, kind: ch.kind, conversationId: cc!.id, sort: i });
        }
      }
      return g!.id;
    });
    const newAchievements = await checkAchievements(deps.db, viewer.id);
    return c.json({ ...(await groupDto(deps, viewer, groupId)), newAchievements }, 201);
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    return c.json(await groupDto(c.get('deps'), viewer, param(c, 'id')));
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await loadGroup(deps.db, id);
    const role = await requireModerator(deps, viewer, id);
    if (role === 'teacher') throw forbidden('admin_only');
    const input = await body(c, updateGroupSchema);
    await deps.db
      .update(groups)
      .set({ ...input, ...(input.name ? { searchName: normalizeSearch(input.name) } : {}), updatedAt: new Date() })
      .where(eq(groups.id, id));
    return c.json(await groupDto(deps, viewer, id));
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.ownerId !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'communities.manage')) throw forbidden('owner_only');
    await deps.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, g.id));
    if (g.ownerId !== viewer.id) await audit(deps.db, viewer.id, 'group.delete', 'group', g.id, { name: g.name });
    return c.json({ ok: true });
  })
  .post('/:id/join', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (await groupRole(deps.db, g.id, viewer.id)) return c.json({ status: 'member' });
    await requireControl(deps.db, viewer.id, 'joinGroups');
    if (g.privacy === 'public') {
      await addMember(deps, g.id, viewer.id);
      await checkAchievements(deps.db, viewer.id);
      await deps.realtime.publish(ch.group(g.id), 'member:joined', { userId: viewer.id });
      return c.json({ status: 'member' });
    }
    const { message } = await body(c, joinRequestSchema).catch(() => ({ message: '' }));
    await deps.db
      .insert(groupJoinRequests)
      .values({ groupId: g.id, userId: viewer.id, message: message ?? '' })
      .onConflictDoNothing();
    const mods = await deps.db
      .select({ id: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, g.id), inArray(groupMembers.role, ['owner', 'admin'])));
    await notify(
      deps,
      mods.map((m) => ({
        userId: m.id,
        type: 'group_request',
        icon: 'user-plus',
        actorId: viewer.id,
        link: `/groups/${g.id}?tab=members`,
        data: { name: viewer.displayName, group: g.name },
        pref: 'groups' as const,
      })),
    );
    return c.json({ status: 'requested' });
  })
  .delete('/:id/join', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(groupJoinRequests).where(and(eq(groupJoinRequests.groupId, param(c, 'id')), eq(groupJoinRequests.userId, viewer.id)));
    return c.json({ status: 'none' });
  })
  .post('/:id/leave', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.ownerId === viewer.id) throw badRequest('owner_must_transfer');
    await removeMember(deps, g.id, viewer.id);
    return c.json({ status: 'none' });
  })
  .get('/:id/requests', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireModerator(deps, viewer, id);
    const rows = await deps.db
      .select({ ...summaryColumns, message: groupJoinRequests.message, at: groupJoinRequests.createdAt })
      .from(groupJoinRequests)
      .innerJoin(users, eq(users.id, groupJoinRequests.userId))
      .where(eq(groupJoinRequests.groupId, id))
      .orderBy(desc(groupJoinRequests.createdAt));
    return c.json({ items: rows.map((r) => ({ user: toSummary(r), message: r.message, createdAt: r.at.getTime() })) });
  })
  .post('/:id/requests/:userId/:decision{approve|reject}', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    await requireModerator(deps, viewer, g.id);
    const userId = param(c, 'userId');
    const [req] = await deps.db
      .select()
      .from(groupJoinRequests)
      .where(and(eq(groupJoinRequests.groupId, g.id), eq(groupJoinRequests.userId, userId)));
    if (!req) throw notFound('request_not_found');
    if (c.req.param('decision') === 'approve') {
      await addMember(deps, g.id, userId);
      await checkAchievements(deps.db, userId);
      await notify(deps, {
        userId,
        type: 'group_approved',
        icon: 'check',
        actorId: viewer.id,
        link: `/groups/${g.id}`,
        data: { group: g.name },
        pref: 'groups',
      });
    } else {
      await deps.db.delete(groupJoinRequests).where(and(eq(groupJoinRequests.groupId, g.id), eq(groupJoinRequests.userId, userId)));
    }
    return c.json({ ok: true });
  })
  .get('/:id/members', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.privacy === 'private' && !(await groupRole(deps.db, g.id, viewer.id))) throw forbidden('not_a_member');
    const q = query(c, paginationSchema.extend({ limit: z.coerce.number().int().min(1).max(200).default(100) }));
    const cursor = decodeCursor(q.cursor);
    const rows = await deps.db
      .select({ ...summaryColumns, role: groupMembers.role, joinedAt: groupMembers.joinedAt })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(
        and(
          eq(groupMembers.groupId, g.id),
          cursor ? sql`(${groupMembers.joinedAt}, ${users.id}) > (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(groupMembers.joinedAt, users.id)
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.joinedAt, id: r.id }));
    const summaries = await withOnline(deps.kv, page.items.map(toSummary));
    const items: GroupMemberDto[] = page.items.map((r, i) => ({ user: summaries[i]!, role: r.role, joinedAt: r.joinedAt.getTime() }));
    return c.json({ items, nextCursor: page.nextCursor });
  })
  .patch('/:id/members/:userId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    const myRole = await groupRole(deps.db, g.id, viewer.id);
    if (myRole !== 'owner' && myRole !== 'admin') throw forbidden('admin_only');
    const userId = param(c, 'userId');
    if (userId === g.ownerId) throw forbidden('cannot_change_owner');
    const { role } = await body(c, memberRoleSchema);
    if (role === 'admin' && myRole !== 'owner') throw forbidden('owner_only');
    const updated = await deps.db
      .update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, userId)))
      .returning();
    if (!updated.length) throw notFound('member_not_found');
    return c.json({ ok: true, role });
  })
  .delete('/:id/members/:userId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    const myRole = await requireModerator(deps, viewer, g.id);
    const userId = param(c, 'userId');
    if (userId === g.ownerId) throw forbidden('cannot_remove_owner');
    const target = await groupRole(deps.db, g.id, userId);
    if (target === 'admin' && myRole !== 'owner') throw forbidden('owner_only');
    await removeMember(deps, g.id, userId);
    return c.json({ ok: true });
  })
  .post('/:id/transfer', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.ownerId !== viewer.id) throw forbidden('owner_only');
    const { userId } = await body(c, z.object({ userId: z.string().uuid() }));
    if (!(await groupRole(deps.db, g.id, userId))) throw badRequest('not_a_member');
    await deps.db.transaction(async (tx) => {
      await tx.update(groups).set({ ownerId: userId }).where(eq(groups.id, g.id));
      await tx
        .update(groupMembers)
        .set({ role: 'owner' })
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, userId)));
      await tx
        .update(groupMembers)
        .set({ role: 'admin' })
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, viewer.id)));
    });
    return c.json({ ok: true });
  })
  .get('/:id/posts', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.privacy === 'private' && !(await groupRole(deps.db, g.id, viewer.id)) && !hasPermission(viewer.role, viewer.permissions, 'communities.manage'))
      throw forbidden('not_a_member');
    const q = query(c, paginationSchema);
    return c.json(await groupPostsPage(deps, viewer, g.id, q.limit, q.cursor));
  })
  .get('/:id/leaderboard', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (g.privacy === 'private' && !(await groupRole(deps.db, g.id, viewer.id))) throw forbidden('not_a_member');
    const rows = await deps.db
      .select(summaryColumns)
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, g.id))
      .orderBy(desc(users.xp))
      .limit(50);
    return c.json({ items: rows.map((r, i) => ({ rank: i + 1, user: toSummary(r), score: r.xp })) });
  })
  .get('/:id/resources', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (!(await groupRole(deps.db, g.id, viewer.id)) && g.privacy === 'private') throw forbidden('not_a_member');
    const q = query(c, paginationSchema);
    const cursor = decodeCursor(q.cursor);
    const rows = await deps.db
      .select({ r: groupResources, ...ownerCols })
      .from(groupResources)
      .innerJoin(users, eq(users.id, groupResources.uploaderId))
      .where(
        and(
          eq(groupResources.groupId, g.id),
          cursor ? sql`(${groupResources.createdAt}, ${groupResources.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(groupResources.createdAt), desc(groupResources.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.r.createdAt, id: r.r.id }));
    const items: GroupResourceDto[] = page.items.map((r) => ({
      id: r.r.id,
      title: r.r.title,
      url: r.r.url,
      kind: r.r.kind,
      mime: r.r.mime,
      size: r.r.size,
      uploader: toSummary(pickSummary('owner', r as unknown as Record<string, unknown>)),
      createdAt: r.r.createdAt.getTime(),
    }));
    return c.json({ items, nextCursor: page.nextCursor });
  })
  .post('/:id/resources', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    const role = await groupRole(deps.db, g.id, viewer.id);
    if (!role) throw forbidden('not_a_member');
    const input = await body(c, groupResourceSchema);
    const [row] = await deps.db
      .insert(groupResources)
      .values({ groupId: g.id, uploaderId: viewer.id, ...input })
      .returning();
    return c.json({ id: row!.id }, 201);
  })
  .delete('/:id/resources/:resourceId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    const [res] = await deps.db
      .select()
      .from(groupResources)
      .where(and(eq(groupResources.id, param(c, 'resourceId')), eq(groupResources.groupId, g.id)));
    if (!res) throw notFound();
    if (res.uploaderId !== viewer.id) await requireModerator(deps, viewer, g.id);
    await deps.db.delete(groupResources).where(eq(groupResources.id, res.id));
    return c.json({ ok: true });
  })
  .get('/:id/channels', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    if (!(await groupRole(deps.db, g.id, viewer.id))) throw forbidden('not_a_member');
    const rows = await deps.db.select().from(groupChannels).where(eq(groupChannels.groupId, g.id)).orderBy(groupChannels.sort, groupChannels.createdAt);
    const items: ChannelDto[] = rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, conversationId: r.conversationId }));
    return c.json({ items });
  })
  .post('/:id/channels', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    await requireModerator(deps, viewer, g.id);
    const input = await body(c, channelSchema);
    const [{ n }] = (await deps.db.select({ n: count() }).from(groupChannels).where(eq(groupChannels.groupId, g.id))) as [{ n: number }];
    if (n >= 30) throw conflict('too_many_channels');
    const [conv] = await deps.db.insert(conversations).values({ kind: 'channel', groupId: g.id, title: input.name }).returning({ id: conversations.id });
    const [row] = await deps.db
      .insert(groupChannels)
      .values({ groupId: g.id, name: input.name, kind: input.kind, conversationId: conv!.id, sort: n })
      .returning();
    return c.json({ id: row!.id, name: row!.name, kind: row!.kind, conversationId: row!.conversationId } satisfies ChannelDto, 201);
  })
  .delete('/:id/channels/:channelId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const g = await loadGroup(deps.db, param(c, 'id'));
    await requireModerator(deps, viewer, g.id);
    const [row] = await deps.db
      .delete(groupChannels)
      .where(and(eq(groupChannels.id, param(c, 'channelId')), eq(groupChannels.groupId, g.id)))
      .returning();
    if (row) await deps.db.delete(conversations).where(eq(conversations.id, row.conversationId));
    return c.json({ ok: true });
  });
