import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { LIMITS, storyInputSchema, storyReactSchema, type StoryDto, type StoryGroupDto, type StoryViewerDto } from '@qubedu/shared';
import { z } from 'zod';
import { stories, storyViews, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { requireControl } from '../lib/minors';
import { pickSummary, summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { assertOwnUpload } from './videos';

const authorCols = {
  authorId: users.id,
  authorDisplayName: users.displayName,
  authorUsername: users.username,
  authorAvatarUrl: users.avatarUrl,
  authorAccountType: users.accountType,
  authorTeacherVerifiedAt: users.teacherVerifiedAt,
  authorLevel: users.level,
  authorXp: users.xp,
  authorBadge: users.badge,
};

const active = (now = new Date()) => and(isNull(stories.deletedAt), gt(stories.expiresAt, now));

function toStory(r: typeof stories.$inferSelect, seen: { reaction: string | null } | undefined, own: boolean): StoryDto {
  return {
    id: r.id,
    mediaKind: r.mediaKind,
    mediaUrl: r.mediaUrl,
    text: r.text,
    bgColor: r.bgColor,
    durationSec: r.durationSec,
    createdAt: r.createdAt.getTime(),
    expiresAt: r.expiresAt.getTime(),
    viewed: own || !!seen,
    viewCount: own ? r.viewCount : 0,
    myReaction: seen?.reaction ?? null,
  };
}

async function loadActive(c: { get: (k: 'deps') => Deps }, id: string) {
  const [row] = await c
    .get('deps')
    .db.select()
    .from(stories)
    .where(and(eq(stories.id, id), active()));
  if (!row) throw notFound('story_not_found');
  return row;
}

export const storyRoutes = new Hono<AppEnv>()
  /** Story tray: your own first, then people you follow (unseen before seen). */
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db
      .select({ story: stories, ...authorCols, seen: storyViews.viewerId, reaction: storyViews.reaction })
      .from(stories)
      .innerJoin(users, eq(users.id, stories.authorId))
      .leftJoin(storyViews, and(eq(storyViews.storyId, stories.id), eq(storyViews.viewerId, viewer.id)))
      .where(
        and(
          active(),
          isNull(users.deletedAt),
          sql`(${stories.authorId} = ${viewer.id} or ${stories.authorId} in (select followee_id from follows where follower_id = ${viewer.id}))`,
          sql`${stories.authorId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
        ),
      )
      .orderBy(asc(stories.createdAt))
      .limit(500);
    const groups = new Map<string, StoryGroupDto>();
    for (const r of rows) {
      const own = r.story.authorId === viewer.id;
      let g = groups.get(r.story.authorId);
      if (!g) {
        g = { author: toSummary(pickSummary('author', r)), stories: [], allViewed: true, isMine: own };
        groups.set(r.story.authorId, g);
      }
      const dto = toStory(r.story, r.seen ? { reaction: r.reaction } : undefined, own);
      g.stories.push(dto);
      if (!dto.viewed) g.allViewed = false;
    }
    const list = [...groups.values()].sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
      return (b.stories.at(-1)?.createdAt ?? 0) - (a.stories.at(-1)?.createdAt ?? 0);
    });
    const authors = await withOnline(
      deps.kv,
      list.map((g) => g.author),
    );
    list.forEach((g, i) => (g.author = authors[i]!));
    return c.json({ items: list });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'story', limit: 30, windowSec: 24 * 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, storyInputSchema);
    await requireControl(deps.db, viewer.id, 'publicPosts');
    if (input.mediaUrl) await assertOwnUpload(deps, viewer, input.mediaUrl, input.mediaKind === 'video' ? 'video/' : 'image/');
    const [row] = await deps.db
      .insert(stories)
      .values({
        authorId: viewer.id,
        mediaKind: input.mediaKind,
        mediaUrl: input.mediaKind === 'text' ? null : (input.mediaUrl ?? null),
        text: input.text,
        bgColor: input.bgColor,
        durationSec: input.mediaKind === 'video' ? Math.min(input.durationSec, 30) : input.durationSec,
        expiresAt: new Date(Date.now() + LIMITS.storyHours * 3_600_000),
      })
      .returning();
    return c.json(toStory(row!, undefined, true), 201);
  })
  .post('/:id/view', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const story = await loadActive(c, param(c, 'id'));
    if (story.authorId === viewer.id) return c.json({ ok: true });
    const inserted = await deps.db
      .insert(storyViews)
      .values({ storyId: story.id, viewerId: viewer.id })
      .onConflictDoNothing()
      .returning({ s: storyViews.storyId });
    if (inserted.length)
      await deps.db
        .update(stories)
        .set({ viewCount: sql`${stories.viewCount} + 1` })
        .where(eq(stories.id, story.id));
    return c.json({ ok: true });
  })
  .put('/:id/reaction', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const story = await loadActive(c, param(c, 'id'));
    if (story.authorId === viewer.id) throw badRequest('cannot_react_own_story');
    const { emoji } = await body(c, z.object({ emoji: storyReactSchema.shape.emoji.nullable() }));
    await deps.db
      .insert(storyViews)
      .values({ storyId: story.id, viewerId: viewer.id, reaction: emoji })
      .onConflictDoUpdate({ target: [storyViews.storyId, storyViews.viewerId], set: { reaction: emoji } });
    if (emoji)
      await notify(deps, {
        userId: story.authorId,
        type: 'story_reaction',
        icon: 'heart',
        actorId: viewer.id,
        link: '/',
        data: { name: viewer.displayName, emoji },
        pref: 'reactions',
      });
    return c.json({ myReaction: emoji });
  })
  .get('/:id/viewers', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const story = await loadActive(c, param(c, 'id'));
    if (story.authorId !== viewer.id) throw forbidden();
    const rows = await deps.db
      .select({ viewedAt: storyViews.viewedAt, reaction: storyViews.reaction, ...summaryColumns })
      .from(storyViews)
      .innerJoin(users, eq(users.id, storyViews.viewerId))
      .where(eq(storyViews.storyId, story.id))
      .orderBy(desc(storyViews.viewedAt))
      .limit(200);
    const items: StoryViewerDto[] = rows.map((r) => ({ user: toSummary(r), viewedAt: r.viewedAt.getTime(), reaction: r.reaction }));
    return c.json({ items });
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const story = await loadActive(c, param(c, 'id'));
    const staff = (viewer as AuthUser).role !== 'user';
    if (story.authorId !== viewer.id && !staff) throw forbidden();
    await deps.db.update(stories).set({ deletedAt: new Date() }).where(eq(stories.id, story.id));
    return c.json({ ok: true });
  });
