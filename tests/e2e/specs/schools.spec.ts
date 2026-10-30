import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser, trackErrors, uid, verifyTeacher } from './helpers';

test('a school admin imports people from a spreadsheet, creates a class and prints report cards', async ({ page, request }) => {
  const admin = newUser('principal');
  const token = await apiRegister(request, admin, 'teacher');
  await verifyTeacher(request, token);
  const tag = uid();
  const errors = trackErrors(page);
  await login(page, admin);

  await page.goto('/schools');
  await page.getByRole('button', { name: 'New school' }).click();
  await page.getByLabel('School name').fill(`Nile School ${tag}`);
  await page.getByLabel('Principal (printed on report cards)').fill('Dr Amal');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: `Nile School ${tag}` })).toBeVisible();

  // People from a CSV with Arabic column names.
  await page.getByRole('tab', { name: 'People' }).click();
  await page.getByRole('button', { name: 'Add people from a spreadsheet' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose the CSV file' }).click();
  const csv = ['الاسم,الدور,الصف,الفصل,رقم الطالب', `Ali ${tag},طالب,5 ابتدائي,5A,1001`, `Sara ${tag},طالب,5 ابتدائي,5A,1002`, 'X,طالب,,,'].join('\n');
  await (await chooser).setFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('2 people ready')).toBeVisible();
  await expect(page.getByText('Line 4: missing name')).toBeVisible();
  await page.getByRole('button', { name: 'Add them' }).click();
  const creds = page.getByRole('region', { name: 'New accounts — print and hand out' });
  await expect(creds.getByText(`Ali ${tag}`)).toBeVisible();
  await expect(creds.getByText(/school\.invalid/).first()).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // A class for 5A taught by the admin.
  await page.getByRole('tab', { name: 'Classes' }).click();
  await page.locator('input[list="school-sections"]').fill('5A');
  await page.getByLabel('Subject', { exact: true }).fill('Arabic');
  await page.getByLabel('Teacher').selectOption({ label: admin.name });
  await page.getByRole('button', { name: 'New class subject' }).last().click();
  await expect(page.getByText('Class created and its students added.')).toBeVisible();
  await expect(page.getByText('5A · ' + admin.name + ' · 2 students')).toBeVisible();

  // Report cards for 5A: one page per student.
  await page.getByRole('tab', { name: 'Report cards' }).click();
  await page.getByRole('link', { name: 'Open report cards' }).click();
  await expect(page.locator('article.report-card')).toHaveCount(2);
  await expect(page.getByText('Dr Amal')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
  expect(errors).toEqual([]);
});
