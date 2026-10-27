import { expect, test } from '@playwright/test';
import { adminToken, loginAsAdmin, newUser, register, trackErrors, uid } from './helpers';

test.describe('admin console', () => {
  test.beforeAll(async ({ request }) => {
    await adminToken(request);
  });

  test('regular users cannot open it', async ({ page }) => {
    await register(page, newUser('plain'));
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('every tab renders for the root administrator', async ({ page }) => {
    const errors = trackErrors(page);
    await loginAsAdmin(page);
    for (const tab of ['overview', 'users', 'reports', 'content', 'education', 'challenges', 'library', 'assistant', 'features', 'site', 'errors', 'audit']) {
      await page.goto(`/admin?tab=${tab}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Admin' }), `${tab} did not render`).toBeVisible();
      await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });

  test('announcements and feature controls take effect for users', async ({ page, browser }) => {
    await loginAsAdmin(page);
    const title = `Maintenance window ${uid()}`;

    await page.goto('/admin?tab=content');
    await page.getByRole('button', { name: 'New announcement' }).first().click();
    await page.getByRole('dialog').getByLabel('Title').fill(title);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(title).first()).toBeVisible();

    const ctx = await browser.newContext({ locale: 'en-US' });
    const user = await ctx.newPage();
    await register(user, newUser('viewer'));
    await expect(user.getByText(title).first()).toBeVisible();

    // Hide Events for everyone, then restore it.
    await page.goto('/admin?tab=features');
    await page.getByPlaceholder('Filter features…').fill('events');
    const mode = page.getByRole('combobox', { name: 'events', exact: true });
    await mode.selectOption('hidden');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await user.reload();
    await expect(user.getByRole('link', { name: 'Events', exact: true })).toHaveCount(0);

    await mode.selectOption('enabled');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved').first()).toBeVisible();
    await user.reload();
    await expect(user.getByRole('link', { name: 'Events', exact: true }).first()).toBeVisible();
    await ctx.close();
  });
});
