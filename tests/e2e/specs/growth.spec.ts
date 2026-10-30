import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, uid, verifyTeacher } from './helpers';

const auth = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const local = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test('a discount code lowers the price and a 100% code enrolls for free', async ({ page, request }) => {
  const teacher = newUser('ctch');
  const student = newUser('cstu');
  const tToken = await apiRegister(request, teacher, 'teacher');
  await verifyTeacher(request, tToken);
  await apiRegister(request, student);
  // Codes are unique across the platform, so every run makes its own.
  const tag = uid().toUpperCase();
  const half = `HALF${tag}`;
  const gift = `GIFT${tag}`;
  const course = (await (
    await request.post('/api/v1/school/courses', {
      ...auth(tToken),
      data: { title: `Paid Physics ${uid()}`, listed: true, priceCents: 40000, currency: 'EGP' },
    })
  ).json()) as { id: string };
  await request.post('/api/v1/coupons', { ...auth(tToken), data: { courseId: course.id, code: half, percentOff: 50 } });
  await request.post('/api/v1/coupons', { ...auth(tToken), data: { courseId: course.id, code: gift, percentOff: 100, maxUses: 1 } });

  await login(page, student);
  await page.goto(`/courses/${course.id}`);
  await page.getByLabel('Discount code').fill(half.toLowerCase());
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/Code applied: .*200.* off — you pay .*200/)).toBeVisible();
  await page.getByLabel('Discount code').fill(gift);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Code applied: the course is free for you.')).toBeVisible();
  await page.getByRole('button', { name: 'Join for free' }).click();
  await expect(page).toHaveURL(new RegExp(`/school/${course.id}`));
});

test('a teacher publishes a free private lesson, a student books it and both see the join button', async ({ page, request, browser }) => {
  const teacher = newUser('ltch');
  const student = newUser('lstu');
  const tToken = await apiRegister(request, teacher, 'teacher');
  await verifyTeacher(request, tToken);
  await apiRegister(request, student);

  const title = `Free intro ${uid()}`;
  await login(page, teacher);
  await page.goto('/lessons?tab=publish');
  const start = Date.now() + 3 * 86_400_000;
  await page.getByLabel('Lesson title').fill(title);
  await page.getByLabel('From').fill(local(start));
  await page.getByLabel('Until').fill(local(start + 2 * 3_600_000));
  await page.getByRole('button', { name: 'Publish slots' }).click();
  await expect(page.getByText('2 slots published, 0 skipped (overlapping).')).toBeVisible();

  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await login(sp, student);
  await sp.goto('/lessons');
  await sp.getByRole('listitem').filter({ hasText: title }).first().getByRole('button', { name: 'Book', exact: true }).click();
  await sp.getByRole('button', { name: 'Book for free' }).click();
  await expect(sp.getByText('Booked.')).toBeVisible();
  await sp.getByRole('tab', { name: 'My lessons' }).click();
  await expect(sp.getByRole('link', { name: 'Join the lesson' })).toBeVisible();
  await page.goto('/lessons');
  await expect(page.getByRole('link', { name: 'Join the lesson' })).toBeVisible();
  await ctx.close();
});

test('a student turns the portfolio on and anyone can open it; the invite page shows the code', async ({ page, request, browser }) => {
  const student = newUser('pstu');
  await apiRegister(request, student);
  await login(page, student);
  await page.goto('/portfolio');
  await page.getByLabel('One line about you').fill('Future engineer');
  await page.getByRole('switch', { name: 'Make my page public' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const slug = (await page.getByLabel('Page address').inputValue()).trim();
  expect(slug.length).toBeGreaterThan(2);

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`/p/${slug}`);
  await expect(guest.getByText('Future engineer')).toBeVisible();
  await ctx.close();

  await page.goto('/invite');
  const code = (await page.getByTestId('referral-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await expect(page.getByText(`/register?ref=${code}`)).toBeVisible();
});

test('a school sees its plan and student limit', async ({ page, request }) => {
  const admin = newUser('pplan');
  const token = await apiRegister(request, admin, 'teacher');
  await verifyTeacher(request, token);
  const sc = await request.post('/api/v1/schools', { ...auth(token), data: { name: `Plan School ${uid()}` } });
  const school = (await sc.json()) as { id: string };
  await login(page, admin);
  await page.goto(`/schools/${school.id}?tab=plan`);
  await expect(page.getByTestId('plan-usage')).toContainText('0 of 50 students');
  await expect(page.getByText('Standard').first()).toBeVisible();
});
