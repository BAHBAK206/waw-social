import { expect, test } from '@playwright/test';
import { adminToken, apiRegister, login, newUser, ROOT_EMAIL, uid, verifyTeacher } from './helpers';

const auth = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

test('a principal downloads the school backup as a ZIP', async ({ page, request }) => {
  const admin = newUser('bkp');
  const token = await apiRegister(request, admin, 'teacher');
  await verifyTeacher(request, token);
  const sc = await request.post('/api/v1/schools', { ...auth(token), data: { name: `Backup School ${uid()}` } });
  const school = (await sc.json()) as { id: string };
  await login(page, admin);
  await page.goto(`/schools/${school.id}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download everything' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  const head = readFileSync(path!).subarray(0, 4);
  expect(head.readUInt32LE(0)).toBe(0x04034b50);
});

test('the administrator sees system health', async ({ page, request }) => {
  await adminToken(request);
  await login(page, { name: 'Root Admin', email: ROOT_EMAIL, password: 'Sup3rSecret!pass' });
  await page.goto('/admin?tab=health');
  await expect(page.getByTestId('health-overall')).toBeVisible();
  await expect(page.getByText('Database', { exact: true })).toBeVisible();
  await expect(page.getByText('Waiting for staff')).toBeVisible();
});

test('data saver is a setting that sticks', async ({ page, request }) => {
  const u = newUser('sav');
  await apiRegister(request, u);
  await login(page, u);
  await page.goto('/settings?tab=appearance');
  await page.getByRole('switch', { name: 'Data saver' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-saver', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-saver', 'true');
});
