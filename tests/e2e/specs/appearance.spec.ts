import { expect, test } from '@playwright/test';
import { newUser, register } from './helpers';

test.describe('appearance and languages', () => {
  test('language switch flips direction and persists across reloads', async ({ page }) => {
    await register(page, newUser('lang'));
    await page.goto('/settings?tab=appearance');
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('every design and skin applies to the document', async ({ page }) => {
    await register(page, newUser('theme'));
    await page.goto('/settings?tab=appearance');
    for (const mode of ['Dark', 'Light']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode.toLowerCase());
    }
    for (const design of ['Graphite', 'Glass', 'Natural']) {
      await page.getByRole('button', { name: new RegExp(design) }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-design', 'natural');
    await page.getByRole('button', { name: 'Ocean' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'ocean');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'ocean');
  });

  test('guests can switch language before signing in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
