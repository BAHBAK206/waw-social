import { and, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  commentSchema,
  createPostSchema,
  hasPermission,
  normalizeSearch,
  paginationSchema,
  reactSchema,
  updatePostSchema,
  type CommentDto,
  type PostDto,
  type Reaction,
} from '@qubedu/shared';
import { comments, follows, groups, postReactions, posts, savedItems, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { groupRole, loadGroup } from '../lib/access';
import { decodeCursor, pageOf } from '../lib/cursor';
import { forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { ms, pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
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
  const [mine, saved] = await Promise.all([
    deps.db
      .select({ postId: postReactions.postId, reaction: postReactions.reaction })
      .from(postReactions)
      .where(and(inArray(postReactions.postId, ids), eq(postReactions.userId, viewer.id))),
    deps.db
      .select({ refId: savedItems.refId })
      .from(savedItems)
      .where(and(eq(savedItems.ownerId, viewer.id), eq(savedItems.itemType, 'post'), inArray(savedItems.refId, ids))),
  ]);
  const myReaction = new Map(mine.map((m) => [m.postId, m.reaction as Reaction]));
  const savedSet = new Set(saved.map((s) => s.refId));
  const staff = hasPermission(viewer.role, viewer.permissions, 'content.manage');
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => !!g))];
  const modGroups = new Set<string>();
  for (const gid of groupIds) {
    const role = await groupRole(deps.db, gid, viewer.id);
    if (role === 'owner' || role === 'admin' || role === 'teacher') modGroups.add(gid);
  }
  return rows.map((r) => {
    const own = r.authorId === viewer.id;
    const mod = staff || (!!r.groupId && modGroups.has(r.groupId));
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
  scope: z.enum(['all', 'following', 'mine']).default('all'),
  authorId: z.string().uuid().optional(),
});

export const postRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, feedQuerySchema);
    const cursor = decodeCursor(q.cursor);
    const where = and(
      isNull(posts.deletedAt),
      isNull(posts.groupId),
      q.scope === 'following'
        ? sql`(${posts.authorId} = ${viewer.id} or ${posts.authorId} in (select ${follows.followeeId} from ${follows} where ${follows.followerId} = ${viewer.id}))`
        : undefined,
      q.scope === 'mine' ? eq(posts.authorId, viewer.id) : undefined,
      q.authorId ? eq(posts.authorId, q.authorId) : undefined,
      sql`${posts.authorId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
      cursor ? sql`(${posts.createdAt}, ${posts.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
    );
    const rows = (await deps.db
      .select(postSelect)
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(where)
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
    const [row] = await deps.db
      .insert(posts)
      .values({
        authorId: viewer.id,
        groupId: input.groupId ?? null,
        text: input.text,
        searchText: normalizeSearch(input.text),
        imageUrl: input.imageUrl ?? null,
      })
      .returning({ id: posts.id });
    if (input.groupId) {
      await deps.db
        .update(groups)
        .set({ postCount: sql`${groups.postCount} + 1` })
        .where(eq(groups.id, input.groupId));
      await deps.realtime.publish(ch.group(input.groupId), 'post:new', { id: row!.id }, viewer.id);
    }
    const newAchievements = await checkAchievements(deps.db, viewer.id);
    const [dto] = await hydratePosts(deps, viewer, [await loadPost(deps, row!.id)]);
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
    const [dto] = await hydratePosts(deps, viewer, [await loadPost(deps, post.id)]);
    return c.json(dto);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const post = await loadPost(deps, param(c, 'id'));
    if (post.authorId !== viewer.id && !(await canModeratePost(deps, viewer, post))) throw forbidden();
    await deps.db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
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
