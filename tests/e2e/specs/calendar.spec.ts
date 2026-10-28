import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, trackErrors } from './helpers';

test('a teacher imports a class list from a CSV and a student subscribes to their calendar', async ({ page, browser, request }) => {
  const teacher = newUser('teacher');
  const student = newUser('pupil');
  const tToken = await apiRegister(request, teacher, 'teacher');
  await apiRegister(request, student);
  const course = await (await request.post('/api/v1/school/courses', { headers: { authorization: `Bearer ${tToken}` }, data: { title: 'History 10' } })).json();
  await request.post(`/api/v1/school/courses/${course.id}/assignments`, {
    headers: { authorization: `Bearer ${tToken}` },
    data: { title: 'Essay on the Silk Road', points: 20, dueAt: Date.now() + 4 * 86400_000 },
  });

  // Teacher: People → Import students → CSV (a Google Classroom export shape).
  const errors = trackErrors(page);
  await login(page, teacher);
  await page.goto(`/school/${course.id}?tab=people`);
  await page.getByRole('button', { name: 'Import students' }).click();
  const csv = `"First Name","Last Name","Email Address"\n"Pupil","One","${student.email}"\n"New","Kid","newkid.${Date.now()}@example.test"\n`;
  await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'classroom.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('2 emails found (max 500)')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 students' }).click();
  await expect(page.getByText('Added 1 · already in class 0 · invited 1')).toBeVisible();
  await expect(page.getByText(student.name)).toBeVisible();

  // Student: Settings → Data → Calendar sync, and the link serves an .ics with the homework.
  const ctx = await browser.newContext({ locale: 'en-US' });
  const pageS = await ctx.newPage();
  errors.push(...trackErrors(pageS));
  await login(pageS, student);
  await pageS.goto('/settings?tab=data');
  const link = pageS.getByLabel('Your calendar link');
  await expect(link).toHaveValue(/\.ics$/);
  const url = new URL(await link.inputValue());
  const ics = await request.get(url.pathname);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('Essay on the Silk Road');
  await expect(pageS.getByRole('link', { name: 'Add to Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com.*webcal/);
  await ctx.close();
  expect(errors).toEqual([]);
});
