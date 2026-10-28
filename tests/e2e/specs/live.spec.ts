import { expect, test, type Page } from '@playwright/test';
import { apiRegister, dismissOnboarding, login, newUser, register, uid, verifyTeacher } from './helpers';

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

test('in a live class the teacher asks a quick question, runs group work and gets the attendance', async ({ browser, request }) => {
  const teacher = newUser('liveteacher');
  const s1 = newUser('livea');
  const s2 = newUser('liveb');
  const tToken = await apiRegister(request, teacher, 'teacher');
  const auth = { authorization: `Bearer ${tToken}` };
  const course = (await (await request.post('/api/v1/school/courses', { headers: auth, data: { title: `Live course ${uid()}` } })).json()) as {
    id: string;
    joinCode: string;
  };
  for (const s of [s1, s2]) {
    const tok = await apiRegister(request, s);
    await request.post('/api/v1/school/join', { headers: { authorization: `Bearer ${tok}` }, data: { code: course.joinCode } });
  }
  const room = (await (
    await request.post('/api/v1/live', { headers: auth, data: { title: 'Fractions', scopeType: 'course', scopeId: course.id } })
  ).json()) as {
    id: string;
  };
  await request.post(`/api/v1/live/${room.id}/start`, { headers: auth });

  const pages: Page[] = [];
  for (const u of [teacher, s1, s2]) {
    const ctx = await browser.newContext({ locale: 'en-US', permissions: ['camera', 'microphone'] });
    const p = await ctx.newPage();
    await login(p, u);
    await p.goto(`/live/${room.id}`);
    await p.getByRole('button', { name: 'Join', exact: true }).click();
    pages.push(p);
  }
  const [pageT, pageA, pageB] = pages as [Page, Page, Page];
  await expect(pageT.getByText('Participants (3)')).toBeVisible({ timeout: 30_000 });

  // Quick quiz question: the students get it straight away and answer; the teacher shows the results.
  await pageT.getByRole('button', { name: 'Questions & polls' }).click();
  await pageT.getByLabel('Question', { exact: true }).fill('1/2 + 1/4 = ?');
  await pageT.getByLabel('Answers').fill('3/4\n2/6\n1');
  await pageT.getByLabel('Right answer').selectOption({ label: '3/4' });
  await pageT.getByRole('button', { name: 'Ask now' }).click();
  await expect(pageA.getByText('1/2 + 1/4 = ?')).toBeVisible({ timeout: 10_000 });
  await pageA.getByRole('button', { name: '3/4' }).click();
  await expect(pageA.getByText('1 answer · answer sent')).toBeVisible();
  await pageB.getByRole('button', { name: '2/6' }).click();
  await expect(pageT.getByText('2 answers')).toBeVisible({ timeout: 10_000 });
  await pageT.getByRole('button', { name: 'Close and show results' }).click();
  await expect(pageA.getByLabel('Right answer')).toBeVisible({ timeout: 10_000 });

  // Group work: each student is moved to a group room, then everyone comes back.
  await pageT.getByRole('button', { name: 'Group work' }).click();
  await pageT.getByLabel('Number of groups').fill('2');
  await pageT.getByRole('button', { name: /Start groups/ }).click();
  await expect(pageA.getByText(/^Group [12]$/)).toBeVisible({ timeout: 20_000 });
  await expect(pageB.getByText(/^Group [12]$/)).toBeVisible({ timeout: 20_000 });
  await pageT.getByRole('button', { name: 'End groups and bring everyone back' }).click();
  await expect(pageA.getByRole('button', { name: 'Main class' })).toBeHidden({ timeout: 20_000 });
  await expect(pageA.getByText('Group work ended. Back to the class.')).toBeVisible();

  // Attendance: both students are listed with their time.
  await pageT.getByRole('button', { name: 'Attendance' }).click();
  await expect(pageT.getByRole('complementary').getByText(s1.name)).toBeVisible({ timeout: 15_000 });
  for (const p of pages) await p.context().close();
});
