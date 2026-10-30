import { expect, test } from '@playwright/test';
import { apiRegister, newUser, trackErrors } from './helpers';

test('the mobile app opens web tools signed in and without the web navigation', async ({ page, request }) => {
  const errors = trackErrors(page);
  const user = newUser('embedded');
  const token = await apiRegister(request, user);
  const h = await request.post('/api/v1/auth/handoff', { headers: { authorization: `Bearer ${token}` } });
  expect(h.ok()).toBeTruthy();
  const { code } = (await h.json()) as { code: string };

  await page.goto(`/workspace?handoff=${code}&embed=1`);
  await expect(page.getByRole('heading', { name: 'Workspace' }).first()).toBeVisible();
  // The one-time code is removed from the address and the web chrome is hidden.
  await expect(page).not.toHaveURL(/handoff=/);
  await expect(page.getByRole('navigation', { name: /main|primary/i })).toHaveCount(0);
  await expect(page.locator('aside').filter({ hasText: 'Study hall' })).toHaveCount(0);

  // The code works only once.
  const again = await request.post('/api/v1/auth/handoff/redeem', { data: { code } });
  expect(again.status()).toBe(401);
  expect(errors).toEqual([]);
});
