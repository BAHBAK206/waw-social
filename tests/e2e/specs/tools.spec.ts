import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors } from './helpers';

test('timetable: add a class, see it on the home page; grade calculator: what is needed on the final', async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, newUser('planner'));

  await page.goto('/timetable');
  await expect(page.getByRole('heading', { name: 'Timetable', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Add a class' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a class' });
  await dialog.getByLabel('Subject or activity').fill('Physics');
  // Today, all day long, so it shows as "Now" on the home page.
  await dialog.getByLabel('Starts').fill('00:00');
  await dialog.getByLabel('Ends').fill('23:59');
  await dialog.getByLabel('Room (optional)').fill('Lab 3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Physics').first()).toBeVisible();

  await page.goto('/');
  const today = page.getByRole('region', { name: 'Today’s classes' });
  await expect(today.getByText('Physics')).toBeVisible();
  await expect(today.getByText('Now')).toBeVisible();

  await page.goto('/calculator');
  await page.getByLabel('My mark — Homework').fill('8');
  await page.getByLabel('My mark — Monthly tests').fill('14');
  await page.getByLabel('My target (optional)').fill('51');
  await expect(page.getByText('You need 8 of the 30 marks left.')).toBeVisible();
  await expect(page.getByText('You need 29 of the 30 marks left.')).toBeVisible();
  await expect(page.getByText('Final result between 22 and 52 out of 60.')).toBeVisible();
  expect(errors).toEqual([]);
});
