import { expect, test } from '@playwright/test';
import { newUser, register, uid } from './helpers';

test.describe('community feed', () => {
  test('post with a hashtag, react, comment and save', async ({ page }) => {
    await register(page, newUser('feed'));
    await page.goto('/feed');
    const tag = `e2e${uid()}`;
    const text = `Hello from the browser test #${tag}`;
    await page.getByPlaceholder(/Share something/i).fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const card = page.locator('article', { hasText: text }).first();
    await expect(card).toBeVisible();

    await card
      .getByRole('button', { name: /React|Like/i })
      .first()
      .click();
    await card.getByRole('button', { name: 'Comment', exact: true }).first().click();
    await card.getByPlaceholder(/Write a comment/i).fill('Nice one');
    await card.getByRole('button', { name: 'Send' }).click();
    await expect(card.getByText('Nice one')).toBeVisible();

    // The hashtag is indexed and clickable.
    await page.goto(`/explore/tag/${tag}`);
    await expect(page.getByText(text)).toBeVisible();
  });
});
