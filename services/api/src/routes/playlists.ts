import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { playlistInputSchema, playlistItemSchema, playlistReorderSchema, LIMITS, paginationSchema, type PlaylistDto, type VideoDto } from '@qubedu/shared';
import { playlistItems, playlists, users, videos } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, toSummary } from '../lib/mappers';
import { hydrateVideos, loadVideo, ownerCols, videoBase, type VideoRow } from './videos';

const playlistCols = {
  id: playlists.id,
  title: playlists.title,
  description: playlists.description,
  visibility: playlists.visibility,
  itemCount: playlists.itemCount,
  updatedAt: playlists.updatedAt,
  thumbnailUrl: sql<string | null>`(
    select v.thumbnail_url from playlist_items pi join videos v on v.id = pi.video_id
    where pi.playlist_id = ${playlists.id} and v.deleted_at is null order by pi.position limit 1)`,
  ...ownerCols,
};

function toDto(row: Record<string, unknown> & { ownerId: string }, viewer: AuthUser | null, hasVideo?: boolean): PlaylistDto {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    visibility: row.visibility as PlaylistDto['visibility'],
    itemCount: row.itemCount as number,
    owner: toSummary(pickSummary('owner', row)),
    thumbnailUrl: (row.thumbnailUrl as string | null) ?? null,
    updatedAt: (row.updatedAt as Date).getTime(),
    canEdit: viewer?.id === row.ownerId,
    ...(hasVideo === undefined ? {} : { hasVideo }),
  };
}

export async function playlistsOf(deps: Deps, viewer: AuthUser | null, ownerId: string): Promise<PlaylistDto[]> {
  const own = viewer?.id === ownerId;
  const rows = await deps.db
    .select(playlistCols)
    .from(playlists)
    .innerJoin(users, eq(users.id, playlists.ownerId))
    .where(and(eq(playlists.ownerId, ownerId), own ? undefined : eq(playlists.visibility, 'public')))
    .orderBy(desc(playlists.updatedAt))
    .limit(100);
  return rows.map((r) => toDto(r, viewer));
}

async function loadPlaylist(deps: Deps, viewer: AuthUser | null, id: string) {
  const [row] = await deps.db.select(playlistCols).from(playlists).innerJoin(users, eq(users.id, playlists.ownerId)).where(eq(playlists.id, id));
  if (!row || (row.visibility === 'private' && row.ownerId !== viewer?.id)) throw notFound('playlist_not_found');
  return row;
}

async function ownPlaylist(deps: Deps, viewer: AuthUser, id: string) {
  const row = await loadPlaylist(deps, viewer, id);
  if (row.ownerId !== viewer.id) throw forbidden();
  return row;
}

export const playlistRoutes = new Hono<AppEnv>()
  .get('/mine', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const { videoId } = query(c, paginationSchema.pick({}).extend({ videoId: playlistItemSchema.shape.videoId.optional() }));
    const list = await playlistsOf(deps, viewer, viewer.id);
    if (!videoId) return c.json({ items: list });
    const has = new Set(
      (
        await deps.db
          .select({ id: playlistItems.playlistId })
          .from(playlistItems)
          .where(
            and(eq(playlistItems.videoId, videoId), inArray(playlistItems.playlistId, list.map((p) => p.id).concat('00000000-0000-0000-0000-000000000000'))),
          )
      ).map((r) => r.id),
    );
    return c.json({ items: list.map((p) => ({ ...p, hasVideo: has.has(p.id) })) });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, playlistInputSchema);
    const [{ n } = { n: 0 }] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(playlists)
      .where(eq(playlists.ownerId, viewer.id));
    if (n >= 100) throw conflict('too_many_playlists');
    const [row] = await deps.db
      .insert(playlists)
      .values({ ownerId: viewer.id, ...input })
      .returning({ id: playlists.id });
    return c.json(toDto(await loadPlaylist(deps, viewer, row!.id), viewer), 201);
  })
  .get('/:id', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const pl = await loadPlaylist(deps, viewer, param(c, 'id'));
    const items = await deps.db
      .select({ videoId: playlistItems.videoId, position: playlistItems.position })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, pl.id))
      .orderBy(asc(playlistItems.position));
    const ids = items.map((i) => i.videoId);
    const rows = ids.length
      ? ((await videoBase(deps).where(
          and(
            inArray(videos.id, ids),
            isNull(videos.deletedAt),
            or(eq(videos.visibility, 'public'), eq(videos.visibility, 'unlisted'), eq(videos.ownerId, viewer?.id ?? pl.ownerId)),
          ),
        )) as VideoRow[])
      : [];
    const byId = new Map((await hydrateVideos(deps, viewer, rows)).map((v) => [v.id, v]));
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    return c.json({ playlist: toDto(pl, viewer), videos: ordered satisfies VideoDto[] });
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const pl = await ownPlaylist(deps, viewer, param(c, 'id'));
    const input = await body(c, playlistInputSchema.partial());
    await deps.db
      .update(playlists)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(playlists.id, pl.id));
    return c.json(toDto(await loadPlaylist(deps, viewer, pl.id), viewer));
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const pl = await ownPlaylist(deps, viewer, param(c, 'id'));
    await deps.db.delete(playlists).where(eq(playlists.id, pl.id));
    return c.json({ ok: true });
  })
  .post('/:id/items', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const pl = await ownPlaylist(deps, viewer, param(c, 'id'));
    const { videoId } = await body(c, playlistItemSchema);
    await loadVideo(deps, viewer, videoId);
    if (pl.itemCount >= LIMITS.playlistItems) throw conflict('playlist_full');
    await deps.db.transaction(async (tx) => {
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${playlistItems.position}) + 1, 0)::int` })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, pl.id));
      const added = await tx
        .insert(playlistItems)
        .values({ playlistId: pl.id, videoId, position: next })
        .onConflictDoNothing()
        .returning({ v: playlistItems.videoId });
      if (added.length)
        await tx
          .update(playlists)
          .set({ itemCount: sql`${playlists.itemCount} + 1`, updatedAt: new Date() })
          .where(eq(playlists.id, pl.id));
    });
    return c.json({ ok: true });
  })
  .delete('/:id/items/:videoId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const pl = await ownPlaylist(deps, viewer, param(c, 'id'));
    const removed = await deps.db
      .delete(playlistItems)
      .where(and(eq(playlistItems.playlistId, pl.id), eq(playlistItems.videoId, param(c, 'videoId'))))
      .returning({ v: playlistItems.videoId });
    if (removed.length)
      await deps.db
        .update(playlists)
        .set({ itemCount: sql`greatest(${playlists.itemCount} - 1, 0)`, updatedAt: new Date() })
        .where(eq(playlists.id, pl.id));
    return c.json({ ok: true });
  })
  .put('/:id/order', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const pl = await ownPlaylist(deps, viewer, param(c, 'id'));
    const { videoIds } = await body(c, playlistReorderSchema);
    await deps.db.transaction(async (tx) => {
      for (const [position, videoId] of videoIds.entries())
        await tx
          .update(playlistItems)
          .set({ position })
          .where(and(eq(playlistItems.playlistId, pl.id), eq(playlistItems.videoId, videoId)));
      await tx.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, pl.id));
    });
    return c.json({ ok: true });
  });
