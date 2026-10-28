import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { apiRegister, dismissOnboarding, newUser, trackErrors } from './helpers';

let ffmpegAvailable = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  ffmpegAvailable = false;
}
test.skip(!ffmpegAvailable, 'ffmpeg is required');

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
Photosynthesis is the process plants use to make glucose from sunlight energy.

00:00:02.000 --> 00:00:04.000
Chlorophyll inside the chloroplast absorbs sunlight and gives leaves their green colour.

00:00:04.000 --> 00:00:06.000
During photosynthesis carbon dioxide from the air and water from the roots are combined.

00:00:06.000 --> 00:00:08.000
Oxygen is released into the atmosphere as a by-product of photosynthesis in leaves.
`;

test('a teacher adds captions, students search the transcript, and a checkpoint quiz is drafted from the lesson', async ({ page, request }) => {
  const errors = trackErrors(page);
  const dir = mkdtempSync(path.join(tmpdir(), 'qubedu-cap-'));
  const file = path.join(dir, 'lesson.webm');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=8:size=320x240:rate=10', '-c:v', 'libvpx', '-b:v', '100k', file], { stdio: 'ignore' });
  const vtt = path.join(dir, 'lesson.vtt');
  writeFileSync(vtt, VTT);

  const teacher = newUser('captioner');
  const token = await apiRegister(request, teacher, 'teacher');
  const auth = { authorization: `Bearer ${token}` };
  const up = await request.post('/api/v1/uploads', {
    headers: auth,
    multipart: { purpose: 'video', file: { name: 'lesson.webm', mimeType: 'video/webm', buffer: readFileSync(file) } },
  });
  const { url } = (await up.json()) as { url: string };
  const created = await request.post('/api/v1/videos', { headers: auth, data: { title: 'How plants feed', videoUrl: url, durationSec: 8 } });
  const { id } = (await created.json()) as { id: string };

  await page.goto('/login');
  await page.getByLabel('Email').fill(teacher.email);
  await page.getByLabel('Password', { exact: true }).fill(teacher.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);

  await page.goto(`/watch/${id}`);
  const tools = page.getByRole('region', { name: 'Lesson tools' });
  await expect(tools).toBeVisible();
  await tools.getByLabel('Captions').selectOption('en');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tools.getByRole('button', { name: 'Upload captions (.vtt / .srt)' }).click()]);
  await chooser.setFiles(vtt);
  await expect(page.getByText('Captions saved.')).toBeVisible();

  const transcript = page.getByRole('region', { name: 'Transcript' });
  await expect(transcript.getByText('Chlorophyll inside the chloroplast')).toBeVisible();
  await transcript.getByLabel('Search what is said…').fill('carbon dioxide');
  await expect(transcript.getByText('1 match')).toBeVisible();
  await transcript.getByRole('button', { name: /carbon dioxide/ }).click();
  await expect
    .poll(() =>
      page
        .locator('video')
        .first()
        .evaluate((v: HTMLVideoElement) => Math.round(v.currentTime)),
    )
    .toBe(4);
  // The browser's own caption track is there too.
  expect(await page.locator('video track').count()).toBe(1);

  await tools.getByRole('button', { name: 'Summarize' }).click();
  await expect(tools.getByRole('button', { name: 'Add to the description' })).toBeVisible();

  await tools.getByRole('button', { name: 'Make a checkpoint quiz' }).click();
  await expect(page).toHaveURL(/\/quiz\/new\?draft=1/);
  await expect(page.getByLabel('Quiz title')).toHaveValue('How plants feed');
  await expect(page.getByRole('group', { name: 'Question 1' }).getByLabel('Question text')).toHaveValue(/_____/);
  await expect(page.getByRole('group', { name: 'Question 2' })).toBeVisible();
  expect(errors).toEqual([]);
});
