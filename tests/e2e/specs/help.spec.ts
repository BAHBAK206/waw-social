import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors } from './helpers';

test('help center explains features, the page help button opens the right guide, and the assistant answers from guides', async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, newUser('helpstudent'));

  // Help center: step-by-step guides, quick guides and the permissions table.
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help center' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step-by-step guides' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who can do what' })).toBeVisible();
  await page.getByPlaceholder('Search the guides…').fill('pass mark');
  await page.getByRole('link', { name: /Subject grading and report card/ }).click();
  await expect(page).toHaveURL(/\/help\/grades$/);
  await expect(page.getByRole('heading', { name: 'How to use it' })).toBeVisible();
  await expect(page.getByText('Split the total into parts', { exact: false })).toBeVisible();

  // Per-page help: on the report card page the "?" explains grading.
  await page.goto('/grades');
  await page.getByRole('button', { name: 'Help for this page' }).click();
  const dialog = page.getByRole('dialog', { name: 'Subject grading and report card' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: 'Read the full guide' }).click();
  await expect(page).toHaveURL(/\/help\/grades$/);

  // The menu is grouped into the new sections.
  await page.setViewportSize({ width: 1280, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Menu' }).first();
  await expect(nav.getByText('Classroom', { exact: true }).first()).toBeVisible();
  await expect(nav.getByText('Study', { exact: true })).toBeVisible();

  // The assistant answers a "how do I" question from the guides, with a link to the guide.
  await page.goto('/assistant');
  await page.getByRole('textbox').last().fill('How do I invite my parent to link our accounts?');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Parent account', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Read the guide' })).toBeVisible();
  expect(errors).toEqual([]);
});
