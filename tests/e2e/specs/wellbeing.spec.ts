import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, uid, verifyTeacher } from './helpers';

const auth = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

test('a student speaks up in secret and reads the answer; a parent limits screen time', async ({ page, request, browser }) => {
  const admin = newUser('principal');
  const kid = newUser('wkid');
  const parent = newUser('wparent');
  const aToken = await apiRegister(request, admin, 'teacher');
  await verifyTeacher(request, aToken);
  const kToken = await apiRegister(request, kid);
  const pToken = await apiRegister(request, parent, 'parent');
  const sc = await request.post('/api/v1/schools', { ...auth(aToken), data: { name: `Care School ${uid()}` } });
  const school = (await sc.json()) as { id: string };
  const imp = await request.post(`/api/v1/schools/${school.id}/import`, {
    ...auth(aToken),
    data: { rows: [{ name: kid.name, email: kid.email, role: 'student', gradeLevel: 'p5', section: '5A' }] },
  });
  expect(imp.ok(), await imp.text()).toBeTruthy();
  expect((await request.post(`/api/v1/schools/${school.id}/accept`, auth(kToken))).ok()).toBeTruthy();
  const code = (await (await request.post('/api/v1/family/code', auth(kToken))).json()) as { code: string };
  await request.post('/api/v1/family/link', { ...auth(pToken), data: { code: code.code } });

  // The student checks in and writes a complaint, then keeps the one-time code.
  await login(page, kid);
  await page.goto('/wellbeing');
  await page.getByRole('radio', { name: /Low/ }).first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Thanks for sharing.')).toBeVisible();
  await page
    .getByLabel('What would you like to say?')
    .or(page.getByLabel(/What happened/))
    .fill('Someone keeps pushing me in the corridor at break.');
  await page.getByRole('button', { name: 'Send in secret' }).click();
  const secret = (await page.getByTestId('secret-code').textContent())!.trim();
  expect(secret).toMatch(/^[A-Z0-9]{10}$/);

  // The principal reads it in the school's complaint box and answers.
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await login(ap, admin);
  await ap.goto(`/schools/${school.id}?tab=complaints`);
  await expect(ap.getByText('Someone keeps pushing me in the corridor at break.')).toBeVisible();
  await ap.getByLabel('Your answer to the writer').fill('Thank you for telling us. The year head will watch the corridor.');
  await ap.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ap.getByText('Saved.')).toBeVisible();
  await ctx.close();

  // The student reads the answer with the code.
  await page.getByLabel('Your secret code').fill(secret);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText(/The year head will watch the corridor/)).toBeVisible();

  // The parent sets a daily limit.
  const ctx2 = await browser.newContext();
  const pp = await ctx2.newPage();
  await login(pp, parent);
  await pp.goto('/family');
  await pp.getByLabel(/Daily time limit for/).selectOption('60');
  await expect(pp.getByText('Saved.')).toBeVisible();
  await expect(pp.getByTestId('usage-today')).toContainText('of 60 min used');
  await ctx2.close();
});
