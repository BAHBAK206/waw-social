import { expect, test } from '@playwright/test';
import { apiRegister, dismissOnboarding, login, newUser, trackErrors } from './helpers';

test('an under-13 student signs up, is kept to classes, and a parent links and opens public posting', async ({ page, browser, request }) => {
  const kid = newUser('kid');
  const parent = newUser('parent');
  await apiRegister(request, parent);
  // apiRegister makes a student; turn it into a parent account (the parent is an adult with no birth year).
  const pTok = (
    (await (await request.post('/api/v1/auth/login', { data: { email: parent.email, password: parent.password } })).json()) as { accessToken: string }
  ).accessToken;
  await request.patch('/api/v1/me', { headers: { authorization: `Bearer ${pTok}` }, data: { accountType: 'parent' } });

  const errors = trackErrors(page);
  await page.goto('/register');
  await page.getByLabel('Full name').fill(kid.name);
  await page.getByLabel('Email').fill(kid.email);
  await page.getByLabel('Password', { exact: true }).fill(kid.password);
  await page.getByLabel('School year').selectOption('p3');
  await expect(page.getByText(/Under 13: you can use classes/)).toBeVisible();
  // Under 13 a parent's email is required: the parent approves the account.
  await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await page.getByLabel('Parent’s email (needed under 13)').fill(parent.email);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);
  await expect(page.getByRole('region', { name: 'Ask a parent to approve your account' })).toBeVisible();

  // Posting publicly is off until a parent allows it.
  await page.goto('/feed');
  await page.getByPlaceholder(/Share something/i).fill('Hello everyone');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('Your parent has turned this off for your account.', { exact: false })).toBeVisible();

  // The parent asks to link; the child approves in Settings → Family.
  const ctx = await browser.newContext({ locale: 'en-US' });
  const pageP = await ctx.newPage();
  errors.push(...trackErrors(pageP));
  await login(pageP, parent);
  await pageP.goto('/family');
  await pageP.getByLabel('Child’s email or username').fill(kid.email);
  await pageP.getByRole('button', { name: 'Send invitation' }).click();
  await expect(pageP.getByText('If this student has an account, they’ll see your request.')).toBeVisible();

  await page.goto('/settings?tab=family');
  await expect(page.getByText(/wants to connect as your parent/)).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText(`${parent.name} is now linked.`)).toBeVisible();
  await expect(page.getByText('Set by your parent')).toBeVisible();

  // The parent opens public posting.
  await pageP.goto('/family');
  await expect(pageP.getByRole('heading', { name: `What ${kid.name} can do` })).toBeVisible();
  await pageP.getByRole('switch', { name: /Post publicly/ }).click();
  await pageP.getByRole('button', { name: 'Save' }).click();
  await expect(pageP.getByText(`Saved. ${kid.name} was told about the change.`)).toBeVisible();

  await page.goto('/feed');
  await page.getByPlaceholder(/Share something/i).fill('Thank you for allowing me!');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.locator('article', { hasText: 'Thank you for allowing me!' }).first()).toBeVisible();
  await ctx.close();
  expect(errors.filter((e) => !/403/.test(e))).toEqual([]);
});
