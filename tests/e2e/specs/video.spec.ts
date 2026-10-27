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

test('a teacher builds a quiz, links it to a lesson with chapters; a student uses notes and the checkpoint', async ({ browser }) => {
  const teacher = newUser('lessonteacher');
  const student = newUser('lessonstudent');
  const ctxT = await browser.newContext({ locale: 'en-US' });
  const ctxS = await browser.newContext({ locale: 'en-US' });
  const pageT = await ctxT.newPage();
  const pageS = await ctxS.newPage();
  const errors = [...trackErrors(pageT), ...trackErrors(pageS)];
  await register(pageT, teacher, 'teacher');
  await register(pageS, student);

  // Quiz editor: one multiple-choice question.
  const quizTitle = `Checkpoint ${uid()}`;
  await pageT.goto('/quiz/new');
  await pageT.getByLabel('Quiz title').fill(quizTitle);
  await pageT.getByLabel('Question text').fill('Half of one plus half of one equals?');
  const options = pageT.getByLabel(/^Option \d+$/);
  const n = await options.count();
  for (let i = 0; i < n; i++) await options.nth(i).fill(['1', '2', '1/4', '0'][i] ?? `x${i}`);
  await pageT.getByRole('button', { name: 'Save quiz' }).first().click();
  await expect(pageT).toHaveURL(/\/quiz\?mine=1/);
  await expect(pageT.getByText(quizTitle).first()).toBeVisible();

  // Publish a lesson with an outline in the description and the quiz as its checkpoint.
  const title = `Adding fractions ${uid()}`;
  await pageT.goto('/studio');
  await pageT.getByRole('button', { name: 'Publish a lesson' }).first().click();
  await chooseFile(pageT, makeClip(6, '320x240'));
  const dialog = pageT.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Description').fill('0:00 What is a fraction\n0:03 Worked example');
  await dialog.getByLabel('Checkpoint quiz').selectOption({ label: quizTitle });
  await dialog.getByRole('button', { name: 'Publish lesson' }).click();
  await expect(pageT).toHaveURL(/\/watch\//, { timeout: 30_000 });
  const watchUrl = pageT.url();

  // The student sees the outline, jumps to a part, pins a note and is offered the quiz at the end.
  await pageS.goto(watchUrl);
  await expect(pageS.getByRole('heading', { name: title })).toBeVisible();
  const outline = pageS.getByRole('region', { name: 'Lesson outline' });
  await expect(outline.getByRole('button')).toHaveCount(2);
  const video = pageS.locator('video').first();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThan(0);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
  });
  await outline.getByRole('button', { name: /Worked example/ }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(3);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await expect(outline.getByRole('button', { name: /Worked example/ })).toHaveAttribute('aria-current', 'true');

  const notes = pageS.getByRole('region', { name: 'My lesson notes' });
  await notes.getByPlaceholder(/Write a note/).fill('Common denominator first!');
  await notes.getByRole('button', { name: /^Save at 00:0[3-5]$/ }).click();
  await expect(notes.getByText('Common denominator first!')).toBeVisible();
  await expect(notes.getByRole('button', { name: /^Jump to 00:0[3-5]$/ })).toBeVisible();

  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = Math.max(0, v.duration - 0.4);
    void v.play();
  });
  const checkpoint = pageS.getByRole('region', { name: 'Check your understanding' });
  await expect(checkpoint.getByText('Lesson finished — test what you learned')).toBeVisible({ timeout: 15_000 });
  await expect(checkpoint.getByText(quizTitle)).toBeVisible();
  await expect(pageS).toHaveURL(watchUrl);
  await checkpoint.getByRole('button', { name: 'Take the quiz' }).click();
  await expect(pageS).toHaveURL(/\/quiz\/attempt\//);
  await expect(pageS.getByText('Half of one plus half of one equals?')).toBeVisible();

  // Notes are private to the student.
  await pageT.reload();
  await expect(pageT.getByRole('region', { name: 'My lesson notes' }).getByText('Common denominator first!')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctxT.close();
  await ctxS.close();
});
