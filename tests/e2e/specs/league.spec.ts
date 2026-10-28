import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors } from './helpers';

test('a new student sees their league and how to join a group', async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, newUser('leaguer'));
  await expect(page.getByRole('link', { name: /Bronze/ })).toBeVisible();
  await page.goto('/league');
  await expect(page.getByRole('heading', { name: 'Weekly league' })).toBeVisible();
  await expect(page.getByText('Bronze', { exact: true })).toBeVisible();
  await expect(page.getByText(/Ends (today|in \d+ days?)/)).toBeVisible();
  await expect(page.getByText(/Earn your first XP this week/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
