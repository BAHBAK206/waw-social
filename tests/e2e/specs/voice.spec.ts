import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors, uid, verifyTeacherAccount } from './helpers';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

test('a teacher answers a question by voice and the student can play it', async ({ browser, request }) => {
  const student = newUser('listener');
  const teacher = newUser('speaker');
  const ctxS = await browser.newContext({ locale: 'en-US' });
  const ctxT = await browser.newContext({ locale: 'en-US', permissions: ['microphone'] });
  const pageS = await ctxS.newPage();
  const pageT = await ctxT.newPage();
  const errors = [...trackErrors(pageS), ...trackErrors(pageT)];
  await register(pageS, student);
  await register(pageT, teacher, 'teacher');
  await verifyTeacherAccount(request, teacher);

  const question = `How do you pronounce "photosynthesis"? ${uid()}`;
  await pageS.goto('/feed?scope=questions');
  await pageS.getByRole('radio', { name: 'Question' }).check();
  await pageS.getByPlaceholder(/What do you want to understand/).fill(question);
  await pageS.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(pageS.locator('article', { hasText: question }).first()).toBeVisible();

  await pageT.goto('/feed?scope=questions&open=1');
  const card = pageT.locator('article', { hasText: question }).first();
  await card.getByRole('button', { name: 'Answers', exact: true }).click();
  await card.getByRole('button', { name: 'Answer by voice' }).click();
  await expect(card.getByRole('button', { name: /Recording…/ })).toBeVisible();
  await pageT.waitForTimeout(1500);
  await card.getByRole('button', { name: /Recording…/ }).click();
  await expect(card.getByLabel('Voice note').first()).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: 'Send' }).click();
  await expect(card.getByText("Teacher's voice explanation")).toBeVisible();

  await pageS.reload();
  const mine = pageS.locator('article', { hasText: question }).first();
  await mine
    .getByRole('button', { name: /1 answers?|Answers/ })
    .first()
    .click();
  const player = mine.locator('audio').first();
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.readyState), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await ctxS.close();
  await ctxT.close();
});
