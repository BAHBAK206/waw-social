import { expect, test } from '@playwright/test';
import { newUser, register } from './helpers';

test('two users chat in real time with typing and delivery', async ({ browser }) => {
  const a = newUser('alice');
  const b = newUser('bob');
  const ctxA = await browser.newContext({ locale: 'en-US' });
  const ctxB = await browser.newContext({ locale: 'en-US' });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await register(pageA, a);
  await register(pageB, b);

  // Alice finds Bob and opens a direct conversation from his profile.
  await pageA.goto('/people');
  await pageA.getByPlaceholder(/Search by name/i).fill(b.name);
  await pageA
    .getByRole('link', { name: new RegExp(b.name) })
    .first()
    .click();
  await pageA.getByRole('button', { name: 'Message' }).click();
  await expect(pageA).toHaveURL(/\/chat\//);

  // Bob is already on the messages screen; the conversation must appear without a reload.
  await pageB.goto('/chat');
  await pageA.getByPlaceholder('Type a message…').fill('Hi Bob, are you there?');
  await pageA.keyboard.press('Enter');
  await expect(pageA.getByRole('log').getByText('Hi Bob, are you there?')).toBeVisible();

  await pageB
    .getByRole('link', { name: new RegExp(a.name) })
    .first()
    .click({ timeout: 15_000 });
  await expect(pageB.getByRole('log').getByText('Hi Bob, are you there?')).toBeVisible();

  await pageB.getByPlaceholder('Type a message…').fill('Yes! Loud and clear.');
  await pageB.keyboard.press('Enter');
  await expect(pageA.getByRole('log').getByText('Yes! Loud and clear.')).toBeVisible({ timeout: 15_000 });

  await ctxA.close();
  await ctxB.close();
});
