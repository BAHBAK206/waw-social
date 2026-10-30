import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, trackErrors } from './helpers';

test('a teacher sets a subject out of 60, splits it into parts, types exam marks, and the student sees the report card', async ({ page, browser, request }) => {
  const teacher = newUser('teacher');
  const student = newUser('pupil');
  const tToken = await apiRegister(request, teacher, 'teacher');
  const sToken = await apiRegister(request, student);
  const course = await (await request.post('/api/v1/school/courses', { headers: { authorization: `Bearer ${tToken}` }, data: { title: 'Science' } })).json();
  await request.post('/api/v1/school/join', { headers: { authorization: `Bearer ${sToken}` }, data: { code: course.joinCode } });

  const errors = trackErrors(page);
  await login(page, teacher);
  await page.goto(`/school/${course.id}?tab=settings`);
  await page.getByLabel('Subject code').fill('SCI-2');
  await page.getByLabel('Total marks (out of)').fill('60');
  await page.getByLabel('Pass mark').fill('30');
  await page.getByLabel('Term', { exact: true }).fill('Term 1');
  await page.getByRole('button', { name: 'Add a part' }).click();
  await page.getByLabel('Part').first().fill('Final exam');
  await expect(page.getByText('60 of 60 marks split')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).nth(1).click();
  await expect(page.getByText('Saved').first()).toBeVisible();

  await page.goto(`/school/${course.id}?tab=grades`);
  const cell = page.getByLabel(`Final exam — ${student.name}`);
  await cell.fill('51');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Marks saved')).toBeVisible();
  await expect(page.getByRole('cell', { name: '51 (85%)' })).toBeVisible();
  await expect(page.getByText('Excellent').first()).toBeVisible();

  const ctx = await browser.newContext({ locale: 'en-US' });
  const pageS = await ctx.newPage();
  errors.push(...trackErrors(pageS));
  await login(pageS, student);
  await pageS.goto('/grades');
  await expect(pageS.getByRole('heading', { name: 'Report card' })).toBeVisible();
  await expect(pageS.getByText('SCI-2 · Teacher:')).toBeVisible();
  await expect(pageS.getByText('51 / 60').first()).toBeVisible();
  await pageS.getByRole('button', { name: /Science/ }).click();
  await expect(pageS.getByText('Final exam')).toBeVisible();
  await ctx.close();
  expect(errors).toEqual([]);
});
