import { expect, test } from '@playwright/test';
import { adminToken, apiRegister, login, loginAsAdmin, newUser, trackErrors } from './helpers';

test('a teacher asks to be verified and an administrator approves it from the moderation console', async ({ page, browser, request }) => {
  await adminToken(request);
  const teacher = newUser('teacher');
  await apiRegister(request, teacher, 'teacher');
  const errors = trackErrors(page);
  await login(page, teacher);
  await page.goto('/settings?tab=account');
  await expect(page.getByRole('heading', { name: 'Teacher verification' })).toBeVisible();
  await page.getByLabel('School or institution').fill('Nile Language School');
  await page.getByLabel('Subject you teach').fill('Chemistry');
  await page.getByLabel('Link that shows you teach there (optional)').fill('https://nile.example/staff/chem');
  await page.getByRole('button', { name: 'Ask to be verified' }).click();
  await expect(page.getByText('Your request is being reviewed.')).toBeVisible();

  const ctx = await browser.newContext({ locale: 'en-US' });
  const admin = await ctx.newPage();
  errors.push(...trackErrors(admin));
  await loginAsAdmin(admin);
  await admin.goto('/admin?tab=overview');
  await expect(admin.getByText('Teachers waiting for verification')).toBeVisible();
  await admin.goto('/admin?tab=verifications');
  const card = admin.locator('li', { hasText: teacher.name });
  await expect(card.getByText('Nile Language School')).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Saved').first()).toBeVisible();
  await ctx.close();

  await page.reload();
  await expect(page.getByText('You are a verified teacher.')).toBeVisible();
  expect(errors).toEqual([]);
});
