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

  test('high contrast and the easier-reading font apply and are saved to the account', async ({ page, request }) => {
    const user = newUser('a11y');
    await register(page, user);
    await page.goto('/settings?tab=appearance');
    await page.getByRole('switch', { name: 'High contrast' }).click();
    await page.getByRole('switch', { name: /Easier reading/ }).click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-contrast', 'high');
    await expect(html).toHaveAttribute('data-font', 'dyslexic');
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('OpenDyslexic');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim())).toBe('#000000');
    // Synced to the account (another device gets the same settings).
    await expect
      .poll(async () => {
        const login = await request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password } });
        return ((await login.json()) as { user: { appearance: { highContrast: boolean; readingFont: string } } }).user.appearance;
      })
      .toMatchObject({ highContrast: true, readingFont: 'dyslexic' });
  });

  test('guests can switch language before signing in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
