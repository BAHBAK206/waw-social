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
export async function apiRegister(request: APIRequestContext, user: TestUser, accountType: 'student' | 'teacher' | 'parent' = 'student') {
  const res = await request.post('/api/v1/auth/register', {
    data: { email: user.email, password: user.password, displayName: user.name, accountType, language: 'en' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

export const ROOT_EMAIL = process.env.ROOT_ADMIN_EMAIL ?? 'root@e2e.test';

/** Signs in as the bootstrap administrator (registers the account on first use). Needs the API started with ROOT_ADMIN_EMAIL. */
export async function adminToken(request: APIRequestContext) {
  const password = 'Sup3rSecret!pass';
  // Several workers may bootstrap the account at the same time: whoever loses the race simply signs in.
  for (let attempt = 0; attempt < 3; attempt++) {
    const login = await request.post('/api/v1/auth/login', { data: { email: ROOT_EMAIL, password } });
    if (login.ok()) return ((await login.json()) as { accessToken: string }).accessToken;
    const reg = await request.post('/api/v1/auth/register', {
      data: { email: ROOT_EMAIL, password, displayName: 'Root Admin', accountType: 'teacher', language: 'en' },
    });
    if (reg.ok()) return ((await reg.json()) as { accessToken: string }).accessToken;
  }
  throw new Error('could not sign in as the bootstrap administrator (is the API running with ROOT_ADMIN_EMAIL?)');
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ROOT_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill('Sup3rSecret!pass');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);
}

/** Collects uncaught errors and console errors (ignoring failed network requests that tests trigger on purpose). */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()} → ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`${page.url()} → ${m.text()}`));
  return errors;
}

/** Gets a teacher verified (request + administrator approval), unlocking the public catalog, open classes and the library. */
export async function verifyTeacher(request: APIRequestContext, teacherToken: string) {
  const sent = await request.post('/api/v1/me/teacher-verification', {
    headers: { authorization: `Bearer ${teacherToken}` },
    data: { institution: 'E2E School', subject: 'Science', note: '', proofUrl: null },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  const req = (await sent.json()) as { id: string };
  const admin = await adminToken(request);
  const ok = await request.post(`/api/v1/admin/teacher-verifications/${req.id}/approve`, { headers: { authorization: `Bearer ${admin}` } });
  expect(ok.ok(), await ok.text()).toBeTruthy();
}

/** Verifies a teacher who signed up through the UI (signs in via the API to send the request). */
export async function verifyTeacherAccount(request: APIRequestContext, user: TestUser) {
  const login = await request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  await verifyTeacher(request, ((await login.json()) as { accessToken: string }).accessToken);
}
