import { expect, test } from '@playwright/test';
import { newUser, register, trackErrors, uid } from './helpers';

test.describe('stories, polls and events', () => {
  test('share a text story and see it in the tray', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, newUser('storyteller'));
    await page.goto('/feed');
    await page
      .getByRole('button', { name: /Share a tip|Your tip/ })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder(/A formula, a mnemonic/)
      .fill('Exam tomorrow, good luck everyone!');
    await page.getByRole('dialog').getByRole('button', { name: 'Share tip' }).click();
    await expect(page.getByText('Tip shared').first()).toBeVisible();
    // Opening the story viewer shows the text.
    await page
      .getByRole('button', { name: /Your tip/ })
      .first()
      .click();
    await expect(page.getByText('Exam tomorrow, good luck everyone!').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('create a poll post and vote', async ({ page, browser }) => {
    const errors = trackErrors(page);
    await register(page, newUser('pollster'));
    await page.goto('/feed');
    const question = `Which topic next? ${uid()}`;
    await page.getByPlaceholder(/Share something/i).fill(question);
    await page.getByRole('button', { name: 'Poll', exact: true }).click();
    await page.getByPlaceholder('Option 1').fill('Algebra');
    await page.getByPlaceholder('Option 2').fill('Geometry');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const card = page.locator('article', { hasText: question }).first();
    await expect(card).toBeVisible();
    await card.getByRole('radio', { name: /Algebra/ }).check();
    await card.getByRole('button', { name: 'Vote' }).click();
    await expect(card.getByText('You voted')).toBeVisible();
    await expect(card.getByText(/^1 votes?/)).toBeVisible();
    expect(errors).toEqual([]);
    void browser;
  });

  test('create an event and RSVP from another account', async ({ browser }) => {
    const host = newUser('host');
    const guest = newUser('guest');
    const ctxH = await browser.newContext({ locale: 'en-US' });
    const ctxG = await browser.newContext({ locale: 'en-US' });
    const pageH = await ctxH.newPage();
    const pageG = await ctxG.newPage();
    const errors = [...trackErrors(pageH), ...trackErrors(pageG)];
    await register(pageH, host);
    await register(pageG, guest);

    const title = `Revision workshop ${uid()}`;
    await pageH.goto('/events');
    await pageH.getByRole('button', { name: 'Schedule a session' }).first().click();
    await pageH.getByRole('dialog').getByLabel('Session title').fill(title);
    await pageH.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(pageH.getByText(title).first()).toBeVisible();
    await pageH.getByText(title).first().click();
    await expect(pageH).toHaveURL(/\/events\//);
    const url = pageH.url();

    await pageG.goto(url);
    await expect(pageG.getByRole('heading', { name: title })).toBeVisible();
    await pageG
      .getByRole('button', { name: /^Attending/ })
      .first()
      .click();
    await pageH.reload();
    await expect(pageH.getByText('2 attending')).toBeVisible();
    expect(errors).toEqual([]);
    await ctxH.close();
    await ctxG.close();
  });
});
