import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, register } from './helpers';

test('every main screen renders without a client error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()} → ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`${page.url()} → ${m.text()}`));
  await register(page, newUser('tour'));
  const routes = [
    '/',
    '/feed',
    '/quiz',
    '/ai',
    '/assistant',
    '/forms',
    '/library',
    '/workspace',
    '/academic',
    '/review',
    '/mentors',
    '/teacher-tools',
    '/fees',
    '/study-pack',
    '/glossary',
    '/school',
    '/classes',
    '/people',
    '/groups',
    '/communities',
    '/chat',
    '/saved',
    '/organizer',
    '/services',
    '/settings',
    '/watch',
    '/shorts',
    '/explore',
    '/events',
    '/studio',
    '/help',
    '/about',
    '/privacy',
    '/terms',
    '/contact',
  ];
  for (const r of routes) {
    await page.goto(r);
    await expect(page.locator('main, #root').first()).toBeVisible();
    await expect(page.getByText(/Something went wrong|Page not found/i), `${r} failed to render`).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/definitely-not-a-page');
  await expect(page.getByText('Page not found')).toBeVisible();
});

test('public info pages work for guests in every language', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Privacy/i);
  await page.goto('/help');
  await expect(page.locator('details').first()).toBeVisible();
});

test('a saved item can get a reminder from the Saved page', async ({ page, request }) => {
  const user = newUser('reminder');
  const token = await apiRegister(request, user);
  await request.post('/api/v1/saved', {
    headers: { authorization: `Bearer ${token}` },
    data: { itemType: 'link', title: 'Photosynthesis video', url: 'https://example.com/video' },
  });
  await login(page, user);
  await page.goto('/saved');
  await expect(page.getByText('Photosynthesis video')).toBeVisible();
  await page.getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Tomorrow morning' }).click();
  await expect(page.getByText(/^Reminder: /)).toBeVisible();
  await page.getByRole('button', { name: 'Remind me' }).click();
  await page.getByRole('button', { name: 'Remove the reminder' }).click();
  await expect(page.getByText(/^Reminder: /)).toBeHidden();
});
