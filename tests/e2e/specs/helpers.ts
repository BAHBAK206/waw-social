import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(prefix = 'user'): TestUser {
  const id = uid();
  return { name: `${prefix} ${id}`, email: `${prefix}.${id}@example.test`, password: 'Sup3rSecret!pass' };
}

/** Creates an account through the UI and waits for the signed-in home screen. */
export async function register(page: Page, user: TestUser, role: 'student' | 'teacher' = 'student') {
  await page.goto('/register');
  await page.getByLabel('Full name').or(page.getByLabel('Display name')).first().fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  if (role === 'teacher') await page.getByText('Teacher', { exact: true }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await dismissOnboarding(page);
}

/** The first-run tour is a modal dialog; close it so it does not intercept clicks. */
export async function dismissOnboarding(page: Page) {
  const skip = page.getByRole('dialog').getByRole('button', { name: 'Skip' });
  try {
    await skip.click({ timeout: 4000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } catch {
    /* not shown (already completed) */
  }
}

export async function login(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);
}

/** Registers via the API (fast) and returns the bearer token for further API setup. */
export async function apiRegister(request: APIRequestContext, user: TestUser, accountType: 'student' | 'teacher' = 'student') {
  const res = await request.post('/api/v1/auth/register', {
    data: { email: user.email, password: user.password, displayName: user.name, accountType, language: 'en' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}
