import { expect, test, type Page } from '@playwright/test';
import { apiRegister, dismissOnboarding, newUser, register, uid, verifyTeacher } from './helpers';

// Chromium synthesises a camera and microphone, so two real browsers can run the full WebRTC handshake
// through the realtime hub with no hardware.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});

/** Remote tiles are the un-muted <video> elements (your own preview is muted); count those that are decoding frames. */
const remoteVideos = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.muted && v.srcObject && v.videoWidth > 0 && v.readyState >= 2).length);

test('a teacher and a student see and hear each other in a live class', async ({ browser, request }) => {
  const teacher = newUser('teacher');
  const student = newUser('student');
  const token = await apiRegister(request, teacher, 'teacher');
  await verifyTeacher(request, token);
  const created = await request.post('/api/v1/live', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      title: `E2E class ${uid()}`,
      scopeType: 'open',
      settings: { allowStudentCamera: true, allowStudentMic: true, allowStudentScreen: false, allowChat: true },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const room = (await created.json()) as { id: string };
  expect((await request.post(`/api/v1/live/${room.id}/start`, { headers: { authorization: `Bearer ${token}` } })).ok()).toBeTruthy();

  const ctxT = await browser.newContext({ locale: 'en-US', permissions: ['camera', 'microphone'] });
  const ctxS = await browser.newContext({ locale: 'en-US', permissions: ['camera', 'microphone'] });
  const pageT = await ctxT.newPage();
  const pageS = await ctxS.newPage();

  // Sign the teacher in through the UI (same account the room was created with).
  await pageT.goto('/login');
  await pageT.getByLabel('Email').fill(teacher.email);
  await pageT.getByLabel('Password', { exact: true }).fill(teacher.password);
  await pageT.getByRole('button', { name: 'Sign in' }).click();
  await expect(pageT).toHaveURL(/\/$/);
  await dismissOnboarding(pageT);
  await register(pageS, student);

  for (const p of [pageT, pageS]) {
    await p.goto(`/live/${room.id}`);
    await p.getByRole('button', { name: 'Join', exact: true }).click();
  }

  // Students join muted with the camera off; the teacher's video reaches the student straight away...
  await expect.poll(() => remoteVideos(pageS), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // ...and when the student switches the camera on, the teacher receives it too (renegotiation over the hub).
  await pageS.getByRole('button', { name: 'Camera' }).click();
  await expect.poll(() => remoteVideos(pageT), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  // Raise a hand: the teacher sees the participant counter badge.
  await pageS.getByRole('button', { name: 'Raise hand' }).click();
  await expect(pageT.locator('header .badge-warn')).toBeVisible({ timeout: 10_000 });

  // Host ends the class: the student is told and the room closes for them.
  pageT.once('dialog', (d) => void d.accept());
  await pageT.getByRole('button', { name: 'End for everyone' }).click();
  const confirmButton = pageT.getByRole('dialog').getByRole('button', { name: 'End for everyone' });
  if (await confirmButton.isVisible().catch(() => false)) await confirmButton.click();
  await expect(pageS.getByText('This live class has ended.').first()).toBeVisible({ timeout: 15_000 });

  await ctxT.close();
  await ctxS.close();
});
