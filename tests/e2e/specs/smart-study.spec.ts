import { expect, test } from '@playwright/test';
import { apiRegister, login, newUser } from './helpers';

const LESSON = `Photosynthesis
Photosynthesis is the process by which plants make food from light. Plants use chlorophyll to absorb light.
Chlorophyll is a green pigment found in the chloroplasts of plant cells.
Respiration
Respiration is the release of energy from food inside cells. Cells use oxygen during respiration.`;

test('a lesson becomes a study pack, and its terms land in the glossary', async ({ page, request }) => {
  const user = newUser('pack');
  await apiRegister(request, user);
  await login(page, user);
  await page.goto('/study-pack');
  await page.getByLabel('Lesson text').fill(LESSON);
  await page.getByRole('button', { name: 'Make the study pack' }).click();
  await expect(page.getByRole('heading', { name: 'Key terms' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mind map' })).toBeVisible();
  await page.getByLabel('Subject (for the glossary)').fill('Biology');
  await page.getByRole('button', { name: 'Save flashcards and terms' }).click();
  await expect(page.getByText(/flashcards? and \d+ terms? saved/)).toBeVisible();
  await page.goto('/glossary');
  await expect(page.getByText('Chlorophyll').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biology' })).toBeVisible();
});

test('the daily review walks through due flashcards', async ({ page, request }) => {
  const user = newUser('review');
  const token = await apiRegister(request, user);
  await request.post('/api/v1/flashcards', {
    headers: { authorization: `Bearer ${token}` },
    data: { front: 'Mitochondria', back: 'Powerhouse of the cell', deck: 'bio' },
  });
  await login(page, user);
  await page.goto('/review');
  await expect(page.getByText(/1 item/)).toBeVisible();
  await page.getByRole('button', { name: 'Practice' }).click();
  await page.getByRole('button', { name: 'Mitochondria' }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByText(/Done for today/)).toBeVisible();
});

test('focus mode hides the social pages until it ends', async ({ page, request }) => {
  const user = newUser('focus');
  await apiRegister(request, user);
  await login(page, user);
  await page.goto('/review');
  const nav = page.getByRole('navigation', { name: 'Menu' }).first();
  await expect(nav.getByRole('link', { name: 'Study hall' })).toBeVisible();
  await page.getByRole('button', { name: '25 min' }).click();
  await expect(page.getByText(/Focus mode · \d\d:\d\d left/)).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Study hall' })).toBeHidden();
  await page.getByRole('status').getByRole('button', { name: 'End focus' }).click();
  await expect(nav.getByRole('link', { name: 'Study hall' })).toBeVisible();
});

test('a term can be added to the glossary by hand', async ({ page, request }) => {
  const user = newUser('gloss');
  await apiRegister(request, user);
  await login(page, user);
  await page.goto('/glossary');
  await page.getByRole('button', { name: 'Add a term' }).click();
  const form = page.locator('form');
  await form.getByLabel('Subject').fill('Physics');
  await form.getByRole('textbox', { name: 'Term' }).fill('Velocity');
  await form.getByLabel('Meaning').fill('Speed in a given direction');
  await form.getByRole('button', { name: 'Add a term' }).click();
  await expect(page.getByText('Speed in a given direction')).toBeVisible();
});
