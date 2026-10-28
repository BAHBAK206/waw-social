import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, register } from './helpers';

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

/** RFC 6238 code from a base32 secret (what an authenticator app shows). */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secret) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, '0');
}

test('two-step sign-in asks for the authenticator code after the password', async ({ page, request }) => {
  const user = newUser('twostep');
  const token = await apiRegister(request, user, 'teacher');
  const auth = { authorization: `Bearer ${token}` };
  const setup = (await (await request.post('/api/v1/me/2fa/setup', { headers: auth })).json()) as { secret: string };
  const on = await request.post('/api/v1/me/2fa/enable', { headers: auth, data: { code: totp(setup.secret) } });
  expect(on.ok(), await on.text()).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('Code from the app').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('This code is not valid.').or(page.getByText(/code/i)).first()).toBeVisible();
  await page.getByLabel('Code from the app').fill(totp(setup.secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/$/);
});
