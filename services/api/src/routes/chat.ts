import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  editMessageSchema,
  messageReactionSchema,
  MESSAGE_EMOJI,
  paginationSchema,
  sendMessageSchema,
  startDirectSchema,
  truncate,
  type ConversationDto,
  type MessageDto,
} from '@qubedu/shared';
import { blocks, conversationMembers, conversations, follows, groups, liveRooms, messageReactions, messages, users } from '../db/schema';
import { conversationAccess, ensureConversationMember } from '../lib/access';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { decodeCursor } from '../lib/cursor';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms, pickSummary, summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { notify } from '../lib/notify';
import { privacyOf } from '../lib/profile';
import { ch } from '../lib/realtime';
import { checkRate } from '../middleware';

const senderCols = {
  senderId: users.id,
  senderDisplayName: users.displayName,
  senderUsername: users.username,
  senderAvatarUrl: users.avatarUrl,
  senderAccountType: users.accountType,
  senderLevel: users.level,
  senderXp: users.xp,
  senderBadge: users.badge,
};

const directKey = (a: string, b: string) => [a, b].sort().join(':');

async function signAttachment(deps: Deps, att: Record<string, unknown> | null) {
  if (!att) return null;
  const key = typeof att.key === 'string' ? att.key : null;
  if (key && key.startsWith('private/')) return { ...att, url: await deps.storage.urlFor(key) };
  return att;
}

export async function hydrateMessages(deps: Deps, rows: (typeof messages.$inferSelect & Record<string, unknown>)[]): Promise<MessageDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.replyToId).filter((x): x is string => !!x);
  const [reacts, replies] = await Promise.all([
    deps.db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids)),
    replyIds.length
      ? deps.db
          .select({ id: messages.id, text: messages.text, deletedAt: messages.deletedAt, name: users.displayName })
          .from(messages)
          .innerJoin(users, eq(users.id, messages.senderId))
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
  ]);
  const reactMap = new Map<string, Record<string, string[]>>();
  for (const r of reacts) {
    const m = reactMap.get(r.messageId) ?? {};
    (m[r.emoji] ??= []).push(r.userId);
    reactMap.set(r.messageId, m);
  }
  const replyMap = new Map(replies.map((r) => [r.id, r]));
  return Promise.all(
    rows.map(async (r) => {
      const reply = r.replyToId ? replyMap.get(r.replyToId) : undefined;
      const deleted = !!r.deletedAt;
      return {
        id: r.id,
        conversationId: r.conversationId,
        sender: toSummary(pickSummary('sender', r)),
        text: deleted ? '' : r.text,
        attachment: deleted ? null : ((await signAttachment(deps, r.attachment)) as MessageDto['attachment']),
        replyTo: reply ? { id: reply.id, text: reply.deletedAt ? '' : truncate(reply.text, 120), senderName: reply.name } : null,
        reactions: deleted ? {} : (reactMap.get(r.id) ?? {}),
        createdAt: r.createdAt.getTime(),
        editedAt: ms(r.editedAt),
        deleted,
        clientId: r.clientId,
      };
    }),
  );
}

async function loadMessage(deps: Deps, id: string) {
  const [row] = await deps.db
    .select({ m: messages, ...senderCols })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.id, id));
  if (!row) throw notFound('message_not_found');
  return { ...row.m, ...row } as typeof messages.$inferSelect & Record<string, unknown>;
}

async function conversationDto(deps: Deps, viewer: AuthUser, convId: string): Promise<ConversationDto> {
  const list = await listConversations(deps, viewer, { ids: [convId] });
  const dto = list[0];
  if (!dto) throw notFound('conversation_not_found');
  return dto;
}

async function listConversations(deps: Deps, viewer: AuthUser, opts: { ids?: string[]; before?: number; limit?: number } = {}): Promise<ConversationDto[]> {
  const rows = await deps.db
    .select({ c: conversations, m: conversationMembers, g: { name: groups.name, avatarUrl: groups.avatarUrl } })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .leftJoin(groups, eq(groups.id, conversations.groupId))
    .where(
      and(
        eq(conversationMembers.userId, viewer.id),
        opts.ids ? inArray(conversations.id, opts.ids) : eq(conversationMembers.hidden, false),
        opts.ids ? undefined : sql`${conversations.lastMessageAt} is not null or ${conversations.kind} = 'direct'`,
        opts.before ? lt(conversations.lastMessageAt, new Date(opts.before)) : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(opts.limit ?? 50);
  if (!rows.length) return [];
  const convIds = rows.map((r) => r.c.id);
  const directIds = rows.filter((r) => r.c.kind === 'direct').map((r) => r.c.id);
  const [peers, unreads] = await Promise.all([
    directIds.length
      ? deps.db
          .select({ conversationId: conversationMembers.conversationId, ...summaryColumns })
          .from(conversationMembers)
          .innerJoin(users, eq(users.id, conversationMembers.userId))
          .where(and(inArray(conversationMembers.conversationId, directIds), ne(conversationMembers.userId, viewer.id)))
      : Promise.resolve([]),
    deps.db.execute<{ conversation_id: string; n: number }>(sql`
      select m.conversation_id, count(*)::int as n from messages m
      join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${viewer.id}
      where m.conversation_id in ${convIds} and m.sender_id <> ${viewer.id} and m.deleted_at is null
        and m.created_at > coalesce(cm.last_read_at, to_timestamp(0))
      group by m.conversation_id`),
  ]);
  const peerMap = new Map(peers.map((p) => [p.conversationId, toSummary(p)]));
  const onlinePeers = await withOnline(deps.kv, [...peerMap.values()]);
  const onlineMap = new Map(onlinePeers.map((p) => [p.id, p]));
  const unreadMap = new Map(unreads.map((u) => [u.conversation_id, Number(u.n)]));
  return rows.map((r) => {
    const peer = peerMap.get(r.c.id);
    return {
      id: r.c.id,
      kind: r.c.kind,
      title: r.c.kind === 'direct' ? (peer?.displayName ?? '') : (r.c.title ?? r.g?.name ?? ''),
      avatarUrl: r.c.kind === 'direct' ? (peer?.avatarUrl ?? null) : (r.g?.avatarUrl ?? null),
      peer: peer ? (onlineMap.get(peer.id) ?? peer) : null,
      groupId: r.c.groupId,
      lastMessage: r.c.lastMessageAt
        ? { text: r.c.lastMessageText ?? '', senderId: r.c.lastMessageSenderId ?? '', createdAt: r.c.lastMessageAt.getTime() }
        : null,
      unread: unreadMap.get(r.c.id) ?? 0,
      muted: r.m.muted,
      updatedAt: (r.c.lastMessageAt ?? r.c.createdAt).getTime(),
    };
  });
}

/** Members notified on a new message (direct: the peer; group/channel: all members except sender). */
async function recipientsOf(deps: Deps, conv: typeof conversations.$inferSelect, senderId: string): Promise<{ id: string; muted: boolean }[]> {
  if (conv.kind === 'direct' || conv.kind === 'live') {
    const rows = await deps.db
      .select({ id: conversationMembers.userId, muted: conversationMembers.muted })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conv.id), ne(conversationMembers.userId, senderId)));
    return rows;
  }
  const rows = await deps.db.execute<{ id: string; muted: boolean | null }>(sql`
    select gm.user_id as id, cm.muted from group_members gm
    left join conversation_members cm on cm.conversation_id = ${conv.id} and cm.user_id = gm.user_id
    where gm.group_id = ${conv.groupId} and gm.user_id <> ${senderId}`);
  return rows.map((r) => ({ id: r.id, muted: !!r.muted }));
}

export async function postMessage(deps: Deps, viewer: AuthUser, conversationId: string, input: z.infer<typeof sendMessageSchema>): Promise<MessageDto> {
  const { conv, groupRole } = await conversationAccess(deps.db, conversationId, viewer.id);
  if (conv.kind === 'channel') {
    const [chan] = await deps.db.execute<{ kind: string }>(sql`select kind from group_channels where conversation_id = ${conv.id}`);
    if (chan?.kind === 'announcement' && !['owner', 'admin', 'teacher'].includes(groupRole ?? '')) throw forbidden('announcement_only');
  }
  if (conv.kind === 'live') {
    const [room] = await deps.db.select().from(liveRooms).where(eq(liveRooms.conversationId, conv.id));
    if (room && room.settings.allowChat === false && room.hostId !== viewer.id) throw forbidden('chat_disabled');
  }
  if (conv.kind === 'direct') {
    const [peer] = await deps.db
      .select({ id: users.id, privacy: users.privacy })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(and(eq(conversationMembers.conversationId, conv.id), ne(conversationMembers.userId, viewer.id)));
    if (peer) {
      const [blocked] = await deps.db
        .select()
        .from(blocks)
        .where(and(eq(blocks.blockerId, peer.id), eq(blocks.blockedId, viewer.id)));
      if (blocked) throw forbidden('blocked');
    }
  }
  if (input.replyToId) {
    const [r] = await deps.db.select({ c: messages.conversationId }).from(messages).where(eq(messages.id, input.replyToId));
    if (!r || r.c !== conv.id) throw badRequest('invalid_reply');
  }
  if (input.clientId) {
    const [dup] = await deps.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.senderId, viewer.id), eq(messages.clientId, input.clientId)));
    if (dup) return (await hydrateMessages(deps, [await loadMessage(deps, dup.id)]))[0]!;
  }
  let attachment: Record<string, unknown> | null = null;
  if (input.attachment) {
    const key = new URL(input.attachment.url, deps.env.API_PUBLIC_URL).pathname.replace(/^\/files\//, '');
    attachment = { ...input.attachment, key: /^(public|private)\//.test(key) ? key : null, url: input.attachment.url.split('?')[0] };
  }
  const [row] = await deps.db
    .insert(messages)
    .values({
      conversationId: conv.id,
      senderId: viewer.id,
      text: input.text,
      attachment,
      replyToId: input.replyToId ?? null,
      clientId: input.clientId ?? null,
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  const preview = input.text ? truncate(input.text, 140) : `📎 ${input.attachment?.name ?? ''}`;
  await deps.db
    .update(conversations)
    .set({ lastMessageAt: row!.createdAt, lastMessageText: preview, lastMessageSenderId: viewer.id })
    .where(eq(conversations.id, conv.id));
  await ensureConversationMember(deps.db, conv.id, viewer.id);
  await deps.db
    .update(conversationMembers)
    .set({ lastReadAt: row!.createdAt, hidden: false })
    .where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.userId, viewer.id)));
  if (conv.kind === 'direct') await deps.db.update(conversationMembers).set({ hidden: false }).where(eq(conversationMembers.conversationId, conv.id));
  const [dto] = await hydrateMessages(deps, [await loadMessage(deps, row!.id)]);
  await deps.realtime.publish(ch.conv(conv.id), 'message:new', dto);
  const recipients = await recipientsOf(deps, conv, viewer.id);
  if (recipients.length) {
    await deps.realtime.publish(
      recipients.map((r) => ch.user(r.id)),
      'conversation:updated',
      { conversationId: conv.id, kind: conv.kind, preview, senderId: viewer.id, senderName: viewer.displayName },
    );
    if (conv.kind === 'direct') {
      await notify(
        deps,
        recipients
          .filter((r) => !r.muted)
          .map((r) => ({
            userId: r.id,
            type: 'message',
            icon: 'message-circle',
            actorId: viewer.id,
            link: `/chat/${conv.id}`,
            data: { name: viewer.displayName, preview },
            pref: 'messages' as const,
          })),
      );
    }
  }
  return dto!;
}

export const chatRoutes = new Hono<AppEnv>()
  .get('/conversations', async (c) => {
    const viewer = requireUser(c);
    const q = query(c, z.object({ before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }));
    const items = await listConversations(c.get('deps'), viewer, { before: q.before, limit: q.limit });
    return c.json({ items, nextCursor: items.length === q.limit ? String(items.at(-1)!.updatedAt) : null });
  })
  .post('/conversations/direct', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const { userId } = await body(c, startDirectSchema);
    if (userId === viewer.id) throw badRequest('cannot_message_self');
    const [peer] = await deps.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!peer) throw notFound('user_not_found');
    const key = directKey(viewer.id, userId);
    const [existing] = await deps.db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, key));
    if (existing) {
      await deps.db
        .update(conversationMembers)
        .set({ hidden: false })
        .where(and(eq(conversationMembers.conversationId, existing.id), eq(conversationMembers.userId, viewer.id)));
      return c.json(await conversationDto(deps, viewer, existing.id));
    }
    const [blocked] = await deps.db
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, viewer.id)));
    if (blocked) throw forbidden('blocked');
    const privacy = privacyOf(peer);
    if (privacy.allowMessages === 'none') throw forbidden('messages_disabled');
    if (privacy.allowMessages === 'following') {
      const [f] = await deps.db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, userId), eq(follows.followeeId, viewer.id)));
      if (!f) throw forbidden('messages_following_only');
    }
    const id = await deps.db.transaction(async (tx) => {
      const [conv] = await tx.insert(conversations).values({ kind: 'direct', directKey: key }).onConflictDoNothing().returning({ id: conversations.id });
      const convId = conv?.id ?? (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, key)))[0]!.id;
      await tx
        .insert(conversationMembers)
        .values([
          { conversationId: convId, userId: viewer.id },
          { conversationId: convId, userId },
        ])
        .onConflictDoNothing();
      return convId;
    });
    return c.json(await conversationDto(deps, viewer, id), 201);
  })
  .get('/conversations/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await conversationAccess(deps.db, id, viewer.id);
    await ensureConversationMember(deps.db, id, viewer.id);
    return c.json(await conversationDto(deps, viewer, id));
  })
  .patch('/conversations/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await conversationAccess(deps.db, id, viewer.id);
    const input = await body(c, z.object({ muted: z.boolean().optional(), hidden: z.boolean().optional() }));
    await ensureConversationMember(deps.db, id, viewer.id);
    await deps.db
      .update(conversationMembers)
      .set(input)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, viewer.id)));
    return c.json({ ok: true });
  })
  .get('/conversations/:id/messages', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await conversationAccess(deps.db, id, viewer.id);
    const q = query(c, paginationSchema.extend({ q: z.string().trim().max(100).optional() }));
    const cursor = decodeCursor(q.cursor);
    const rows = await deps.db
      .select({ m: messages, ...senderCols })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, id),
          q.q ? sql`${messages.text} ilike ${`%${q.q.replace(/[%_]/g, '')}%`} and ${messages.deletedAt} is null` : undefined,
          cursor ? sql`(${messages.createdAt}, ${messages.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(q.limit + 1);
    const flat = rows.map((r) => ({ ...r.m, ...r }) as typeof messages.$inferSelect & Record<string, unknown>);
    const pageRows = flat.slice(0, q.limit);
    const last = pageRows.at(-1);
    const nextCursor = flat.length > q.limit && last ? Buffer.from(`${last.createdAt.getTime()}|${last.id}`).toString('base64url') : null;
    const items = (await hydrateMessages(deps, pageRows)).reverse();
    const [readers] = await deps.db.execute<{ last_read: Date | null }>(sql`
      select max(last_read_at) as last_read from conversation_members where conversation_id = ${id} and user_id <> ${viewer.id}`);
    return c.json({ items, nextCursor, peerLastReadAt: readers?.last_read ? new Date(readers.last_read).getTime() : null });
  })
  .post('/conversations/:id/messages', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'message', limit: 60, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    if (deps.env.REQUIRE_EMAIL_VERIFICATION && !viewer.emailVerified) throw forbidden('email_not_verified');
    const input = await body(c, sendMessageSchema);
    return c.json(await postMessage(deps, viewer, param(c, 'id'), input), 201);
  })
  .post('/conversations/:id/read', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await conversationAccess(deps.db, id, viewer.id);
    await ensureConversationMember(deps.db, id, viewer.id);
    const now = new Date();
    await deps.db
      .update(conversationMembers)
      .set({ lastReadAt: now })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, viewer.id)));
    await deps.realtime.publish(ch.conv(id), 'conversation:read', { userId: viewer.id, at: now.getTime() }, viewer.id);
    return c.json({ ok: true, at: now.getTime() });
  })
  .patch('/messages/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const msg = await loadMessage(deps, param(c, 'id'));
    if (msg.senderId !== viewer.id || msg.deletedAt) throw forbidden();
    if (Date.now() - msg.createdAt.getTime() > 24 * 3600_000) throw forbidden('edit_window_passed');
    const { text } = await body(c, editMessageSchema);
    await deps.db.update(messages).set({ text, editedAt: new Date() }).where(eq(messages.id, msg.id));
    const [dto] = await hydrateMessages(deps, [await loadMessage(deps, msg.id)]);
    await deps.realtime.publish(ch.conv(msg.conversationId), 'message:updated', dto);
    return c.json(dto);
  })
  .delete('/messages/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const msg = await loadMessage(deps, param(c, 'id'));
    let allowed = msg.senderId === viewer.id;
    if (!allowed) {
      const { groupRole } = await conversationAccess(deps.db, msg.conversationId, viewer.id);
      allowed = groupRole === 'owner' || groupRole === 'admin' || groupRole === 'teacher';
    }
    if (!allowed) throw forbidden();
    await deps.db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, msg.id));
    const [dto] = await hydrateMessages(deps, [await loadMessage(deps, msg.id)]);
    await deps.realtime.publish(ch.conv(msg.conversationId), 'message:updated', dto);
    return c.json({ ok: true });
  })
  .post('/messages/:id/reactions', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const msg = await loadMessage(deps, param(c, 'id'));
    await conversationAccess(deps.db, msg.conversationId, viewer.id);
    const { emoji } = await body(c, messageReactionSchema);
    if (!(MESSAGE_EMOJI as readonly string[]).includes(emoji)) throw badRequest('unsupported_emoji');
    const existing = await deps.db
      .select()
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, msg.id), eq(messageReactions.userId, viewer.id), eq(messageReactions.emoji, emoji)));
    if (existing.length) {
      await deps.db
        .delete(messageReactions)
        .where(and(eq(messageReactions.messageId, msg.id), eq(messageReactions.userId, viewer.id), eq(messageReactions.emoji, emoji)));
    } else {
      await deps.db.insert(messageReactions).values({ messageId: msg.id, userId: viewer.id, emoji });
    }
    const [dto] = await hydrateMessages(deps, [await loadMessage(deps, msg.id)]);
    await deps.realtime.publish(ch.conv(msg.conversationId), 'message:updated', dto);
    return c.json(dto);
  });
