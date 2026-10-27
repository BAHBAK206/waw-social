import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ExploreDto, HashtagPageDto, TrendingTagDto } from '@qubedu/shared';
import { events, hashtagUses, posts, users, videos } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { badRequest } from '../lib/errors';
import { query, requireUser } from '../lib/http';
import { summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { hydrateEvents } from './events';
import { hydratePosts } from './posts';
import { hydrateVideos, videoBase, type VideoRow } from './videos';

const TAG = /^[\p{L}\p{N}_]{2,40}$/u;
const HOUR = 3_600_000;

/** Tags used most in the last `hours`, with growth against the previous window of equal length. */
export async function trendingTags(deps: Deps, hours = 72, limit = 12): Promise<TrendingTagDto[]> {
  const now = Date.now();
  const recent = new Date(now - hours * HOUR);
  const previous = new Date(now - 2 * hours * HOUR);
  const rows = await deps.db.execute<{ tag: string; recent: number; prev: number }>(sql`
    select tag,
      count(*) filter (where created_at >= ${recent.toISOString()})::int as recent,
      count(*) filter (where created_at < ${recent.toISOString()})::int as prev
    from hashtag_uses
    where created_at >= ${previous.toISOString()}
    group by tag
    having count(*) filter (where created_at >= ${recent.toISOString()}) > 0
    order by recent desc, tag
    limit ${limit}`);
  return rows.map((r) => ({
    tag: r.tag,
    count: r.recent,
    growth: r.prev === 0 ? null : Math.round(((r.recent - r.prev) / r.prev) * 100),
  }));
}

export const exploreRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const now = new Date();
    const [tags, videoRows, postRows, peopleRows, eventRows] = await Promise.all([
      trendingTags(deps, 72, 10),
      videoBase(deps)
        .where(
          and(
            isNull(videos.deletedAt),
            eq(videos.visibility, 'public'),
            sql`${videos.ownerId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
          ),
        )
        .orderBy(desc(sql`(select count(*) from video_views vv where vv.video_id = ${videos.id} and vv.day >= (current_date - 3))`), desc(videos.likes))
        .limit(8),
      deps.db
        .select({
          post: posts,
          authorId: users.id,
          authorDisplayName: users.displayName,
          authorUsername: users.username,
          authorAvatarUrl: users.avatarUrl,
          authorAccountType: users.accountType,
          authorLevel: users.level,
          authorXp: users.xp,
          authorBadge: users.badge,
        })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
        .where(
          and(
            isNull(posts.deletedAt),
            isNull(posts.groupId),
            gt(posts.createdAt, new Date(now.getTime() - 3 * 24 * HOUR)),
            sql`${posts.authorId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
          ),
        )
        .orderBy(
          desc(
            sql`(coalesce((select sum(value::int) from jsonb_each_text(${posts.reactionCounts})), 0) + 2 * ${posts.commentCount} + 3 * ${posts.shareCount})`,
          ),
        )
        .limit(6),
      deps.db
        .select({ ...summaryColumns, followers: sql<number>`(select count(*)::int from follows where followee_id = ${users.id})` })
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            sql`${users.id} <> ${viewer.id}`,
            sql`${users.id} not in (select followee_id from follows where follower_id = ${viewer.id})`,
            sql`${users.id} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
          ),
        )
        .orderBy(desc(sql`(select count(*) from follows where followee_id = ${users.id})`), desc(users.xp))
        .limit(8),
      deps.db
        .select({
          ev: events,
          hostUserId: users.id,
          hostDisplayName: users.displayName,
          hostUsername: users.username,
          hostAvatarUrl: users.avatarUrl,
          hostAccountType: users.accountType,
          hostLevel: users.level,
          hostXp: users.xp,
          hostBadge: users.badge,
        })
        .from(events)
        .innerJoin(users, eq(users.id, events.hostId))
        .where(and(isNull(events.deletedAt), isNull(events.groupId), gt(events.startsAt, now)))
        .orderBy(events.startsAt)
        .limit(4),
    ]);
    const body: ExploreDto = {
      tags,
      videos: await hydrateVideos(deps, viewer, videoRows as VideoRow[]),
      posts: await hydratePosts(deps, viewer, postRows.map((r) => ({ ...r.post, ...r })) as never),
      people: await withOnline(deps.kv, peopleRows.map(toSummary)),
      events: await hydrateEvents(deps, viewer, eventRows.map((r) => ({ ...r.ev, ...r })) as never),
    };
    return c.json(body);
  })
  .get('/tags', async (c) => {
    requireUser(c);
    const { hours, limit } = query(
      c,
      z.object({
        hours: z.coerce
          .number()
          .int()
          .min(1)
          .max(24 * 14)
          .default(72),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
    );
    return c.json({ items: await trendingTags(c.get('deps'), hours, limit) });
  })
  .get('/tags/suggest', async (c) => {
    requireUser(c);
    const { q } = query(c, z.object({ q: z.string().trim().max(40).default('') }));
    const prefix = q.replace(/^#/, '').toLowerCase();
    if (prefix.length < 1) return c.json({ items: [] });
    const rows = await c.get('deps').db.execute<{ tag: string; n: number }>(sql`
      select tag, count(*)::int as n from hashtag_uses
      where tag like ${prefix.replace(/[%_\\]/g, '\\$&') + '%'}
      group by tag order by n desc, tag limit 8`);
    return c.json({ items: rows.map((r) => ({ tag: r.tag, count: r.n })) });
  })
  .get('/tag/:tag', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const tag = decodeURIComponent(c.req.param('tag') ?? '')
      .replace(/^#/, '')
      .toLowerCase();
    if (!TAG.test(tag)) throw badRequest('invalid_tag');
    const [counts] = await deps.db
      .select({
        postCount: sql<number>`count(*) filter (where ${hashtagUses.subjectType} = 'post')::int`,
        videoCount: sql<number>`count(*) filter (where ${hashtagUses.subjectType} = 'video')::int`,
      })
      .from(hashtagUses)
      .where(eq(hashtagUses.tag, tag));
    const postRows = await deps.db
      .select({
        post: posts,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorUsername: users.username,
        authorAvatarUrl: users.avatarUrl,
        authorAccountType: users.accountType,
        authorLevel: users.level,
        authorXp: users.xp,
        authorBadge: users.badge,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(
        and(
          isNull(posts.deletedAt),
          isNull(posts.groupId),
          sql`${posts.id} in (select subject_id from hashtag_uses where subject_type = 'post' and tag = ${tag})`,
          sql`${posts.authorId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})`,
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(20);
    const videoRows = await videoBase(deps)
      .where(
        and(
          isNull(videos.deletedAt),
          eq(videos.visibility, 'public'),
          sql`${videos.id} in (select subject_id from hashtag_uses where subject_type = 'video' and tag = ${tag})`,
        ),
      )
      .orderBy(desc(videos.views))
      .limit(20);
    const dto: HashtagPageDto = {
      tag,
      postCount: counts?.postCount ?? 0,
      videoCount: counts?.videoCount ?? 0,
      posts: await hydratePosts(deps, viewer, postRows.map((r) => ({ ...r.post, ...r })) as never),
      videos: await hydrateVideos(deps, viewer, videoRows as VideoRow[]),
    };
    return c.json(dto);
  });
