import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, uid, verifyTeacher } from './helpers';

const auth = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

test('a principal publishes an announcement and a fee, and a survey', async ({ page, request }) => {
  const admin = newUser('principal');
  const token = await apiRegister(request, admin, 'teacher');
  await verifyTeacher(request, token);
  const tag = uid();
  const sc = await request.post('/api/v1/schools', { ...auth(token), data: { name: `Fee School ${tag}` } });
  const school = (await sc.json()) as { id: string };
  // Add the student to the school through the bulk import (an existing account is invited, so join them directly instead).
  const imp = await request.post(`/api/v1/schools/${school.id}/import`, {
    ...auth(token),
    data: { rows: [{ name: `Imported Kid ${tag}`, role: 'student', gradeLevel: 'p5', section: '5A' }] },
  });
  expect(imp.ok()).toBeTruthy();

  await login(page, admin);
  await page.goto(`/schools/${school.id}?tab=news`);
  await page.getByLabel('Announcement', { exact: true }).fill('Parents meeting on Thursday');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Parents meeting on Thursday').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Fees' }).click();
  await page.getByLabel('Fee name').fill('Tuition term 1');
  await page.getByLabel('Total amount').fill('3000');
  await page.getByRole('button', { name: 'Create fee and invoices' }).click();
  await expect(page.getByText('3 invoices created.')).toBeVisible();
  await expect(page.getByText(/Tuition term 1 · 3,000 EGP/)).toBeVisible();

  await page.getByRole('tab', { name: 'Dashboard' }).click();
  await expect(page.getByText('No classes in this school yet.')).toBeVisible();

  await page.getByRole('tab', { name: 'Surveys' }).click();
  await page.getByLabel('Survey title').fill('How is school?');
  await page.getByPlaceholder('Question').first().fill('Do you feel safe at school?');
  await page.getByRole('button', { name: 'Publish the survey' }).click();
  await expect(page.getByText('Survey published.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How is school?' })).toBeVisible();
});

test('a student with no fees sees an empty list and the page renders', async ({ page, request }) => {
  const u = newUser('nofees');
  await apiRegister(request, u);
  await login(page, u);
  await page.goto('/fees');
  await expect(page.getByText('No school fees.')).toBeVisible();
});
