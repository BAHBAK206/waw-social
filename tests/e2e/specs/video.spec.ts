import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { newUser, register, trackErrors, uid } from './helpers';

// Chromium's open-source build has no H.264, so the fixture is VP8/Opus WebM. Needs ffmpeg on PATH.
function makeClip(seconds: number, size: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'qubedu-e2e-'));
  const file = path.join(dir, 'lesson.webm');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=duration=${seconds}:size=${size}:rate=15`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${seconds}`,
      '-c:v',
      'libvpx',
      '-b:v',
      '200k',
      '-c:a',
      'libopus',
      '-shortest',
      file,
    ],
    { stdio: 'ignore' },
  );
  return file;
}

async function chooseFile(page: Page, file: string) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose file' }).click()]);
  await chooser.setFiles(file);
}

let ffmpegAvailable = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  ffmpegAvailable = false;
}
test.skip(!ffmpegAvailable, 'ffmpeg is required to build the test video');

test('upload a video in Studio, watch it, react, comment and subscribe from another account', async ({ browser }) => {
  const creator = newUser('creator');
  const viewer = newUser('viewer');
  const ctxC = await browser.newContext({ locale: 'en-US' });
  const ctxV = await browser.newContext({ locale: 'en-US' });
  const pageC = await ctxC.newPage();
  const pageV = await ctxV.newPage();
  const errors = [...trackErrors(pageC), ...trackErrors(pageV)];
  await register(pageC, creator);
  await register(pageV, viewer);

  const title = `Fractions explained ${uid()}`;
  await pageC.goto('/studio');
  await pageC.getByRole('button', { name: 'Publish a lesson' }).first().click();
  await chooseFile(pageC, makeClip(4, '320x240'));
  await pageC.getByRole('dialog').getByLabel('Title').fill(title);
  await pageC.getByRole('dialog').getByRole('button', { name: 'Publish lesson' }).click();

  // Publishing lands on the watch page and the player really decodes frames.
  await expect(pageC).toHaveURL(/\/watch\//, { timeout: 30_000 });
  await expect(pageC.getByRole('heading', { name: title })).toBeVisible();
  const video = pageC.locator('video').first();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  const watchUrl = pageC.url();

  // A second account finds it, likes, comments and subscribes.
  await pageV.goto(watchUrl);
  await expect(pageV.getByRole('heading', { name: title })).toBeVisible();
  await pageV.getByRole('button', { name: /Helpful$/ }).click();
  await expect(pageV.getByRole('button', { name: /Helpful$/ })).toHaveAttribute('aria-pressed', 'true');
  await pageV
    .getByPlaceholder(/Ask about this lesson/)
    .first()
    .fill('Great explanation!');
  await pageV.getByRole('button', { name: /^Comment$/ }).click();
  await expect(pageV.getByText('Great explanation!')).toBeVisible();
  await pageV.getByRole('button', { name: 'Follow teacher', exact: true }).first().click();
  await expect(pageV.getByRole('button', { name: 'Following', exact: true }).first()).toBeVisible();

  // The creator's dashboard and content list pick it up.
  await pageC.goto('/studio?tab=content');
  await expect(pageC.getByText(title)).toBeVisible();

  // It shows up on the Watch home for everyone.
  await pageV.goto('/watch');
  await expect(pageV.getByText(title).first()).toBeVisible();

  expect(errors).toEqual([]);
  await ctxC.close();
  await ctxV.close();
});

test('shorts: a vertical clip is published and plays in the swipe feed', async ({ browser }) => {
  const creator = newUser('shorty');
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await register(page, creator);
  const title = `Quick tip ${uid()}`;
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Publish a lesson' }).first().click();
  await chooseFile(page, makeClip(3, '240x426'));
  await page.getByRole('dialog').getByLabel('Title').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Publish lesson' }).click();
  await expect(page).toHaveURL(/\/shorts\//, { timeout: 30_000 });
  await expect(page.locator('section[data-short]').first()).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});
