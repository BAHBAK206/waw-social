import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AdminOverviewDto, UploadResultDto, VideoDto } from '@qubedu/shared';
import { hlsArgs, ladderFor, transcodeNext } from '../src/lib/transcode';
import { call, newUser, rootUser, setupApp } from './helpers';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('video streams', () => {
  it('picks the quality ladder from the source height (never upscales)', () => {
    expect(ladderFor(240).map(([h]) => h)).toEqual([360]);
    expect(ladderFor(720).map(([h]) => h)).toEqual([360, 720]);
    expect(ladderFor(2160).map(([h]) => h)).toEqual([360, 720, 1080]);
    const args = hlsArgs('in.mp4', '/out', ladderFor(1080), false);
    expect(args).toContain('v:0 v:1 v:2');
    expect(args.join(' ')).toContain('[0:v]split=3[s0][s1][s2]');
  });

  it.runIf(hasFfmpeg)(
    'turns an uploaded lesson into a 360p/720p stream that plays from /files',
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'qb-src-'));
      const src = path.join(dir, 'lesson.mp4');
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=1280x720:rate=24:duration=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        src,
      ]);
      const teacher = await newUser({ accountType: 'teacher' });
      const form = new FormData();
      form.set('file', new File([readFileSync(src)], 'lesson.mp4', { type: 'video/mp4' }));
      form.set('purpose', 'video');
      const up = await call<UploadResultDto>('POST', '/uploads', { token: teacher.token, form });
      expect(up.status).toBe(201);
      const v = await call<VideoDto>('POST', '/videos', {
        token: teacher.token,
        body: { title: 'Light and colour', videoUrl: up.body.url, durationSec: 3, visibility: 'public' },
      });
      expect(v.status).toBe(201);
      expect(v.body.streamUrl).toBeNull();

      const { deps } = await setupApp();
      // Other tests may have queued videos too: work through the queue until ours is done.
      for (let i = 0; i < 20 && (await transcodeNext(deps)); i++);
      const after = await call<VideoDto>('GET', `/videos/${v.body.id}`, { token: teacher.token });
      expect(after.body.streamRenditions).toEqual([360, 720]);
      expect(after.body.streamUrl).toMatch(new RegExp(`/files/public/hls/${v.body.id}/master\\.m3u8$`));

      const master = await call<string>('GET', new URL(after.body.streamUrl!).pathname);
      expect(master.status).toBe(200);
      expect(master.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
      expect(master.body).toContain('RESOLUTION=1280x720');
      expect(master.body).toContain('v0.m3u8');
      const variant = await call<string>('GET', `/files/public/hls/${v.body.id}/v0.m3u8`);
      expect(variant.body).toContain('v0_000.ts');
      const seg = await call('GET', `/files/public/hls/${v.body.id}/v0_000.ts`);
      expect(seg.status).toBe(200);
      expect(seg.headers.get('content-type')).toBe('video/mp2t');
    },
    60_000,
  );
});

describe('operations', () => {
  it('records unhandled server errors for the admin and reports system health', async () => {
    const { deps, app } = await setupApp();
    const { recordServerError } = await import('../src/lib/alerts');
    await recordServerError(deps, new Error(`boom ${Date.now()}`), { path: '/api/v1/test', method: 'GET' });
    const root = await rootUser();
    const errors = await call<{ items: { kind: string; message: string }[] }>('GET', '/admin/errors', { token: root.token });
    expect(errors.body.items.some((e) => e.kind === 'server' && e.message.startsWith('Error: boom'))).toBe(true);
    const o = await call<AdminOverviewDto>('GET', '/admin/overview', { token: root.token });
    expect(o.body.system).toMatchObject({ alertsConfigured: false });
    expect(typeof o.body.system.videosProcessing).toBe('number');
    void app;
  });
});
