import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { apiRegister, newUser } from './helpers';

let ffmpegAvailable = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  ffmpegAvailable = false;
}
test.skip(!ffmpegAvailable, 'ffmpeg is required');

test('a processed lesson streams (or falls back to the original file) and keeps playing', async ({ page, request }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qubedu-hls-'));
  const file = path.join(dir, 'lesson.webm');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=854x480:rate=15', '-c:v', 'libvpx', '-b:v', '200k', file], { stdio: 'ignore' });
  const teacher = newUser('streamer');
  const token = await apiRegister(request, teacher, 'teacher');
  const auth = { authorization: `Bearer ${token}` };
  const up = await request.post('/api/v1/uploads', {
    headers: auth,
    multipart: { purpose: 'video', file: { name: 'lesson.webm', mimeType: 'video/webm', buffer: readFileSync(file) } },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  const { url } = (await up.json()) as { url: string };
  const created = await request.post('/api/v1/videos', { headers: auth, data: { title: 'Streaming check', videoUrl: url, durationSec: 4 } });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  // The API's background worker prepares the 360p/480p ladder within a few seconds.
  await expect
    .poll(async () => ((await (await request.get(`/api/v1/videos/${id}`, { headers: auth })).json()) as { streamUrl: string | null }).streamUrl, {
      timeout: 60_000,
      intervals: [1000, 2000, 3000],
    })
    .toMatch(/master\.m3u8$/);

  await page.goto(`/watch/${id}`);
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  // Either hls.js attached a media source (blob:) or, in browsers without H.264, the original file took over.
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentSrc), { timeout: 20_000 }).toMatch(/^blob:|lesson|\/files\//);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5);
});
