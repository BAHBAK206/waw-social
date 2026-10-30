import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  captionLanguageSchema,
  captionsAutoSchema,
  captionsTranslateSchema,
  captionsUploadSchema,
  hasPermission,
  parseCaptions,
  toVtt,
  type CaptionTrackDto,
  type Cue,
} from '@qubedu/shared';
import { videoCaptions } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { refreshVideoSearchText } from '../lib/videoSearch';
import { checkRate } from '../middleware';
import { consumeQuota } from './ai';
import { loadVideo } from './videos';

const MAX_CUES = 5000;

const canEdit = (viewer: AuthUser, ownerId: string) => viewer.id === ownerId || hasPermission(viewer.role, viewer.permissions, 'content.manage');

function langParam(raw: string | undefined): 'ar' | 'en' | 'fr' | 'es' {
  const r = captionLanguageSchema.safeParse((raw ?? '').replace(/\.vtt$/, ''));
  if (!r.success) throw badRequest('invalid_language');
  return r.data;
}

const toDto = (r: typeof videoCaptions.$inferSelect): CaptionTrackDto => ({
  language: r.language as CaptionTrackDto['language'],
  source: r.source,
  cues: r.cues,
  updatedAt: r.updatedAt.getTime(),
});

async function saveTrack(deps: Deps, videoId: string, language: string, source: 'upload' | 'auto' | 'translated', cues: Cue[]) {
  const [row] = await deps.db
    .insert(videoCaptions)
    .values({ videoId, language, source, cues })
    .onConflictDoUpdate({ target: [videoCaptions.videoId, videoCaptions.language], set: { source, cues, updatedAt: new Date() } })
    .returning();
  await refreshVideoSearchText(deps, videoId);
  return toDto(row!);
}

/** 16 kHz mono WAV of the lesson's sound track, for speech recognition. */
async function extractAudio(deps: Deps, videoUrl: string): Promise<Uint8Array> {
  const key = /\/files\/(public\/[^?#]+)/.exec(videoUrl)?.[1];
  if (!key) throw badRequest('invalid_media_url');
  const work = await mkdtemp(path.join(tmpdir(), 'qubedu-asr-'));
  try {
    const src = path.join(work, 'src');
    const wav = path.join(work, 'audio.wav');
    await deps.storage.download(key, src);
    const code = await new Promise<number>((resolve) => {
      const p = spawn(deps.env.FFMPEG_PATH, ['-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wav], { stdio: 'ignore' });
      const t = setTimeout(() => p.kill('SIGKILL'), 10 * 60_000);
      p.on('close', (c) => {
        clearTimeout(t);
        resolve(c ?? -1);
      });
      p.on('error', () => {
        clearTimeout(t);
        resolve(-1);
      });
    });
    if (code !== 0) throw new AppError(422, 'no_audio');
    return new Uint8Array(await readFile(wav));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export const captionRoutes = new Hono<AppEnv>()
  .get('/:id/captions', async (c) => {
    const deps = c.get('deps');
    const video = await loadVideo(deps, c.get('user') ?? null, param(c, 'id'));
    const rows = await deps.db.select().from(videoCaptions).where(eq(videoCaptions.videoId, video.id)).orderBy(asc(videoCaptions.language));
    return c.json({ items: rows.map(toDto) });
  })
  // WebVTT for the browser's <track> element.
  .get('/:id/captions/:lang', async (c) => {
    const deps = c.get('deps');
    const video = await loadVideo(deps, c.get('user') ?? null, param(c, 'id'));
    const lang = langParam(c.req.param('lang'));
    const [row] = await deps.db
      .select()
      .from(videoCaptions)
      .where(and(eq(videoCaptions.videoId, video.id), eq(videoCaptions.language, lang)));
    if (!row) throw notFound('captions_not_found');
    return c.body(toVtt(row.cues), 200, { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'private, max-age=60' });
  })
  .put('/:id/captions/:lang', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (!canEdit(viewer, video.ownerId)) throw forbidden();
    const lang = langParam(c.req.param('lang'));
    const { content } = await body(c, captionsUploadSchema);
    const cues = parseCaptions(content).slice(0, MAX_CUES);
    if (!cues.length) throw badRequest('invalid_captions');
    return c.json(await saveTrack(deps, video.id, lang, 'upload', cues));
  })
  .delete('/:id/captions/:lang', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (!canEdit(viewer, video.ownerId)) throw forbidden();
    const lang = langParam(c.req.param('lang'));
    await deps.db.delete(videoCaptions).where(and(eq(videoCaptions.videoId, video.id), eq(videoCaptions.language, lang)));
    await refreshVideoSearchText(deps, video.id);
    return c.json({ ok: true });
  })
  // Speech recognition (when the AI service has it installed).
  .post('/:id/captions-auto', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'captions-auto', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (!canEdit(viewer, video.ownerId)) throw forbidden();
    const { language } = await body(c, captionsAutoSchema);
    await consumeQuota(deps, viewer);
    const audio = await extractAudio(deps, video.videoUrl);
    const res = await deps.ai.transcribe({ audio, language });
    const cues = res.cues.filter((x) => x.text.trim()).slice(0, MAX_CUES);
    if (!cues.length) throw new AppError(422, 'no_speech');
    return c.json(await saveTrack(deps, video.id, language ?? 'ar', 'auto', cues));
  })
  .post('/:id/captions/:lang/translate', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'captions-translate', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const video = await loadVideo(deps, viewer, param(c, 'id'));
    if (!canEdit(viewer, video.ownerId)) throw forbidden();
    const from = langParam(c.req.param('lang'));
    const { to } = await body(c, captionsTranslateSchema);
    if (to === from) throw badRequest('same_language');
    const [src] = await deps.db
      .select()
      .from(videoCaptions)
      .where(and(eq(videoCaptions.videoId, video.id), eq(videoCaptions.language, from)));
    if (!src) throw notFound('captions_not_found');
    await consumeQuota(deps, viewer);
    const res = await deps.ai.teacher({ task: 'translate', cues: src.cues, language: from, targetLanguage: to });
    const cues = (res.cues as Cue[] | undefined) ?? [];
    if (cues.length !== src.cues.length) throw new AppError(502, 'translation_failed');
    return c.json(await saveTrack(deps, video.id, to, 'translated', cues));
  });
