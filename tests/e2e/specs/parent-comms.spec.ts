import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser } from './helpers';

const H = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const local = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function setup(request: Parameters<typeof apiRegister>[0]) {
  const teacher = newUser('mteacher');
  const student = newUser('mkid');
  const parent = newUser('mparent');
  const tToken = await apiRegister(request, teacher, 'teacher');
  const sToken = await apiRegister(request, student);
  const pToken = await apiRegister(request, parent, 'parent');
  const course = (await (await request.post('/api/v1/school/courses', { ...H(tToken), data: { title: 'Science 7' } })).json()) as {
    id: string;
    joinCode: string;
  };
  await request.post('/api/v1/school/join', { ...H(sToken), data: { code: course.joinCode } });
  const code = (await (await request.post('/api/v1/family/code', H(sToken))).json()) as { code: string };
  const link = await request.post('/api/v1/family/link', { ...H(pToken), data: { code: code.code } });
  expect(link.ok(), await link.text()).toBeTruthy();
  return { teacher, student, parent, tToken, pToken, course };
}

test('a teacher publishes meeting slots and a parent books one', async ({ page, request, browser }) => {
  const { teacher, parent, student } = await setup(request);
  await login(page, teacher);
  await page.goto('/meetings');
  const start = Date.now() + 2 * 86_400_000;
  await page.getByLabel('From').fill(local(start));
  await page.getByLabel('Until').fill(local(start + 3_600_000));
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('4 slots published.')).toBeVisible();

  const ctx = await browser.newContext();
  const pp = await ctx.newPage();
  await login(pp, parent);
  await pp.goto('/meetings');
  await expect(pp.getByText(teacher.name)).toBeVisible();
  await pp.locator('button.chip').first().click();
  await pp.getByLabel('What would you like to talk about? (optional)').fill('How is he doing in science?');
  await pp.getByRole('dialog').getByRole('button', { name: 'Book' }).click();
  await expect(pp.getByText('Meeting booked.')).toBeVisible();
  await expect(pp.getByText(`Booked by ${parent.name} for ${student.name}`)).toBeVisible();
  await ctx.close();

  await page.reload();
  await expect(page.getByText(`Booked by ${parent.name} for ${student.name}`)).toBeVisible();
});

test('a parent says "I saw it" on homework and the teacher sees the count', async ({ page, request, browser }) => {
  const { teacher, parent, tToken, course } = await setup(request);
  const hw = (await (
    await request.post(`/api/v1/school/courses/${course.id}/assignments`, {
      ...H(tToken),
      data: { title: 'Plant cells worksheet', points: 10, dueAt: Date.now() + 2 * 86_400_000 },
    })
  ).json()) as { id: string };
  await login(page, parent);
  await page.goto('/family');
  const box = page.getByRole('region', { name: 'Homework to check' });
  await expect(box.getByText('Plant cells worksheet')).toBeVisible();
  await box.getByRole('button', { name: 'I saw it' }).click();
  await expect(box.getByText('Seen')).toBeVisible();

  const ctx = await browser.newContext();
  const tp = await ctx.newPage();
  await login(tp, teacher);
  await tp.goto(`/school/assignments/${hw.id}`);
  await expect(tp.getByText('1 of 1 parents saw it')).toBeVisible();
  await ctx.close();
});
