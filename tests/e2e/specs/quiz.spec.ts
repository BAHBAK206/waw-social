import { expect, test } from '@playwright/test';
import { apiRegister, dismissOnboarding, newUser, uid } from './helpers';

test('a teacher publishes a quiz and a student takes it and sees graded results', async ({ browser, request }) => {
  const teacher = newUser('teacher');
  const student = newUser('student');
  const token = await apiRegister(request, teacher, 'teacher');
  const title = `E2E quiz ${uid()}`;
  const created = await request.post('/api/v1/quizzes', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      title,
      description: 'Created by the end-to-end suite',
      kind: 'quiz',
      difficulty: 'easy',
      durationSec: 600,
      published: true,
      shuffle: false,
      questions: [
        { type: 'mc', prompt: 'What is 2 + 2?', options: ['3', '4', '5'], answer: 1, points: 1, topic: 'math' },
        { type: 'tf', prompt: 'The sky is green.', options: ['True', 'False'], answer: 1, points: 1, topic: 'science' },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.getByLabel('Full name').fill(student.name);
  await page.getByLabel('Email').fill(student.email);
  await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboarding(page);

  await page.goto('/quiz');
  await page.getByPlaceholder(/Search quizzes/i).fill(title);
  await page.getByText(title).first().click();
  await page
    .getByRole('button', { name: /^Start/ })
    .first()
    .click();

  await page
    .getByRole('radio', { name: '4' })
    .or(page.getByText('4', { exact: true }))
    .first()
    .click();
  await page.getByRole('button', { name: /Next/i }).click();
  await page.getByText('False', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await page
    .getByRole('button', { name: /Submit/ })
    .last()
    .click();

  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.getByText('2 / 2 correct')).toBeVisible();
  await ctx.close();
});
