import { expect, test } from '@playwright/test';
import { apiRegister, dismissOnboarding, loginAsAdmin, newUser, trackErrors, uid } from './helpers';

test('a student under 18 signs up with a birth year and sees the protection notice', async ({ page }) => {
  const errors = trackErrors(page);
  const u = newUser('teen');
  await page.goto('/register');
  await page.getByLabel('Full name').fill(u.name);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password', { exact: true }).fill(u.password);
  await page.getByLabel('Birth year').selectOption(String(new Date().getFullYear() - 14));
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);

  await page.goto('/settings?tab=privacy');
  await expect(page.getByText(/Your account is protected because you are under 18/)).toBeVisible();
  await page.goto('/settings?tab=profile');
  await expect(page.getByLabel('Birth year')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('insults are masked, threats are refused, and members can report an answer', async ({ page, request }) => {
  const errors = trackErrors(page);
  const author = newUser('asker');
  const token = await apiRegister(request, author);
  const question = `Why do leaves change colour? ${uid()}`;
  const post = await request.post('/api/v1/posts', { headers: { authorization: `Bearer ${token}` }, data: { kind: 'question', text: question } });
  expect(post.ok()).toBeTruthy();
  const postId = ((await post.json()) as { id: string }).id;

  const reader = newUser('reader');
  await page.goto('/register');
  await page.getByLabel('Full name').fill(reader.name);
  await page.getByLabel('Email').fill(reader.email);
  await page.getByLabel('Password', { exact: true }).fill(reader.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);

  await page.goto('/feed');
  const box = page.getByPlaceholder('Ask a question or share something you learned…');
  await box.fill(`This homework is shit honestly ${uid()}`);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(/This homework is s\*\*\* honestly/).first()).toBeVisible();

  await box.fill('just kill yourself');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(/can’t be published/)).toBeVisible();

  // An answer from someone else can be reported from the thread.
  const answer = await request.post(`/api/v1/posts/${postId}/comments`, {
    headers: { authorization: `Bearer ${token}` },
    data: { text: 'Join my private group for the answer' },
  });
  expect(answer.ok()).toBeTruthy();
  await page.goto(`/post/${postId}`);
  const card = page.locator('article', { hasText: question }).first();
  const answerRow = card.locator('li', { hasText: 'Join my private group for the answer' });
  await answerRow.getByRole('button', { name: 'Report' }).click();
  await page.getByRole('dialog').getByLabel('Reason').selectOption('spam');
  await page.getByRole('dialog').getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText('Report sent. Thank you.')).toBeVisible();
  expect(errors.filter((e) => !/422/.test(e))).toEqual([]);
});

test('the administrator manages the automatic filter', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin?tab=site');
  await expect(page.getByRole('heading', { name: 'Automatic content filter' })).toBeVisible();
  await expect(page.getByLabel('Words to hide with stars')).toBeVisible();
  await expect(page.getByLabel(/Hide an item automatically/)).toHaveValue('3');
});
