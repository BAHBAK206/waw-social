import { and, desc, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  dayKey,
  hasPermission,
  normalizeSearch,
  paginationSchema,
  videoCommentSchema,
  videoInputSchema,
  videoListQuerySchema,
  videoProgressSchema,
  videoReactSchema,
  videoNoteSchema,
  videoUpdateSchema,
  type Page,
  type VideoCommentDto,
  type VideoDto,
  type WatchHistoryItem,
} from '@qubedu/shared';
import {
  eduMaterials,
  eduSections,
  follows,
  quizzes,
  uploads,
  users,
  videoCommentLikes,
  videoComments,
  videoNotes,
  videoReactions,
  videoViews,
  videos,
  watchHistory,
  watchLater,
} from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { sha256 } from '../lib/crypto';
import { decodeCursor, pageOf } from '../lib/cursor';
import { awardXp, creditStudy, xpEarnedToday } from '../lib/progress';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { removeHashtags, syncHashtags } from '../lib/hashtags';
import { body, clientIp, param, query, requireUser } from '../lib/http';
import { pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { refreshVideoSearchText, videoSearchFilter } from '../lib/videoSearch';
import { checkRate } from '../middleware';

export const ownerCols = {
  ownerId: users.id,
  ownerDisplayName: users.displayName,
  ownerUsername: users.username,
  ownerAvatarUrl: users.avatarUrl,
  ownerAccountType: users.accountType,
  ownerLevel: users.level,
  ownerXp: users.xp,
  ownerBadge: users.badge,
};

export const videoSelect = {
  ...getTableColumns(videos),
  ...ownerCols,
  sectionName: eduSections.name,
  materialName: eduMaterials.name,
  subscribers: sql<number>`(select count(*)::int from follows where followee_id = ${videos.ownerId})`,
};

export type VideoRow = typeof videos.$inferSelect & {
  sectionName: string | null;
  materialName: string | null;
  subscribers: number;
} & Record<string, unknown>;

export const videoBase = (deps: Deps) =>
  deps.db
    .select(videoSelect)
    .from(videos)
    .innerJoin(users, eq(users.id, videos.ownerId))
    .leftJoin(eduSections, eq(eduSections.id, videos.sectionId))
    .leftJoin(eduMaterials, eq(eduMaterials.id, videos.materialId));

/** XP for finishing a lesson you watched, with a daily cap so it rewards learning rather than skimming. */
const LESSON_XP = 5;
const LESSON_XP_DAILY_CAP = 40;

const isStaff = (viewer: AuthUser | null) => !!viewer && hasPermission(viewer.role, viewer.permissions, 'content.manage');

/** Lists show public videos (plus the viewer's own); unlisted ones are reachable only by direct link. */
function listVisibility(viewer: AuthUser | null): SQL {
  const base = viewer ? or(eq(videos.visibility, 'public'), eq(videos.ownerId, viewer.id)) : eq(videos.visibility, 'public');
  return and(
    isNull(videos.deletedAt),
    base,
    viewer ? sql`${videos.ownerId} not in (select blocked_id from blocks where blocker_id = ${viewer.id})` : undefined,
  )!;
}

export async function hydrateVideos(deps: Deps, viewer: AuthUser | null, rows: VideoRow[]): Promise<VideoDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const owners = [...new Set(rows.map((r) => r.ownerId as string))];
  const [reactions, later, progress, subs] = viewer
    ? await Promise.all([
        deps.db
          .select({ videoId: videoReactions.videoId, value: videoReactions.value })
          .from(videoReactions)
          .where(and(eq(videoReactions.userId, viewer.id), inArray(videoReactions.videoId, ids))),
        deps.db
          .select({ videoId: watchLater.videoId })
          .from(watchLater)
          .where(and(eq(watchLater.userId, viewer.id), inArray(watchLater.videoId, ids))),
        deps.db
          .select({ videoId: watchHistory.videoId, progressSec: watchHistory.progressSec, completed: watchHistory.completed })
          .from(watchHistory)
          .where(and(eq(watchHistory.userId, viewer.id), inArray(watchHistory.videoId, ids))),
        deps.db
          .select({ id: follows.followeeId })
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), inArray(follows.followeeId, owners))),
      ])
    : [[], [], [], []];
  const quizIds = [...new Set(rows.map((r) => r.quizId as string | null).filter((x): x is string => !!x))];
  const quizRows = quizIds.length
    ? await deps.db
        .select({ id: quizzes.id, title: quizzes.title, questionCount: quizzes.questionCount })
        .from(quizzes)
        .where(and(inArray(quizzes.id, quizIds), isNull(quizzes.deletedAt), eq(quizzes.published, true)))
    : [];
  const quizById = new Map(quizRows.map((q) => [q.id, q]));
  const myReaction = new Map(reactions.map((r) => [r.videoId, r.value]));
  const laterSet = new Set(later.map((l) => l.videoId));
  const progressMap = new Map(progress.map((p) => [p.videoId, p.completed ? 0 : p.progressSec]));
  const subSet = new Set(subs.map((s) => s.id));
  const staff = isStaff(viewer);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    videoUrl: r.videoUrl,
    streamUrl: r.streamStatus === 'ready' ? r.streamUrl : null,
    streamRenditions: r.streamStatus === 'ready' ? r.streamRenditions : [],
    thumbnailUrl: r.thumbnailUrl,
    durationSec: r.durationSec,
    visibility: r.visibility,
    tags: r.tags,
    section: r.sectionId && r.sectionName ? { id: r.sectionId, name: r.sectionName } : null,
    material: r.materialId && r.materialName ? { id: r.materialId, name: r.materialName } : null,
    owner: toSummary(pickSummary('owner', r)),
    views: r.views,
    likes: r.likes,
    dislikes: r.dislikes,
    commentCount: r.commentCount,
    allowComments: r.allowComments,
    createdAt: r.createdAt.getTime(),
    myReaction: myReaction.get(r.id) ?? 0,
    watchLater: laterSet.has(r.id),
    progressSec: progressMap.get(r.id) ?? 0,
    subscribed: subSet.has(r.ownerId as string),
    subscribers: r.subscribers,
    canEdit: !!viewer && (viewer.id === r.ownerId || staff),
    quiz: r.quizId ? (quizById.get(r.quizId as string) ?? null) : null,
  }));
}

/** A lesson may link any published quiz (its own author's or a public one). */
async function assertLinkableQuiz(deps: Deps, quizId: string | null | undefined) {
  if (!quizId) return;
  const [q] = await deps.db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt), eq(quizzes.published, true)));
  if (!q) throw badRequest('quiz_not_found');
}

export async function loadVideo(deps: Deps, viewer: AuthUser | null, id: string): Promise<VideoRow> {
  const [row] = await videoBase(deps).where(and(eq(videos.id, id), isNull(videos.deletedAt)));
  if (!row) throw notFound('video_not_found');
  if (row.visibility === 'private' && !(viewer && (viewer.id === row.ownerId || isStaff(viewer)))) throw notFound('video_not_found');
  return row as VideoRow;
}

/** Only files the user uploaded through our own endpoint may be published as video/thumbnail. */
export async function assertOwnUpload(deps: Deps, viewer: AuthUser, url: string, mimePrefix: 'video/' | 'image/') {
  const m = /\/files\/(public\/[^?#]+)/.exec(url);
  if (!m) throw badRequest('invalid_media_url');
  const [row] = await deps.db.select({ ownerId: uploads.ownerId, mime: uploads.mime }).from(uploads).where(eq(uploads.key, m[1]!));
  if (!row || (row.ownerId !== viewer.id && !isStaff(viewer)) || !row.mime.startsWith(mimePrefix)) throw badRequest('invalid_media_url');
}

const pageQuery = videoListQuerySchema;

function offsetOf(cursor: string | undefined) {
  return Math.max(0, Math.min(500, Number.parseInt(cursor ?? '0', 10) || 0));
}

async function interestTags(deps: Deps, viewer: AuthUser): Promise<string[]> {
  const rows = await deps.db.execute<{ tag: string }>(sql`
    select t.tag from (
      select v.tags, h.watched_at as at from watch_history h join videos v on v.id = h.video_id where h.user_id = ${viewer.id}
      union all
      select v.tags, r.created_at as at from video_reactions r join videos v on v.id = r.video_id where r.user_id = ${viewer.id} and r.value = 1
    ) s, lateral jsonb_array_elements_text(s.tags) as t(tag)
    group by t.tag order by max(s.at) desc, count(*) desc limit 12`);
  return rows.map((r) => r.tag);
}

const arrayOf = (tags: string[]) =>
  sql`array[${sql.join(
    tags.map((t) => sql`${t}`),
    sql`, `,
  )}]::text[]`;

export const videoRoutes = new Hono<AppEnv>()
  /* ───── Feeds ───── */
  .get('/', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const q = query(c, pageQuery);
    if ((q.feed === 'subscriptions' || q.feed === 'liked') && !viewer) throw forbidden('sign_in_required');
    const term = q.q ? normalizeSearch(q.q) : '';
    const filters = [
      listVisibility(viewer),
      q.kind ? eq(videos.kind, q.kind) : undefined,
      q.sectionId ? eq(videos.sectionId, q.sectionId) : undefined,
      q.materialId ? eq(videos.materialId, q.materialId) : undefined,
      q.ownerId ? eq(videos.ownerId, q.ownerId) : undefined,
      q.tag
        ? sql`${videos.id} in (select subject_id from hashtag_uses where subject_type = 'video' and tag = ${q.tag.replace(/^#/, '').toLowerCase()})`
        : undefined,
      term ? videoSearchFilter(term) : undefined,
      q.feed === 'subscriptions' && viewer ? sql`${videos.ownerId} in (select followee_id from follows where follower_id = ${viewer.id})` : undefined,
      q.feed === 'liked' && viewer ? sql`${videos.id} in (select video_id from video_reactions where user_id = ${viewer.id} and value = 1)` : undefined,
    ];
    const where = and(...filters);

    if (q.feed === 'new' || q.feed === 'subscriptions' || (term && q.feed === 'home')) {
      // Searches and chronological feeds paginate by keyset; search results rank by relevance via offset instead.
      if (term) {
        const offset = offsetOf(q.cursor);
        const rows = (await videoBase(deps)
          .where(where)
          .orderBy(desc(sql`similarity(${videos.searchText}, ${term})`), desc(videos.views), desc(videos.id))
          .limit(q.limit + 1)
          .offset(offset)) as VideoRow[];
        return c.json({
          items: await hydrateVideos(deps, viewer, rows.slice(0, q.limit)),
          nextCursor: rows.length > q.limit && offset + q.limit < 500 ? String(offset + q.limit) : null,
        } satisfies Page<VideoDto>);
      }
      const cursor = decodeCursor(q.cursor);
      const rows = (await videoBase(deps)
        .where(and(where, cursor ? sql`(${videos.createdAt}, ${videos.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined))
        .orderBy(desc(videos.createdAt), desc(videos.id))
        .limit(q.limit + 1)) as VideoRow[];
      const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
      return c.json({ items: await hydrateVideos(deps, viewer, page.items), nextCursor: page.nextCursor } satisfies Page<VideoDto>);
    }

    const offset = offsetOf(q.cursor);
    let order: SQL[];
    if (q.feed === 'trending') {
      order = [
        sql`(select count(*) from video_views vv where vv.video_id = ${videos.id} and vv.day >= (current_date - 3)) desc`,
        sql`${videos.likes} desc`,
        sql`${videos.id} desc`,
      ];
    } else if (q.feed === 'liked' && viewer) {
      order = [sql`(select created_at from video_reactions vr where vr.video_id = ${videos.id} and vr.user_id = ${viewer.id}) desc`, sql`${videos.id} desc`];
    } else {
      // Home: quality (views, likes, comments) with time decay; subscribed channels and topics the viewer engages with rank higher.
      const subBoost = viewer
        ? sql`(case when ${videos.ownerId} in (select followee_id from follows where follower_id = ${viewer.id}) then 1.8 else 1 end)`
        : sql`1`;
      const tags = viewer ? await interestTags(deps, viewer) : [];
      const tagBoost = tags.length ? sql`(case when ${videos.tags} ?| ${arrayOf(tags)} then 1.5 else 1 end)` : sql`1`;
      const watchedPenalty = viewer
        ? sql`(case when exists (select 1 from watch_history h where h.user_id = ${viewer.id} and h.video_id = ${videos.id} and h.completed) then 0.35 else 1 end)`
        : sql`1`;
      order = [
        sql`((ln(${videos.views} + 1) + ${videos.likes} * 0.6 + ${videos.commentCount} * 0.4 + 1) / power(extract(epoch from (now() - ${videos.createdAt})) / 86400.0 + 2, 1.15) * ${subBoost} * ${tagBoost} * ${watchedPenalty}) desc`,
        sql`${videos.id} desc`,
      ];
    }
    const rows = (await videoBase(deps)
      .where(where)
      .orderBy(...order)
      .limit(q.limit + 1)
      .offset(offset)) as VideoRow[];
    return c.json({
      items: await hydrateVideos(deps, viewer, rows.slice(0, q.limit)),
      nextCursor: rows.length > q.limit && offset + q.limit < 500 ? String(offset + q.limit) : null,
    } satisfies Page<VideoDto>);
  })

  /* ───── Viewer-specific lists (registered before /:id) ───── */
  .get('/me/history', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, paginationSchema);
    const offset = offsetOf(q.cursor);
    const hist = await deps.db
      .select()
      .from(watchHistory)
      .innerJoin(videos, eq(videos.id, watchHistory.videoId))
      .where(
        and(
          eq(watchHistory.userId, viewer.id),
          isNull(videos.deletedAt),
          or(eq(videos.visibility, 'public'), eq(videos.visibility, 'unlisted'), eq(videos.ownerId, viewer.id)),
        ),
      )
      .orderBy(desc(watchHistory.watchedAt))
      .limit(q.limit + 1)
      .offset(offset);
    const slice = hist.slice(0, q.limit);
    const rows = slice.length
      ? ((await videoBase(deps).where(
          inArray(
            videos.id,
            slice.map((h) => h.videos.id),
          ),
        )) as VideoRow[])
      : [];
    const dtos = new Map((await hydrateVideos(deps, viewer, rows)).map((v) => [v.id, v]));
    const items: WatchHistoryItem[] = slice.flatMap((h) => {
      const video = dtos.get(h.videos.id);
      return video
        ? [{ video, progressSec: h.watch_history.progressSec, completed: h.watch_history.completed, watchedAt: h.watch_history.watchedAt.getTime() }]
        : [];
    });
    return c.json({ items, nextCursor: hist.length > q.limit ? String(offset + q.limit) : null });
  })
  .delete('/me/history', async (c) => {
    const viewer = requireUser(c);
    await c.get('deps').db.delete(watchHistory).where(eq(watchHistory.userId, viewer.id));
    return c.json({ ok: true });
  })
  .delete('/me/history/:id', async (c) => {
    const viewer = requireUser(c);
    await c
      .get('deps')
      .db.delete(watchHistory)
      .where(and(eq(watchHistory.userId, viewer.id), eq(watchHistory.videoId, param(c, 'id'))));
    return c.json({ ok: true });
  })
  .get('/me/watch-later', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, paginationSchema);
    const offset = offsetOf(q.cursor);
    const rows = (await videoBase(deps)
      .where(and(listVisibility(viewer), sql`${videos.id} in (select video_id from watch_later where user_id = ${viewer.id})`))
      .orderBy(desc(sql`(select created_at from watch_later wl where wl.video_id = ${videos.id} and wl.user_id = ${viewer.id})`))
      .limit(q.limit + 1)
      .offset(offset)) as VideoRow[];
    return c.json({ items: await hydrateVideos(deps, viewer, rows.slice(0, q.limit)), nextCursor: rows.length > q.limit ? String(offset + q.limit) : null });
  })

  /* ───── Create / read / update / delete ───── */
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'video-create', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, videoInputSchema);
    if (deps.env.REQUIRE_EMAIL_VERIFICATION && !viewer.emailVerified) throw forbidden('email_not_verified');
    await assertOwnUpload(deps, viewer, input.videoUrl, 'video/');
    if (input.thumbnailUrl) await assertOwnUpload(deps, viewer, input.thumbnailUrl, 'image/');
    if (input.kind === 'short' && input.durationSec > 90) throw badRequest('short_too_long');
    await assertLinkableQuiz(deps, input.quizId);
    const [row] = await deps.db
      .insert(videos)
      .values({
        ownerId: viewer.id,
        kind: input.kind,
        title: input.title,
        description: input.description,
        searchText: normalizeSearch(`${input.title} ${input.tags.join(' ')} ${input.description.slice(0, 500)}`),
        videoUrl: input.videoUrl,
        // Made into 360p/720p/1080p in the background; the original plays until then.
        streamStatus: deps.env.TRANSCODE_ENABLED ? 'pending' : 'none',
        thumbnailUrl: input.thumbnailUrl ?? null,
        durationSec: input.durationSec,
        visibility: input.visibility,
        tags: input.tags,
        sectionId: input.sectionId ?? null,
        materialId: input.materialId ?? null,
        allowComments: input.allowComments,
        quizId: input.quizId ?? null,
      })
      .returning({ id: videos.id });
    await syncHashtags(deps.db, 'video', row!.id, viewer.id, `${input.title} ${input.description}`, input.tags);
    if (input.visibility === 'public') {
      // Tell subscribers (capped so a viral channel cannot stall the request).
      const subs = await deps.db.select({ id: follows.followerId }).from(follows).where(eq(follows.followeeId, viewer.id)).limit(500);
      await notify(
        deps,
        subs.map((s) => ({
          userId: s.id,
          type: 'new_video',
          icon: 'video',
          actorId: viewer.id,
          link: `/watch/${row!.id}`,
          data: { name: viewer.displayName, title: input.title, videoId: row!.id },
          pref: 'follows' as const,
        })),
      );
    }
    const [dto] = await hydrateVideos(deps, viewer, [await loadVideo(deps, viewer, row!.id)]);
    return c.json(dto, 201);
  })
  .get('/:id', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const [dto] = await hydrateVideos(deps, viewer, [await loadVideo(deps, viewer, param(c, 'id'))]);
    return c.json(dto);
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (video.ownerId !== viewer.id && !isStaff(viewer)) throw forbidden();
    const input = await body(c, videoUpdateSchema);
    if (input.thumbnailUrl) await assertOwnUpload(deps, viewer, input.thumbnailUrl, 'image/');
    await assertLinkableQuiz(deps, input.quizId);
    const title = input.title ?? video.title;
    const description = input.description ?? video.description;
    const tags = input.tags ?? video.tags;
    await deps.db
      .update(videos)
      .set({
        ...(input.title !== undefined ? { title } : {}),
        ...(input.description !== undefined ? { description } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.tags !== undefined ? { tags } : {}),
        ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
        ...(input.materialId !== undefined ? { materialId: input.materialId } : {}),
        ...(input.allowComments !== undefined ? { allowComments: input.allowComments } : {}),
        ...(input.quizId !== undefined ? { quizId: input.quizId } : {}),
        searchText: normalizeSearch(`${title} ${tags.join(' ')} ${description.slice(0, 500)}`),
        updatedAt: new Date(),
      })
      .where(eq(videos.id, video.id));
    await syncHashtags(deps.db, 'video', video.id, video.ownerId as string, `${title} ${description}`, tags);
    await refreshVideoSearchText(deps, video.id);
    const [dto] = await hydrateVideos(deps, viewer, [await loadVideo(deps, viewer, video.id)]);
    return c.json(dto);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (video.ownerId !== viewer.id && !isStaff(viewer)) throw forbidden();
    await deps.db.update(videos).set({ deletedAt: new Date() }).where(eq(videos.id, video.id));
    await removeHashtags(deps.db, 'video', video.id);
    return c.json({ ok: true });
  })
  /** The learner's private, timestamped notes for this lesson. */
  .get('/:id/notes', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const rows = await deps.db
      .select()
      .from(videoNotes)
      .where(and(eq(videoNotes.userId, viewer.id), eq(videoNotes.videoId, video.id)))
      .orderBy(videoNotes.atSec, videoNotes.createdAt)
      .limit(500);
    return c.json({ items: rows.map((n) => ({ id: n.id, atSec: n.atSec, text: n.text, createdAt: n.createdAt.getTime() })) });
  })
  .post('/:id/notes', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'video-note', limit: 120, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const input = await body(c, videoNoteSchema);
    const [n] = await deps.db
      .insert(videoNotes)
      .values({ userId: viewer.id, videoId: video.id, atSec: Math.min(input.atSec, video.durationSec), text: input.text })
      .returning();
    return c.json({ id: n!.id, atSec: n!.atSec, text: n!.text, createdAt: n!.createdAt.getTime() }, 201);
  })
  .delete('/:id/notes/:noteId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const gone = await deps.db
      .delete(videoNotes)
      .where(and(eq(videoNotes.id, param(c, 'noteId')), eq(videoNotes.userId, viewer.id), eq(videoNotes.videoId, param(c, 'id'))))
      .returning({ id: videoNotes.id });
    if (!gone.length) throw notFound();
    return c.json({ ok: true });
  })

  /* ───── Engagement ───── */
  .post('/:id/view', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    await checkRate(c, { bucket: 'video-view', limit: 120, windowSec: 600, by: viewer ? 'user' : 'ip' });
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const viewerKey = viewer ? `u:${viewer.id}` : `g:${sha256(`${clientIp(c, deps.env.TRUST_PROXY)}|${c.req.header('user-agent') ?? ''}`).slice(0, 24)}`;
    const inserted = await deps.db
      .insert(videoViews)
      .values({ videoId: video.id, viewerKey, day: dayKey(Date.now(), 'UTC') })
      .onConflictDoNothing()
      .returning({ videoId: videoViews.videoId });
    if (inserted.length)
      await deps.db
        .update(videos)
        .set({ views: sql`${videos.views} + 1` })
        .where(eq(videos.id, video.id));
    return c.json({ counted: inserted.length > 0, views: video.views + inserted.length });
  })
  .put('/:id/progress', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const { progressSec, completed } = await body(c, videoProgressSchema);
    const progress = Math.min(Math.round(progressSec), video.durationSec);
    const out = await deps.db.transaction(async (tx) => {
      const [prev] = await tx
        .select()
        .from(watchHistory)
        .where(and(eq(watchHistory.userId, viewer.id), eq(watchHistory.videoId, video.id)))
        .for('update');
      // Only forward playback counts, and never faster than the wall clock allows (2× speed + slack) since the
      // last sync — seeking to the end does not turn into study time.
      const now = Date.now();
      const forward = Math.max(0, progress - (prev?.progressSec ?? 0));
      const elapsed = prev ? (now - prev.watchedAt.getTime()) / 1000 : 20;
      const watched = Math.max(0, Math.min(forward, 120, Math.round(elapsed * 2 + 5)));
      const studiedBefore = prev?.studiedSec ?? 0;
      const studied = Math.min(studiedBefore + watched, video.durationSec * 3);
      const finished = completed || progress >= video.durationSec - 3;
      await tx
        .insert(watchHistory)
        .values({ userId: viewer.id, videoId: video.id, progressSec: progress, studiedSec: studied, completed: finished })
        .onConflictDoUpdate({
          target: [watchHistory.userId, watchHistory.videoId],
          set: { progressSec: progress, studiedSec: studied, completed: sql`${watchHistory.completed} or ${finished}`, watchedAt: new Date(now) },
        });
      if (watched)
        await tx
          .update(videos)
          .set({ watchSeconds: sql`${videos.watchSeconds} + ${watched}` })
          .where(eq(videos.id, video.id));
      // Whole minutes of real watching count toward the daily goal, total study time and the streak.
      const minutes = Math.floor(studied / 60) - Math.floor(studiedBefore / 60);
      await creditStudy(tx, viewer.id, viewer.timezone, minutes);
      // Finishing a lesson you actually watched (at least half of it) earns a little XP, once per lesson.
      let xpEarned = 0;
      if (finished && !prev?.completed && video.ownerId !== viewer.id && studied >= video.durationSec * 0.5 && video.durationSec >= 20) {
        const today = dayKey(now, viewer.timezone);
        const earned = await xpEarnedToday(tx, viewer.id, 'lesson', today);
        const amount = Math.min(LESSON_XP, Math.max(0, LESSON_XP_DAILY_CAP - earned));
        const award = await awardXp(tx, viewer.id, amount, 'lesson', video.id, today);
        xpEarned = award.awarded ? amount : 0;
      }
      return { studyMinutes: minutes, xpEarned, completed: finished || !!prev?.completed };
    });
    return c.json({ ok: true, ...out });
  })
  .put('/:id/reaction', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'video-react', limit: 120, windowSec: 300, by: 'user' });
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const { value } = await body(c, videoReactSchema);
    const result = await deps.db.transaction(async (tx) => {
      const [prev] = await tx
        .select({ value: videoReactions.value })
        .from(videoReactions)
        .where(and(eq(videoReactions.videoId, video.id), eq(videoReactions.userId, viewer.id)))
        .for('update');
      if (value === 0) await tx.delete(videoReactions).where(and(eq(videoReactions.videoId, video.id), eq(videoReactions.userId, viewer.id)));
      else
        await tx
          .insert(videoReactions)
          .values({ videoId: video.id, userId: viewer.id, value })
          .onConflictDoUpdate({ target: [videoReactions.videoId, videoReactions.userId], set: { value } });
      const [agg] = await tx
        .select({
          likes: sql<number>`count(*) filter (where ${videoReactions.value} = 1)::int`,
          dislikes: sql<number>`count(*) filter (where ${videoReactions.value} = -1)::int`,
        })
        .from(videoReactions)
        .where(eq(videoReactions.videoId, video.id));
      await tx.update(videos).set({ likes: agg!.likes, dislikes: agg!.dislikes }).where(eq(videos.id, video.id));
      return { likes: agg!.likes, dislikes: agg!.dislikes, newLike: value === 1 && prev?.value !== 1 };
    });
    if (result.newLike)
      await notify(deps, {
        userId: video.ownerId as string,
        type: 'video_like',
        icon: 'thumbs-up',
        actorId: viewer.id,
        link: `/watch/${video.id}`,
        data: { name: viewer.displayName, title: video.title, videoId: video.id },
        pref: 'reactions',
      });
    return c.json({ likes: result.likes, dislikes: result.dislikes, myReaction: value });
  })
  .put('/:id/watch-later', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const { on } = await body(c, z.object({ on: z.boolean() }));
    if (on) await deps.db.insert(watchLater).values({ userId: viewer.id, videoId: video.id }).onConflictDoNothing();
    else await deps.db.delete(watchLater).where(and(eq(watchLater.userId, viewer.id), eq(watchLater.videoId, video.id)));
    return c.json({ watchLater: on });
  })
  .get('/:id/related', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const tags = video.tags;
    const candidates = (await videoBase(deps)
      .where(
        and(
          listVisibility(viewer),
          sql`${videos.id} <> ${video.id}`,
          or(
            eq(videos.ownerId, video.ownerId as string),
            video.sectionId ? eq(videos.sectionId, video.sectionId) : undefined,
            tags.length ? sql`${videos.tags} ?| ${arrayOf(tags)}` : undefined,
          ),
        ),
      )
      .orderBy(desc(videos.views))
      .limit(80)) as VideoRow[];
    const score = (r: VideoRow) =>
      (r.ownerId === video.ownerId ? 2 : 0) +
      (video.sectionId && r.sectionId === video.sectionId ? 1.5 : 0) +
      (r.materialId && r.materialId === video.materialId ? 1 : 0) +
      r.tags.filter((t) => tags.includes(t)).length * 1.2 +
      Math.log10(r.views + 10) * 0.4 +
      (r.kind === video.kind ? 0.5 : 0);
    const ranked = candidates.sort((a, b) => score(b) - score(a)).slice(0, 14);
    if (ranked.length < 8) {
      const fill = (await videoBase(deps)
        .where(
          and(
            listVisibility(viewer),
            sql`${videos.id} <> ${video.id}`,
            ranked.length
              ? sql`${videos.id} not in (${sql.join(
                  ranked.map((r) => sql`${r.id}`),
                  sql`, `,
                )})`
              : undefined,
          ),
        )
        .orderBy(desc(videos.views))
        .limit(8 - ranked.length)) as VideoRow[];
      ranked.push(...fill);
    }
    return c.json({ items: await hydrateVideos(deps, viewer, ranked) });
  })

  /* ───── Comments (threaded) ───── */
  .get('/:id/comments', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const q = query(c, paginationSchema.extend({ parentId: z.string().uuid().optional(), sort: z.enum(['top', 'new']).default('top') }));
    const offset = offsetOf(q.cursor);
    const rows = await deps.db
      .select({
        id: videoComments.id,
        videoId: videoComments.videoId,
        parentId: videoComments.parentId,
        text: videoComments.text,
        likeCount: videoComments.likeCount,
        replyCount: videoComments.replyCount,
        pinned: videoComments.pinned,
        createdAt: videoComments.createdAt,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorUsername: users.username,
        authorAvatarUrl: users.avatarUrl,
        authorAccountType: users.accountType,
        authorLevel: users.level,
        authorXp: users.xp,
        authorBadge: users.badge,
      })
      .from(videoComments)
      .innerJoin(users, eq(users.id, videoComments.authorId))
      .where(
        and(
          eq(videoComments.videoId, video.id),
          isNull(videoComments.deletedAt),
          q.parentId ? eq(videoComments.parentId, q.parentId) : isNull(videoComments.parentId),
        ),
      )
      .orderBy(
        ...(q.parentId
          ? [videoComments.createdAt]
          : q.sort === 'new'
            ? [desc(videoComments.pinned), desc(videoComments.createdAt)]
            : [desc(videoComments.pinned), desc(videoComments.likeCount), desc(videoComments.createdAt)]),
      )
      .limit(q.limit + 1)
      .offset(offset);
    const slice = rows.slice(0, q.limit);
    const liked =
      viewer && slice.length
        ? new Set(
            (
              await deps.db
                .select({ id: videoCommentLikes.commentId })
                .from(videoCommentLikes)
                .where(
                  and(
                    eq(videoCommentLikes.userId, viewer.id),
                    inArray(
                      videoCommentLikes.commentId,
                      slice.map((r) => r.id),
                    ),
                  ),
                )
            ).map((l) => l.id),
          )
        : new Set<string>();
    const mod = video.ownerId === viewer?.id || isStaff(viewer);
    const items: VideoCommentDto[] = slice.map((r) => ({
      id: r.id,
      videoId: r.videoId,
      parentId: r.parentId,
      author: toSummary(pickSummary('author', r)),
      text: r.text,
      likes: r.likeCount,
      liked: liked.has(r.id),
      replyCount: r.replyCount,
      pinned: r.pinned,
      createdAt: r.createdAt.getTime(),
      canDelete: !!viewer && (r.authorId === viewer.id || mod),
    }));
    return c.json({ items, nextCursor: rows.length > q.limit ? String(offset + q.limit) : null });
  })
  .post('/:id/comments', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'video-comment', limit: 40, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (!video.allowComments) throw forbidden('comments_disabled');
    const input = await body(c, videoCommentSchema);
    let parent: { id: string; authorId: string } | null = null;
    if (input.parentId) {
      const [p] = await deps.db
        .select({ id: videoComments.id, authorId: videoComments.authorId, parentId: videoComments.parentId })
        .from(videoComments)
        .where(and(eq(videoComments.id, input.parentId), eq(videoComments.videoId, video.id), isNull(videoComments.deletedAt)));
      if (!p) throw notFound('comment_not_found');
      // One level of replies, like YouTube: replying to a reply attaches to the thread root.
      parent = { id: p.parentId ?? p.id, authorId: p.authorId };
    }
    const [row] = await deps.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(videoComments)
        .values({ videoId: video.id, authorId: viewer.id, parentId: parent?.id ?? null, text: input.text })
        .returning();
      await tx
        .update(videos)
        .set({ commentCount: sql`${videos.commentCount} + 1` })
        .where(eq(videos.id, video.id));
      if (parent)
        await tx
          .update(videoComments)
          .set({ replyCount: sql`${videoComments.replyCount} + 1` })
          .where(eq(videoComments.id, parent.id));
      return inserted;
    });
    await notify(deps, [
      {
        userId: video.ownerId as string,
        type: 'video_comment',
        icon: 'message-square',
        actorId: viewer.id,
        link: `/watch/${video.id}`,
        data: { name: viewer.displayName, title: video.title, preview: input.text.slice(0, 80), videoId: video.id },
        pref: 'comments' as const,
      },
      ...(parent && parent.authorId !== video.ownerId
        ? [
            {
              userId: parent.authorId,
              type: 'video_reply',
              icon: 'reply',
              actorId: viewer.id,
              link: `/watch/${video.id}`,
              data: { name: viewer.displayName, preview: input.text.slice(0, 80), videoId: video.id },
              pref: 'comments' as const,
            },
          ]
        : []),
    ]);
    const [me] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, viewer.id));
    const dto: VideoCommentDto = {
      id: row!.id,
      videoId: video.id,
      parentId: row!.parentId,
      author: toSummary(me!),
      text: row!.text,
      likes: 0,
      liked: false,
      replyCount: 0,
      pinned: false,
      createdAt: row!.createdAt.getTime(),
      canDelete: true,
    };
    return c.json(dto, 201);
  })
  .delete('/:id/comments/:commentId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const [comment] = await deps.db
      .select()
      .from(videoComments)
      .where(and(eq(videoComments.id, param(c, 'commentId')), eq(videoComments.videoId, video.id), isNull(videoComments.deletedAt)));
    if (!comment) throw notFound('comment_not_found');
    if (comment.authorId !== viewer.id && video.ownerId !== viewer.id && !isStaff(viewer)) throw forbidden();
    await deps.db.transaction(async (tx) => {
      // Deleting a thread root removes its replies too.
      const removed = await tx
        .update(videoComments)
        .set({ deletedAt: new Date() })
        .where(and(isNull(videoComments.deletedAt), or(eq(videoComments.id, comment.id), eq(videoComments.parentId, comment.id))))
        .returning({ id: videoComments.id });
      await tx
        .update(videos)
        .set({ commentCount: sql`greatest(${videos.commentCount} - ${removed.length}, 0)` })
        .where(eq(videos.id, video.id));
      if (comment.parentId)
        await tx
          .update(videoComments)
          .set({ replyCount: sql`greatest(${videoComments.replyCount} - 1, 0)` })
          .where(eq(videoComments.id, comment.parentId));
    });
    return c.json({ ok: true });
  })
  .put('/:id/comments/:commentId/like', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    const commentId = param(c, 'commentId');
    const { liked } = await body(c, z.object({ liked: z.boolean() }));
    const [comment] = await deps.db
      .select({ id: videoComments.id })
      .from(videoComments)
      .where(and(eq(videoComments.id, commentId), eq(videoComments.videoId, video.id), isNull(videoComments.deletedAt)));
    if (!comment) throw notFound('comment_not_found');
    const likes = await deps.db.transaction(async (tx) => {
      if (liked) await tx.insert(videoCommentLikes).values({ commentId, userId: viewer.id }).onConflictDoNothing();
      else await tx.delete(videoCommentLikes).where(and(eq(videoCommentLikes.commentId, commentId), eq(videoCommentLikes.userId, viewer.id)));
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(videoCommentLikes)
        .where(eq(videoCommentLikes.commentId, commentId));
      await tx.update(videoComments).set({ likeCount: n!.n }).where(eq(videoComments.id, commentId));
      return n!.n;
    });
    return c.json({ liked, likes });
  })
  .put('/:id/comments/:commentId/pin', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (video.ownerId !== viewer.id) throw forbidden();
    const commentId = param(c, 'commentId');
    const { pinned } = await body(c, z.object({ pinned: z.boolean() }));
    await deps.db.transaction(async (tx) => {
      if (pinned)
        await tx
          .update(videoComments)
          .set({ pinned: false })
          .where(and(eq(videoComments.videoId, video.id), eq(videoComments.pinned, true)));
      await tx
        .update(videoComments)
        .set({ pinned })
        .where(and(eq(videoComments.id, commentId), eq(videoComments.videoId, video.id), isNull(videoComments.parentId)));
    });
    return c.json({ pinned });
  });
