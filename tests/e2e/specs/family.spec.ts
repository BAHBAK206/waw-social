import { expect, test, type Page } from '@playwright/test';
import { apiRegister, dismissOnboarding, login, newUser, trackErrors } from './helpers';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);
}

test('a parent links a child with a code and sees missing homework; the teacher sees who needs help', async ({ browser, request }) => {
  const teacher = newUser('teacher');
  const student = newUser('kid');
  const parent = newUser('parent');
  const tToken = await apiRegister(request, teacher, 'teacher');
  const sToken = await apiRegister(request, student);
  const course = await (await request.post('/api/v1/school/courses', { headers: { authorization: `Bearer ${tToken}` }, data: { title: 'Science 7' } })).json();
  await request.post('/api/v1/school/join', { headers: { authorization: `Bearer ${sToken}` }, data: { code: course.joinCode } });
  await request.post(`/api/v1/school/courses/${course.id}/assignments`, {
    headers: { authorization: `Bearer ${tToken}` },
    data: { title: 'Plant cells worksheet', points: 10, dueAt: Date.now() - 86400_000 },
  });

  // The student creates a code in Settings → Family.
  const ctxS = await browser.newContext({ locale: 'en-US' });
  const pageS = await ctxS.newPage();
  const errors = trackErrors(pageS);
  await signIn(pageS, student.email, student.password);
  await pageS.goto('/settings?tab=family');
  await pageS.getByRole('button', { name: 'Create a code' }).click();
  const code = (await pageS.locator('span.font-mono').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // The parent signs up as a parent and enters it.
  const ctxP = await browser.newContext({ locale: 'en-US' });
  const pageP = await ctxP.newPage();
  errors.push(...trackErrors(pageP));
  await pageP.goto('/register');
  await pageP.getByLabel('Full name').fill(parent.name);
  await pageP.getByLabel('Email').fill(parent.email);
  await pageP.getByLabel('Password', { exact: true }).fill(parent.password);
  await pageP.getByText('Parent', { exact: true }).click();
  await pageP.getByRole('button', { name: 'Create account' }).click();
  await expect(pageP).toHaveURL(/\/$/);
  await dismissOnboarding(pageP);
  await pageP.getByRole('link', { name: 'Open Family' }).click();
  await pageP.getByLabel('Code from your child').fill(code);
  await pageP.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(pageP.getByText(`${student.name} is now linked.`)).toBeVisible();
  await expect(pageP.getByText('Plant cells worksheet')).toBeVisible();
  await expect(pageP.getByText('Missing', { exact: true }).first()).toBeVisible();
  await expect(pageP.getByText('Missing homework').first()).toBeVisible();

  // The student sees the parent and could remove them.
  await pageS.reload();
  await expect(pageS.getByText(parent.name)).toBeVisible();

  // The teacher sees the student under "Who needs help" and encourages them.
  const ctxT = await browser.newContext({ locale: 'en-US' });
  const pageT = await ctxT.newPage();
  errors.push(...trackErrors(pageT));
  await signIn(pageT, teacher.email, teacher.password);
  await pageT.goto(`/school/${course.id}?tab=insights`);
  const row = pageT.locator('li', { hasText: student.name });
  await expect(row.getByText('Missing homework')).toBeVisible();
  await row.getByRole('button', { name: 'Encourage' }).click();
  await pageT.getByRole('dialog').getByLabel('Message').fill('You can do it — hand in the worksheet today.');
  await pageT.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(pageT.getByText('Sent.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a parent adds a phone number for WhatsApp reports and gets a code', async ({ page, request }) => {
  const parent = newUser('phoneparent');
  await apiRegister(request, parent, 'parent');
  const errors = trackErrors(page);
  await login(page, parent);
  await page.goto('/settings?tab=family');
  const box = page.getByRole('region', { name: 'WhatsApp and SMS' });
  await box.getByLabel('Phone number').fill('010 0123 4567');
  await box.getByRole('button', { name: 'Send code' }).click();
  await expect(box.getByText('We sent a 6-digit code to +20 100 ••• 4567.')).toBeVisible();
  await box.getByLabel('Code').fill('000000');
  await box.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('This code is not valid.')).toBeVisible();
  expect(errors).toEqual([]);
});
