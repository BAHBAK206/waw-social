import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { paginationSchema, type StudioOverviewDto, type VideoChannelDto, type VideoDto } from '@qubedu/shared';
import { follows, users, videoComments, videos } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { notFound } from '../lib/errors';
import { param, query, requireUser } from '../lib/http';
import { buildProfile } from '../lib/profile';
import { playlistsOf } from './playlists';
import { hydrateVideos, videoBase, type VideoRow } from './videos';

export const channelRoutes = new Hono<AppEnv>().get('/:userId', async (c) => {
  const viewer = c.get('user');
  const deps = c.get('deps');
  const id = param(c, 'userId');
  const [row] = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
  if (!row) throw notFound('user_not_found');
  const visible = and(eq(videos.ownerId, id), isNull(videos.deletedAt), viewer?.id === id ? undefined : eq(videos.visibility, 'public'));
  const [stats] = await deps.db
    .select({
      videoCount: sql<number>`count(*) filter (where ${videos.kind} = 'video')::int`,
      shortCount: sql<number>`count(*) filter (where ${videos.kind} = 'short')::int`,
      totalViews: sql<number>`coalesce(sum(${videos.views}), 0)::int`,
    })
    .from(videos)
    .where(visible);
  const [{ subscribers } = { subscribers: 0 }] = await deps.db
    .select({ subscribers: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeId, id));
  const [sub] = viewer
    ? await deps.db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, id)))
    : [];
  const dto: VideoChannelDto = {
    user: await buildProfile(deps, row, viewer?.id ?? null),
    subscribers,
    videoCount: stats?.videoCount ?? 0,
    shortCount: stats?.shortCount ?? 0,
    totalViews: stats?.totalViews ?? 0,
    isSubscribed: !!sub,
    playlists: await playlistsOf(deps, viewer, id),
  };
  return c.json(dto);
});

/** Creator Studio: the signed-in user's own channel analytics and video manager. */
export const studioRoutes = new Hono<AppEnv>()
  .get('/overview', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [t] = await deps.db
      .select({
        videos: sql<number>`count(*)::int`,
        views: sql<number>`coalesce(sum(${videos.views}), 0)::int`,
        likes: sql<number>`coalesce(sum(${videos.likes}), 0)::int`,
        comments: sql<number>`coalesce(sum(${videos.commentCount}), 0)::int`,
        watchSeconds: sql<number>`coalesce(sum(${videos.watchSeconds}), 0)::bigint::int`,
      })
      .from(videos)
      .where(and(eq(videos.ownerId, viewer.id), isNull(videos.deletedAt)));
    const [{ subscribers } = { subscribers: 0 }] = await deps.db
      .select({ subscribers: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followeeId, viewer.id));
    const byDay = await deps.db.execute<{ day: string; views: number }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(count(vv.video_id), 0)::int as views
      from generate_series(current_date - 27, current_date, interval '1 day') as d(day)
      left join (
        select vv.day, vv.video_id from video_views vv join videos v on v.id = vv.video_id
        where v.owner_id = ${viewer.id} and v.deleted_at is null
      ) vv on vv.day = d.day::date
      group by d.day order by d.day`);
    const top = await deps.db
      .select({ id: videos.id, title: videos.title, thumbnailUrl: videos.thumbnailUrl, views: videos.views, likes: videos.likes, kind: videos.kind })
      .from(videos)
      .where(and(eq(videos.ownerId, viewer.id), isNull(videos.deletedAt)))
      .orderBy(desc(videos.views))
      .limit(5);
    const dto: StudioOverviewDto = {
      totals: {
        videos: t?.videos ?? 0,
        views: t?.views ?? 0,
        likes: t?.likes ?? 0,
        comments: t?.comments ?? 0,
        subscribers,
        watchMinutes: Math.round((t?.watchSeconds ?? 0) / 60),
      },
      viewsByDay: byDay.map((r) => ({ day: r.day, views: r.views })),
      topVideos: top,
    };
    return c.json(dto);
  })
  .get('/videos', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, paginationSchema);
    const cursor = decodeCursor(q.cursor);
    const rows = (await videoBase(deps)
      .where(
        and(
          eq(videos.ownerId, viewer.id),
          isNull(videos.deletedAt),
          cursor ? sql`(${videos.createdAt}, ${videos.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(videos.createdAt), desc(videos.id))
      .limit(q.limit + 1)) as VideoRow[];
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    return c.json({ items: (await hydrateVideos(deps, viewer, page.items)) satisfies VideoDto[], nextCursor: page.nextCursor });
  })
  .get('/comments', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db
      .select({
        id: videoComments.id,
        videoId: videoComments.videoId,
        text: videoComments.text,
        createdAt: videoComments.createdAt,
        title: videos.title,
        author: users.displayName,
      })
      .from(videoComments)
      .innerJoin(videos, eq(videos.id, videoComments.videoId))
      .innerJoin(users, eq(users.id, videoComments.authorId))
      .where(and(eq(videos.ownerId, viewer.id), isNull(videoComments.deletedAt), isNull(videos.deletedAt)))
      .orderBy(desc(videoComments.createdAt))
      .limit(30);
    return c.json({ items: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
  });
