import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq, lt, sql } from 'drizzle-orm';
import { videos } from '../db/schema';
import { sendAlert } from './alerts';
import type { Deps } from './context';

/** Rungs of the quality ladder: height → video bitrate (kbit/s). */
const LADDER: [number, number][] = [
  [360, 800],
  [720, 2500],
  [1080, 5000],
];

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 20_000) err = err.slice(-10_000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err });
    });
  });
}

/** Height of the video and whether it has sound. */
async function probe(deps: Deps, file: string): Promise<{ height: number; audio: boolean; duration: number }> {
  const r = await run(deps.env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'stream=codec_type,height:format=duration', '-of', 'json', file], 60_000);
  if (r.code !== 0) throw new Error(`ffprobe failed: ${r.err.slice(-300)}`);
  const json = JSON.parse(r.out) as { streams?: { codec_type: string; height?: number }[]; format?: { duration?: string } };
  const video = json.streams?.find((s) => s.codec_type === 'video');
  if (!video?.height) throw new Error('no video stream');
  return { height: video.height, audio: !!json.streams?.some((s) => s.codec_type === 'audio'), duration: Number(json.format?.duration ?? 0) };
}

/** The rungs to make for a source of this height (never upscale; always at least 360p). */
export function ladderFor(height: number): [number, number][] {
  const rungs = LADDER.filter(([h]) => h <= Math.max(height, 360));
  return rungs.length ? rungs : [LADDER[0]!];
}

/** ffmpeg arguments for one pass that writes every rung plus the master playlist into `out`. */
export function hlsArgs(input: string, out: string, rungs: [number, number][], audio: boolean): string[] {
  const n = rungs.length;
  const split = `[0:v]split=${n}${rungs.map((_, i) => `[s${i}]`).join('')}`;
  const scales = rungs.map(([h], i) => `[s${i}]scale=-2:${h}[v${i}]`);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-filter_complex', [split, ...scales].join(';')];
  rungs.forEach(([, kbps], i) => {
    args.push(
      '-map',
      `[v${i}]`,
      `-c:v:${i}`,
      'libx264',
      `-b:v:${i}`,
      `${kbps}k`,
      `-maxrate:v:${i}`,
      `${Math.round(kbps * 1.07)}k`,
      `-bufsize:v:${i}`,
      `${kbps * 2}k`,
    );
    if (audio) args.push('-map', 'a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, '128k', '-ac', '2');
  });
  args.push(
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-sc_threshold',
    '0',
    '-f',
    'hls',
    '-hls_time',
    '6',
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    path.join(out, 'v%v_%03d.ts'),
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    rungs.map((_, i) => (audio ? `v:${i},a:${i}` : `v:${i}`)).join(' '),
    path.join(out, 'v%v.m3u8'),
  );
  return args;
}

/**
 * Turns one waiting upload into an adaptive stream (360p/720p/1080p, HLS) stored next to it.
 * Returns false when nothing was waiting.
 */
export async function transcodeNext(deps: Deps): Promise<boolean> {
  const claimed = await deps.db.execute<{ id: string; video_url: string; title: string }>(sql`
    update videos set stream_status = 'processing', updated_at = now()
    where id = (
      select id from videos where stream_status = 'pending' and deleted_at is null
      order by created_at limit 1 for update skip locked)
    returning id, video_url, title`);
  const job = claimed[0];
  if (!job) return false;
  const work = await mkdtemp(path.join(tmpdir(), 'qubedu-hls-'));
  try {
    const key = /\/files\/(public\/[^?#]+)/.exec(job.video_url)?.[1];
    if (!key) throw new Error('source is not a stored public file');
    const input = path.join(work, 'source');
    await deps.storage.download(key, input);
    const info = await probe(deps, input);
    const rungs = ladderFor(info.height);
    const out = path.join(work, 'out');
    await import('node:fs/promises').then((fs) => fs.mkdir(out));
    // Roughly real time on a small server; give long lessons room, but never hang forever.
    const limit = Math.max(10 * 60_000, Math.round(info.duration * 4 * rungs.length * 1000));
    const r = await run(deps.env.FFMPEG_PATH, hlsArgs(input, out, rungs, info.audio), limit);
    if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.err.slice(-400)}`);
    const files = (await readdir(out)).filter((f) => /^[a-z0-9_]{1,40}\.(m3u8|ts)$/.test(f));
    if (!files.includes('master.m3u8')) throw new Error('no master playlist');
    for (const f of files) {
      const data = await readFile(path.join(out, f));
      await deps.storage.putAt(`public/hls/${job.id}/${f}`, data, f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    }
    await deps.db
      .update(videos)
      .set({
        streamStatus: 'ready',
        streamUrl: await deps.storage.urlFor(`public/hls/${job.id}/master.m3u8`),
        streamRenditions: rungs.map(([h]) => h),
        streamError: null,
      })
      .where(eq(videos.id, job.id));
    deps.log.info({ videoId: job.id, rungs: rungs.map(([h]) => h) }, 'video stream ready');
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await deps.db.update(videos).set({ streamStatus: 'failed', streamError: message }).where(eq(videos.id, job.id));
    deps.log.warn({ videoId: job.id, err: message }, 'video stream failed');
    // The original file still plays; the team hears about it once.
    await sendAlert(deps, `transcode:${job.id}`, `🎞️ Video processing failed for “${job.title}”: ${message.slice(0, 200)}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return true;
}

/** Background loop (one video at a time). Returns a stop function. */
export function startTranscodeWorker(deps: Deps): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    try {
      // Anything stuck in "processing" for 3 hours (server restarted mid-way) goes back in the queue.
      await deps.db
        .update(videos)
        .set({ streamStatus: 'pending' })
        .where(and(eq(videos.streamStatus, 'processing'), lt(videos.updatedAt, new Date(Date.now() - 3 * 3600_000))));
      while (!stopped && (await transcodeNext(deps)));
    } catch (err) {
      deps.log.warn({ err }, 'transcode loop error');
    }
    if (!stopped) timer = setTimeout(() => void tick(), 15_000);
  };
  void (async () => {
    const ok = await run(deps.env.FFMPEG_PATH, ['-version'], 10_000).then(
      (r) => r.code === 0,
      () => false,
    );
    if (!ok) {
      deps.log.warn('ffmpeg not found: videos play as uploaded (no 360p/720p/1080p streams)');
      return;
    }
    void tick();
  })();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
