import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser } from './helpers';

async function classWithStudent(request: Parameters<typeof apiRegister>[0], teacherToken: string, studentName: string) {
  const student = newUser(studentName);
  const sToken = await apiRegister(request, student);
  const c = await request.post('/api/v1/school/courses', {
    headers: { authorization: `Bearer ${teacherToken}` },
    data: { title: 'Science 6A', subject: 'Science' },
  });
  const course = (await c.json()) as { id: string; joinCode: string };
  await request.post('/api/v1/school/join', { headers: { authorization: `Bearer ${sToken}` }, data: { code: course.joinCode } });
  return { student, course };
}

test('a teacher turns typed answers into suggested marks and can change them', async ({ page, request }) => {
  const teacher = newUser('papert');
  const token = await apiRegister(request, teacher, 'teacher');
  const { student } = await classWithStudent(request, token, 'paperkid');
  await login(page, teacher);
  await page.goto('/teacher-tools?tab=paper');
  await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Science 6A' });
  await page.getByLabel('Student', { exact: true }).selectOption({ label: student.name });
  await page.getByLabel('Student’s answers (edit what was read)').fill('1) Cairo   2) plants use light and chlorophyll');
  await page.getByPlaceholder('Accepted answers (separate with commas)').fill('Cairo');
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByPlaceholder('Accepted answers (separate with commas)').nth(1).fill('light, chlorophyll');
  await page.getByRole('spinbutton', { name: 'Points' }).nth(1).fill('4');
  await page.getByRole('button', { name: 'Suggest marks' }).click();
  await expect(page.getByText('Total 5 of 5')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Marks 2' }).fill('2');
  await expect(page.getByText('Total 3 of 5')).toBeVisible();
  await expect(page.getByText('This class has no manual grade component yet')).toBeVisible();
});

test('a teacher writes a suggested note and the student sees it on their grades page', async ({ page, request, browser }) => {
  const teacher = newUser('notet');
  const token = await apiRegister(request, teacher, 'teacher');
  const { student } = await classWithStudent(request, token, 'notekid');
  await login(page, teacher);
  await page.goto('/teacher-tools?tab=comments');
  await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Science 6A' });
  await page.getByLabel('Student', { exact: true }).selectOption({ label: student.name });
  await page.getByRole('button', { name: 'Write a note for me' }).click();
  await expect(page.getByLabel('Note (you can edit it before sending)')).toHaveValue(/hasn’t been graded|has not been graded/);
  await page.getByLabel('Note (you can edit it before sending)').fill('Please bring your notebook on Sunday so we can catch up.');
  await page.getByRole('button', { name: 'Send to the student and parents' }).click();
  await expect(page.getByText('Note sent.')).toBeVisible();

  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await login(sp, student);
  await sp.goto('/grades');
  await expect(sp.getByRole('heading', { name: 'Notes from your teachers' })).toBeVisible();
  await expect(sp.getByText('Please bring your notebook on Sunday')).toBeVisible();
  await ctx.close();
});
