import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors, uid } from './helpers';

test('create a group, post in it, a second member joins and chats', async ({ browser }) => {
  const owner = newUser('owner');
  const member = newUser('member');
  const ctxO = await browser.newContext({ locale: 'en-US' });
  const ctxM = await browser.newContext({ locale: 'en-US' });
  const pageO = await ctxO.newPage();
  const pageM = await ctxM.newPage();
  const errors = [...trackErrors(pageO), ...trackErrors(pageM)];
  await register(pageO, owner);
  await register(pageM, member);

  const name = `Study circle ${uid()}`;
  await pageO.goto('/groups');
  await pageO.getByRole('button', { name: 'Create study group' }).click();
  await pageO.getByRole('dialog').getByLabel('Name').fill(name);
  await pageO.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(pageO.getByRole('heading', { level: 1, name })).toBeVisible();
  const groupUrl = pageO.url();

  const post = `Welcome to ${name}!`;
  await pageO.getByPlaceholder(/Share something/i).fill(post);
  await pageO.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(pageO.getByText(post)).toBeVisible();

  // The second user discovers the public group, joins, and sees the post.
  await pageM.goto(groupUrl);
  await pageM.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(pageM.getByText(post)).toBeVisible();
  await pageM.getByRole('tab', { name: 'Chat' }).click();
  await pageM.getByPlaceholder('Type a message…').fill('Hello circle');
  await pageM.keyboard.press('Enter');
  await expect(pageM.getByRole('log').getByText('Hello circle')).toBeVisible();

  await pageO.getByRole('tab', { name: 'Chat' }).click();
  await expect(pageO.getByRole('log').getByText('Hello circle')).toBeVisible({ timeout: 15_000 });

  // Members tab lists both people; the owner can see the settings tab, the member cannot.
  await pageO.getByRole('tab', { name: 'Members' }).click();
  await expect(pageO.getByText(member.name)).toBeVisible();
  await expect(pageO.getByRole('tab', { name: 'Settings' })).toBeVisible();
  await expect(pageM.getByRole('tab', { name: 'Settings' })).toHaveCount(0);

  expect(errors).toEqual([]);
  await ctxO.close();
  await ctxM.close();
});
