import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors, uid } from './helpers';

test('ask a question, a teacher answers, the asker marks the best answer', async ({ browser }) => {
  const student = newUser('curious');
  const teacher = newUser('mentor');
  const ctxS = await browser.newContext({ locale: 'en-US' });
  const ctxT = await browser.newContext({ locale: 'en-US' });
  const pageS = await ctxS.newPage();
  const pageT = await ctxT.newPage();
  const errors = [...trackErrors(pageS), ...trackErrors(pageT)];
  await register(pageS, student);
  await register(pageT, teacher, 'teacher');

  const question = `Why do we divide by 2 in the area of a triangle? ${uid()}`;
  await pageS.goto('/feed?scope=questions');
  await pageS.getByRole('radio', { name: 'Question' }).check();
  await pageS.getByPlaceholder(/What do you want to understand/).fill(question);
  await pageS.getByRole('button', { name: 'Ask', exact: true }).click();
  const cardS = pageS.locator('article', { hasText: question }).first();
  await expect(cardS.getByText(/Question · Needs an answer/)).toBeVisible();

  // The teacher finds it among unanswered questions and answers.
  await pageT.goto('/feed?scope=questions&open=1');
  const cardT = pageT.locator('article', { hasText: question }).first();
  await expect(cardT).toBeVisible();
  await cardT.getByRole('button', { name: 'Answers', exact: true }).click();
  await cardT.getByPlaceholder(/Write an answer/).fill('A triangle is half of a rectangle with the same base and height.');
  await cardT.getByRole('button', { name: 'Send' }).click();
  await expect(cardT.getByText('half of a rectangle')).toBeVisible();
  await expect(cardT.getByText('Teacher', { exact: true }).first()).toBeVisible();

  // The student marks it as the best answer: the question becomes solved.
  await pageS.reload();
  const card = pageS.locator('article', { hasText: question }).first();
  await card
    .getByRole('button', { name: /1 answers?|Answers/ })
    .first()
    .click();
  await card.getByRole('button', { name: 'Mark as best answer' }).click();
  await expect(card.getByText('Best answer')).toBeVisible();
  await expect(card.getByText(/Question · Solved/)).toBeVisible();

  // Solved questions leave the "Needs an answer" list.
  await pageT.reload();
  await expect(pageT.locator('article', { hasText: question })).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctxS.close();
  await ctxT.close();
});

test('pronunciation lab: listen, speak, get a score and the words to practise', async ({ page }) => {
  // Simulated speech engine: speechSynthesis resolves immediately; recognition "hears" a fixed sentence.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__heard = 'the cell is the unit of life';
    class FakeRecognition {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const alt = { transcript: String(w.__heard), confidence: 0.9 };
          const res = Object.assign([alt], { isFinal: true });
          this.onresult?.({ results: [res] });
          this.onend?.();
        }, 150);
      }
      stop() {}
      abort() {}
    }
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
  });
  const errors = trackErrors(page);
  await register(page, newUser('speaker'));
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Pronunciation lab' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Science & math words' }).click();
  // Jump to "The cell is the basic unit of life".
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next phrase' }).click();
  await expect(page.getByText('The cell is the basic unit of life')).toBeVisible();
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.getByText(/We heard: “the cell is the unit of life”/)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Pronunciation score' })).toBeVisible();
  await expect(page.getByText('Practise these words:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'basic', exact: true })).toBeVisible();

  // A perfect attempt in Arabic earns XP.
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__heard = 'صباح الخير يا استاذ'));
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.getByRole('button', { name: 'Everyday phrases' }).click();
  await page.getByRole('button', { name: 'Next phrase' }).click();
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.getByText('100%').first()).toBeVisible();
  await expect(page.getByText('+2 XP').first()).toBeVisible();
  expect(errors).toEqual([]);
});
