import { and, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  commentSchema,
  createPostSchema,
  hasPermission,
  normalizeSearch,
  paginationSchema,
  pollVoteSchema,
  reactSchema,
  updatePostSchema,
  type CommentDto,
  type PollDto,
  type PostDto,
  type SharedPostDto,
  type Reaction,
} from '@qubedu/shared';
import { comments, follows, groups, hashtagUses, pollOptions, pollVotes, polls, postReactions, posts, savedItems, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { groupRole, loadGroup } from '../lib/access';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms, pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { removeHashtags, syncHashtags } from '../lib/hashtags';
import { checkAchievements } from '../lib/progress';
import { ch } from '../lib/realtime';
import { checkRate } from '../middleware';

const authorCols = {
  authorId: users.id,
  authorDisplayName: users.displayName,
  authorUsername: users.username,
  authorAvatarUrl: users.avatarUrl,
  authorAccountType: users.accountType,
  authorLevel: users.level,
  authorXp: users.xp,
  authorBadge: users.badge,
};

type PostRow = typeof posts.$inferSelect & Record<string, unknown>;
const postSelect = { ...getTableColumns(posts), ...authorCols };

async function canModeratePost(deps: Deps, viewer: AuthUser, post: { groupId: string | null }) {
  if (hasPermission(viewer.role, viewer.permissions, 'content.manage')) return true;
  if (!post.groupId) return false;
  const role = await groupRole(deps.db, post.groupId, viewer.id);
  return role === 'owner' || role === 'admin' || role === 'teacher';
}

export async function hydratePosts(deps: Deps, viewer: AuthUser, rows: PostRow[]): Promise<PostDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const sharedIds = [...new Set(rows.map((r) => r.sharedPostId).filter((x): x is string => !!x))];
  const [mine, saved, pollRows, optionRows, myVotes, tagRows, sharedRows] = await Promise.all([
    deps.db
      .select({ postId: postReactions.postId, reaction: postReactions.reaction })
      .from(postReactions)
      .where(and(inArray(postReactions.postId, ids), eq(postReactions.userId, viewer.id))),
    deps.db
      .select({ refId: savedItems.refId })
      .from(savedItems)
      .where(and(eq(savedItems.ownerId, viewer.id), eq(savedItems.itemType, 'post'), inArray(savedItems.refId, ids))),
    deps.db.select().from(polls).where(inArray(polls.postId, ids)),
    deps.db.select().from(pollOptions).where(inArray(pollOptions.postId, ids)).orderBy(pollOptions.position),
    deps.db
      .select({ postId: pollVotes.postId, optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(and(inArray(pollVotes.postId, ids), eq(pollVotes.userId, viewer.id))),
    deps.db
      .select({ subjectId: hashtagUses.subjectId, tag: hashtagUses.tag })
      .from(hashtagUses)
      .where(and(eq(hashtagUses.subjectType, 'post'), inArray(hashtagUses.subjectId, ids))),
    sharedIds.length
      ? deps.db
          .select({ ...getTableColumns(posts), ...authorCols })
          .from(posts)
          .innerJoin(users, eq(users.id, posts.authorId))
          .where(and(inArray(posts.id, sharedIds), isNull(posts.deletedAt), isNull(posts.groupId)))
      : Promise.resolve([]),
  ]);
  const myReaction = new Map(mine.map((m) => [m.postId, m.reaction as Reaction]));
  const savedSet = new Set(saved.map((s) => s.refId));
  const pollByPost = new Map(pollRows.map((p) => [p.postId, p]));
  const optionsByPost = Map.groupBy(optionRows, (o) => o.postId);
  const votesByPost = Map.groupBy(myVotes, (v) => v.postId);
  const tagsByPost = Map.groupBy(tagRows, (t) => t.subjectId);
  const sharedById = new Map(
    (sharedRows as PostRow[]).map((p) => {
      const dto: SharedPostDto = {
        id: p.id,
        author: toSummary(pickSummary('author', p)),
        text: p.text,
        imageUrl: p.imageUrl,
        createdAt: p.createdAt.getTime(),
        available: true,
      };
      return [p.id, dto] as const;
    }),
  );
  const staff = hasPermission(viewer.role, viewer.permissions, 'content.manage');
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => !!g))];
  const modGroups = new Set<string>();
  for (const gid of groupIds) {
    const role = await groupRole(deps.db, gid, viewer.id);
    if (role === 'owner' || role === 'admin' || role === 'teacher') modGroups.add(gid);
  }
  const now = Date.now();
  return rows.map((r) => {
    const own = r.authorId === viewer.id;
    const mod = staff || (!!r.groupId && modGroups.has(r.groupId));
    const p = pollByPost.get(r.id);
    const poll: PollDto | null = p
      ? {
          multiple: p.multiple,
          endsAt: ms(p.endsAt),
          closed: !!p.endsAt && p.endsAt.getTime() <= now,
          totalVotes: p.totalVotes,
          options: (optionsByPost.get(r.id) ?? []).map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
          myVotes: (votesByPost.get(r.id) ?? []).map((v) => v.optionId),
        }
      : null;
    const sharedId = r.sharedPostId as string | null;
    return {
      id: r.id,
      author: toSummary(pickSummary('author', r)),
      groupId: r.groupId,
      text: r.text,
      imageUrl: r.imageUrl,
      pinned: r.pinned,
      createdAt: r.createdAt.getTime(),
      editedAt: ms(r.editedAt),
      commentCount: r.commentCount,
      reactionCounts: r.reactionCounts as PostDto['reactionCounts'],
      myReaction: myReaction.get(r.id) ?? null,
      saved: savedSet.has(r.id),
      canEdit: own,
      canDelete: own || mod,
      shareCount: r.shareCount as number,
      poll,
      shared: sharedId
        ? (sharedById.get(sharedId) ?? { id: sharedId, author: toSummary(pickSummary('author', r)), text: '', imageUrl: null, createdAt: 0, available: false })
        : null,
      hashtags: (tagsByPost.get(r.id) ?? []).map((t) => t.tag),
    };
  });
}

async function loadPost(deps: Deps, id: string) {
  const [row] = await deps.db
    .select(postSelect)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)));
  if (!row) throw notFound('post_not_found');
  return row as PostRow;
}

/** Group posts are only visible to members of private groups. */
async function assertCanSeePost(deps: Deps, viewer: AuthUser, post: { groupId: string | null }) {
  if (!post.groupId) return;
  const g = await loadGroup(deps.db, post.groupId);
  if (g.privacy === 'private' && !(await groupRole(deps.db, g.id, viewer.id)) && !hasPermission(viewer.role, viewer.permissions, 'content.manage'))
    throw notFound('post_not_found');
}

export const feedQuerySchema = paginationSchema.extend({
  scope: z.enum(['all', 'following', 'mine', 'foryou']).default('all'),
  authorId: z.string().uuid().optional(),
  tag: z.string().trim().min(2).max(40).optional(),
});

/** Engagement-weighted, time-decayed score used by the "For you" feed (HN-style gravity), boosted for followed authors. */
const forYouScore = (viewerId: string) => sql`(
  (coalesce((select sum(value::int) from jsonb_each_text(${posts.reactionCounts})), 0) + 2 * ${posts.commentCount} + 3 * ${posts.shareCount} + 1)::float
  / power(extract(epoch from (now() - ${posts.createdAt})) / 3600.0 + 2, 1.35)
  * (case when ${posts.authorId} in (select ${follows.followeeId} from ${follows} where ${follows.followerId} = ${viewerId}) then 1.6 else 1 end)
)`;

export const postRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, feedQuerySchema);
    const base = [
      isNull(posts.deletedAt),
      isNull(posts.groupId),
      q.scope === 'following'
        ? sql`(${posts.authorId} = ${viewer.id} or ${posts.authorId} in (select ${follows.followeeId} from ${follows} where ${follows.followerId} = ${viewer.id}))`
        : undefined,
      q.scope === 'mine' ? eq(posts.authorId, viewer.id) : undefined,
      q.authorId ? eq(posts.authorId, q.authorId) : undefined,
      q.tag
        ? sql`${posts.id} in (select subject_id from ${hashtagUses} where subject_type = 'post' and tag = ${q.tag.replace(/^#/, '').toLowerCase()})`
        : undefined,
      sql`${posts.authorId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
    ];
    if (q.scope === 'foryou') {
      // Ranked feeds cannot use keyset pagination; page by offset over a bounded recent window.
      const offset = Math.max(0, Math.min(500, Number.parseInt(q.cursor ?? '0', 10) || 0));
      const rows = (await deps.db
        .select(postSelect)
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
        .where(and(...base, sql`${posts.createdAt} > now() - interval '14 days'`))
        .orderBy(desc(forYouScore(viewer.id)), desc(posts.id))
        .limit(q.limit + 1)
        .offset(offset)) as PostRow[];
      const items = rows.slice(0, q.limit);
      return c.json({
        items: await hydratePosts(deps, viewer, items),
        nextCursor: rows.length > q.limit && offset + q.limit < 500 ? String(offset + q.limit) : null,
      });
    }
    const cursor = decodeCursor(q.cursor);
    const rows = (await deps.db
      .select(postSelect)
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(and(...base, cursor ? sql`(${posts.createdAt}, ${posts.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(q.limit + 1)) as PostRow[];
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    return c.json({ items: await hydratePosts(deps, viewer, page.items), nextCursor: page.nextCursor });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'post', limit: 30, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, createPostSchema);
    if (deps.env.REQUIRE_EMAIL_VERIFICATION && !viewer.emailVerified) throw forbidden('email_not_verified');
    if (input.groupId) {
      await loadGroup(deps.db, input.groupId);
      const role = await groupRole(deps.db, input.groupId, viewer.id);
      if (!role) throw forbidden('not_a_member');
    }
    let original: PostRow | null = null;
    if (input.sharedPostId) {
      original = await loadPost(deps, input.sharedPostId);
      if (original.groupId) throw badRequest('cannot_share_group_post');
      // Share the original, never a chain of shares.
      if (original.sharedPostId) original = await loadPost(deps, original.sharedPostId as string);
    }
    const row = await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(posts)
        .values({
          authorId: viewer.id,
          groupId: input.groupId ?? null,
          text: input.text,
          searchText: normalizeSearch(input.text),
          imageUrl: input.imageUrl ?? null,
          sharedPostId: original?.id ?? null,
        })
        .returning({ id: posts.id });
      if (input.poll) {
        await tx.insert(polls).values({
          postId: created!.id,
          multiple: input.poll.multiple,
          endsAt: input.poll.durationHours ? new Date(Date.now() + input.poll.durationHours * 3_600_000) : null,
        });
        await tx.insert(pollOptions).values(input.poll.options.map((text, position) => ({ postId: created!.id, text, position })));
      }
      if (original)
        await tx
          .update(posts)
          .set({ shareCount: sql`${posts.shareCount} + 1` })
          .where(eq(posts.id, original.id));
      return created!;
    });
    await syncHashtags(deps.db, 'post', row.id, viewer.id, input.text);
    if (original)
      await notify(deps, {
        userId: original.authorId,
        type: 'share',
        icon: 'share-2',
        actorId: viewer.id,
        link: `/post/${row.id}`,
        data: { name: viewer.displayName, postId: row.id },
        pref: 'reactions',
      });
    if (input.groupId) {
      await deps.db
        .update(groups)
        .set({ postCount: sql`${groups.postCount} + 1` })
        .where(eq(groups.id, input.groupId));
      await deps.realtime.publish(ch.group(input.groupId), 'post:new', { id: row.id }, viewer.id);
    }
    const newAchievements = await checkAchievements(deps.db, viewer.id);
    const [dto] = await hydratePosts(deps, viewer, [await loadPost(deps, row.id)]);
    return c.json({ ...dto!, newAchievements }, 201);
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    await assertCanSeePost(deps, viewer, post);
    const [dto] = await hydratePosts(deps, viewer, [post]);
    return c.json(dto);
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    if (post.authorId !== viewer.id) throw forbidden();
    const { text } = await body(c, updatePostSchema);
    await deps.db
      .update(posts)
      .set({ text, searchText: normalizeSearch(text), editedAt: new Date() })
      .where(eq(posts.id, post.id));
    await syncHashtags(deps.db, 'post', post.id, post.authorId, text);
    const [dto] = await hydratePosts(deps, viewer, [await loadPost(deps, post.id)]);
    return c.json(dto);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    if (post.authorId !== viewer.id && !(await canModeratePost(deps, viewer, post))) throw forbidden();
    await deps.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
    await removeHashtags(deps.db, 'post', post.id);
    if (post.groupId)
      await deps.db
        .update(groups)
        .set({ postCount: sql`greatest(${groups.postCount} - 1, 0)` })
        .where(eq(groups.id, post.groupId));
    return c.json({ ok: true });
  })
  .post('/:id/pin', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    if (!post.groupId || !(await canModeratePost(deps, viewer, post))) throw forbidden();
    const { pinned } = await body(c, z.object({ pinned: z.boolean() }));
    await deps.db.update(posts).set({ pinned }).where(eq(posts.id, post.id));
    return c.json({ pinned });
  })
  .put('/:id/vote', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'vote', limit: 60, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    await assertCanSeePost(deps, viewer, post);
    const { optionIds } = await body(c, pollVoteSchema);
    await deps.db.transaction(async (tx) => {
      const [poll] = await tx.select().from(polls).where(eq(polls.postId, post.id)).for('update');
      if (!poll) throw notFound('poll_not_found');
      if (poll.endsAt && poll.endsAt.getTime() <= Date.now()) throw conflict('poll_closed');
      const unique = [...new Set(optionIds)];
      if (!poll.multiple && unique.length > 1) throw badRequest('single_choice_poll');
      const valid = await tx
        .select({ id: pollOptions.id })
        .from(pollOptions)
        .where(and(eq(pollOptions.postId, post.id), inArray(pollOptions.id, unique)));
      if (valid.length !== unique.length) throw badRequest('invalid_option');
      const already = await tx
        .select({ id: pollVotes.optionId })
        .from(pollVotes)
        .where(and(eq(pollVotes.postId, post.id), eq(pollVotes.userId, viewer.id)));
      if (already.length) throw conflict('already_voted');
      await tx.insert(pollVotes).values(unique.map((optionId) => ({ postId: post.id, optionId, userId: viewer.id })));
      await tx
        .update(pollOptions)
        .set({ votes: sql`${pollOptions.votes} + 1` })
        .where(inArray(pollOptions.id, unique));
      await tx
        .update(polls)
        .set({ totalVotes: sql`${polls.totalVotes} + 1` })
        .where(eq(polls.postId, post.id));
    });
    const [dto] = await hydratePosts(deps, viewer, [await loadPost(deps, post.id)]);
    return c.json(dto);
  })
  .put('/:id/reaction', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'react', limit: 120, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    await assertCanSeePost(deps, viewer, post);
    const { reaction } = await body(c, reactSchema);
    const counts = await deps.db.transaction(async (tx) => {
      const [prev] = await tx
        .select({ reaction: postReactions.reaction })
        .from(postReactions)
        .where(and(eq(postReactions.postId, post.id), eq(postReactions.userId, viewer.id)))
        .for('update');
      if (reaction) {
        await tx
          .insert(postReactions)
          .values({ postId: post.id, userId: viewer.id, reaction })
          .onConflictDoUpdate({ target: [postReactions.postId, postReactions.userId], set: { reaction } });
      } else {
        await tx.delete(postReactions).where(and(eq(postReactions.postId, post.id), eq(postReactions.userId, viewer.id)));
      }
      const agg = await tx
        .select({ reaction: postReactions.reaction, n: sql<number>`count(*)::int` })
        .from(postReactions)
        .where(eq(postReactions.postId, post.id))
        .groupBy(postReactions.reaction);
      const next = Object.fromEntries(agg.map((a) => [a.reaction, a.n]));
      await tx.update(posts).set({ reactionCounts: next }).where(eq(posts.id, post.id));
      return { next, isNew: !prev && !!reaction };
    });
    if (counts.isNew)
      await notify(deps, {
        userId: post.authorId,
        type: 'reaction',
        icon: 'heart',
        actorId: viewer.id,
        link: post.groupId ? `/groups/${post.groupId}?post=${post.id}` : `/feed?post=${post.id}`,
        data: { name: viewer.displayName, reaction, postId: post.id },
        pref: 'reactions',
      });
    return c.json({ reactionCounts: counts.next, myReaction: reaction });
  })
  .get('/:id/comments', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    await assertCanSeePost(deps, viewer, post);
    const q = query(c, paginationSchema);
    const cursor = decodeCursor(q.cursor);
    const rows = await deps.db
      .select({ id: comments.id, postId: comments.postId, text: comments.text, createdAt: comments.createdAt, ...authorCols })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(
        and(
          eq(comments.postId, post.id),
          isNull(comments.deletedAt),
          cursor ? sql`(${comments.createdAt}, ${comments.id}) > (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(comments.createdAt, comments.id)
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    const mod = await canModeratePost(deps, viewer, post);
    const items: CommentDto[] = page.items.map((r) => ({
      id: r.id,
      postId: r.postId,
      author: toSummary(pickSummary('author', r)),
      text: r.text,
      createdAt: r.createdAt.getTime(),
      canDelete: r.authorId === viewer.id || post.authorId === viewer.id || mod,
    }));
    return c.json({ items, nextCursor: page.nextCursor });
  })
  .post('/:id/comments', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'comment', limit: 60, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    await assertCanSeePost(deps, viewer, post);
    if (post.groupId && !(await groupRole(deps.db, post.groupId, viewer.id))) throw forbidden('not_a_member');
    const { text } = await body(c, commentSchema);
    const [row] = await deps.db.insert(comments).values({ postId: post.id, authorId: viewer.id, text }).returning();
    await deps.db
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
      .where(eq(posts.id, post.id));
    await notify(deps, {
      userId: post.authorId,
      type: 'comment',
      icon: 'message-square',
      actorId: viewer.id,
      link: post.groupId ? `/groups/${post.groupId}?post=${post.id}` : `/feed?post=${post.id}`,
      data: { name: viewer.displayName, postId: post.id, preview: text.slice(0, 80) },
      pref: 'comments',
    });
    const [me] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, viewer.id));
    const dto: CommentDto = { id: row!.id, postId: post.id, author: toSummary(me!), text, createdAt: row!.createdAt.getTime(), canDelete: true };
    return c.json(dto, 201);
  })
  .delete('/:id/comments/:commentId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    const [comment] = await deps.db
      .select()
      .from(comments)
      .where(and(eq(comments.id, param(c, 'commentId')), eq(comments.postId, post.id), isNull(comments.deletedAt)));
    if (!comment) throw notFound('comment_not_found');
    const allowed = comment.authorId === viewer.id || post.authorId === viewer.id || (await canModeratePost(deps, viewer, post));
    if (!allowed) throw forbidden();
    await deps.db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, comment.id));
    await deps.db
      .update(posts)
      .set({ commentCount: sql`greatest(${posts.commentCount} - 1, 0)` })
      .where(eq(posts.id, post.id));
    return c.json({ ok: true });
  });

/** Group feed: pinned posts first (on the first page only), then newest regular posts. */
export async function groupPostsPage(deps: Deps, viewer: AuthUser, groupId: string, limit: number, cursorRaw: string | undefined) {
  const cursor = decodeCursor(cursorRaw);
  const pinned = cursor
    ? []
    : ((await deps.db
        .select(postSelect)
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
        .where(and(eq(posts.groupId, groupId), isNull(posts.deletedAt), eq(posts.pinned, true)))
        .orderBy(desc(posts.createdAt))
        .limit(20)) as PostRow[]);
  const rows = (await deps.db
    .select(postSelect)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(
      and(
        eq(posts.groupId, groupId),
        isNull(posts.deletedAt),
        eq(posts.pinned, false),
        cursor ? sql`(${posts.createdAt}, ${posts.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1)) as PostRow[];
  const page = pageOf(rows, limit, (r) => ({ t: r.createdAt, id: r.id }));
  return { items: await hydratePosts(deps, viewer, [...pinned, ...page.items]), nextCursor: page.nextCursor };
}
