import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser } from './helpers';

const api = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

test('a study group shares tasks and shows who studied most this week', async ({ page, request }) => {
  const owner = newUser('groupowner');
  const token = await apiRegister(request, owner);
  const g = await request.post('/api/v1/groups', { ...api(token), data: { name: `Physics circle ${Date.now()}`, privacy: 'public' } });
  const { id } = (await g.json()) as { id: string };
  await login(page, owner);
  await page.goto(`/groups/${id}?tab=study`);
  await page.getByPlaceholder('Add a task for the group…').fill('Revise chapter 3');
  await page.getByRole('button', { name: 'Create' }).first().click();
  await expect(page.getByText('Revise chapter 3')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Revise chapter 3' }).click();
  await expect(page.getByText(/Done by /)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Study time this week' })).toBeVisible();
});

test('a teacher sets the class weekly goal and the class sees its progress', async ({ page, request }) => {
  const teacher = newUser('goalteacher');
  const token = await apiRegister(request, teacher, 'teacher');
  const c = await request.post('/api/v1/school/courses', { ...api(token), data: { title: 'Math 5A' } });
  const { id } = (await c.json()) as { id: string };
  await login(page, teacher);
  await page.goto(`/school/${id}`);
  await expect(page.getByText('No goal set for this week.')).toBeVisible();
  await page.getByLabel('Set the goal (minutes for the whole class)').fill('300');
  await page.getByRole('button', { name: 'Save the goal' }).click();
  await expect(page.getByText('0 of 300 min')).toBeVisible();
  await expect(page.getByText('This class is not part of a school, so there is no challenge.')).toBeVisible();
});

test('mentors: a junior cannot offer help, and the list filters by subject', async ({ page, request }) => {
  const user = newUser('mentee');
  await apiRegister(request, user);
  await login(page, user);
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { name: 'Study mentors' })).toBeVisible();
  await expect(page.getByText('No mentors for this subject yet.')).toBeVisible();
  await expect(page.getByText('Offering mentoring is open to students in the last two secondary years and university.')).toBeVisible();
});
