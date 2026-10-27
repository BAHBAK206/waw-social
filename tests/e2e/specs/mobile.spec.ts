import { expect, test } from '@playwright/test';
import { newUser, register } from './helpers';

test.describe('phone layout', () => {
  test('bottom navigation is shown and nothing scrolls sideways', async ({ page }) => {
    await register(page, newUser('phone'));
    await expect(page.getByRole('navigation', { name: /main|menu/i }).last()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const path of ['/feed', '/quiz', '/watch', '/chat', '/settings']) {
      await page.goto(path);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(o, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    }
  });
});
