import { expect, test } from '@playwright/test';
import { apiRegister, dismissOnboarding, newUser, trackErrors, uid } from './helpers';

test('a teacher sells a course with vouchers; a student redeems one, and earns a verifiable certificate', async ({ page, request, browser }) => {
  const errors = trackErrors(page);
  const teacher = newUser('seller');
  const student = newUser('buyer');
  const tToken = await apiRegister(request, teacher, 'teacher');
  await apiRegister(request, student);
  const title = `Physics Olympiad ${uid()}`;
  const auth = { authorization: `Bearer ${tToken}` };
  const course = await (
    await request.post('/api/v1/school/courses', { headers: auth, data: { title, listed: true, priceCents: 2500, currency: 'USD' } })
  ).json();
  const { codes } = await (await request.post(`/api/v1/school/courses/${course.id}/vouchers`, { headers: auth, data: { count: 1 } })).json();

  // A guest can browse the catalog.
  await page.goto('/courses');
  await page.getByLabel('Search courses…').fill(title);
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('$25.00').first()).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(student.email);
  await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);
  await page.goto(`/courses/${course.id}`);
  await page.getByLabel('Have a voucher?').fill(codes[0]);
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page).toHaveURL(new RegExp(`/school/${course.id}`));

  // Graded work, then a certificate from the teacher's course settings.
  const a = await (await request.post(`/api/v1/school/courses/${course.id}/assignments`, { headers: auth, data: { title: 'Final exam', points: 10 } })).json();
  const sToken = (await (await request.post('/api/v1/auth/login', { data: { email: student.email, password: student.password } })).json()).accessToken;
  await request.post(`/api/v1/school/assignments/${a.id}/submit`, { headers: { authorization: `Bearer ${sToken}` }, data: { text: 'My answers.' } });
  const subs = await (await request.get(`/api/v1/school/assignments/${a.id}/submissions`, { headers: auth })).json();
  await request.post(`/api/v1/school/submissions/${subs.items[0].id}/grade`, { headers: auth, data: { grade: 9 } });

  const ctxT = await browser.newContext({ locale: 'en-US' });
  const pageT = await ctxT.newPage();
  errors.push(...trackErrors(pageT));
  await pageT.goto('/login');
  await pageT.getByLabel('Email').fill(teacher.email);
  await pageT.getByLabel('Password', { exact: true }).fill(teacher.password);
  await pageT.getByRole('button', { name: 'Sign in' }).click();
  await expect(pageT).toHaveURL(/\/$/);
  await dismissOnboarding(pageT);
  await pageT.goto(`/school/${course.id}?tab=settings`);
  await expect(pageT.getByRole('region', { name: 'Vouchers' }).getByText(`Used by ${student.name}`)).toBeVisible();
  const certs = pageT.getByRole('region', { name: 'Certificates' });
  await certs.getByRole('button', { name: 'Issue certificates' }).click();
  await expect(pageT.getByText('1 certificate issued.')).toBeVisible();

  // The student opens it; anyone can verify it without signing in.
  await page.goto('/certificates');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
  await expect(page.getByText('Final grade 90%')).toBeVisible();
  const url = page.url();
  const guest = await browser.newContext({ locale: 'en-US' });
  const pg = await guest.newPage();
  await pg.goto(url);
  await expect(pg.getByText('Valid certificate')).toBeVisible();
  expect(errors).toEqual([]);
});
