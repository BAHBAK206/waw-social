import { expect, test } from '@playwright/test';
import { login, newUser, register } from './helpers';

test.describe('authentication', () => {
  test('visitors are sent to sign in, then can register, sign out and sign back in', async ({ page }) => {
    const user = newUser('auth');
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/login/);

    await register(page, user);
    await expect(page.getByText(user.name).first()).toBeVisible();

    // Sign out from the account menu.
    await page.locator('header').getByRole('button', { name: user.name, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/login/);

    await login(page, user);
    await expect(page.getByText(user.name).first()).toBeVisible();
  });

  test('wrong password shows a readable error and stays on the page', async ({ page }) => {
    const user = newUser('badpw');
    await register(page, user);
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/incorrect/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('weak passwords are rejected before submitting', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Short Pass');
    await page.getByLabel('Email').fill(`short.${Date.now()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill('abc');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });
});
