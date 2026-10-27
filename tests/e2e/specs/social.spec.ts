import { expect, test } from '@playwright/test';
import { adminToken, loginAsAdmin, newUser, register, trackErrors, uid } from './helpers';

test.describe('people, notifications and discovery', () => {
  test('follow someone: they get a realtime notification and the profile updates', async ({ browser }) => {
    const alice = newUser('alice');
    const bob = newUser('bob');
    const ctxA = await browser.newContext({ locale: 'en-US' });
    const ctxB = await browser.newContext({ locale: 'en-US' });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const errors = [...trackErrors(pageA), ...trackErrors(pageB)];
    await register(pageA, alice);
    await register(pageB, bob);

    await pageA.goto('/people');
    await pageA.getByPlaceholder(/Search by name/i).fill(bob.name);
    await pageA
      .getByRole('link', { name: new RegExp(bob.name) })
      .first()
      .click();
    await pageA.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(pageA.getByRole('button', { name: 'Following', exact: true })).toBeVisible();

    // Bob sees the bell badge without reloading, and the notification text.
    await pageB.getByRole('button', { name: 'Notifications' }).click();
    await expect(pageB.getByText(`${alice.name} started following you`)).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });

  test('command palette finds pages and people', async ({ page }) => {
    const me = newUser('searcher');
    await register(page, me);
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: /Type a command/i }).fill('flash');
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  });

  test('profile edits are saved and visible on the public profile', async ({ page }) => {
    const errors = trackErrors(page);
    const me = newUser('editor');
    await register(page, me);
    await page.goto('/settings');
    const bio = `Maths lover ${uid()}`;
    await page.getByLabel('Bio').fill(bio);
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByText('Settings saved')).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByText(bio)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('study tutor degrades gracefully when the AI service is unavailable', async ({ page }) => {
    await register(page, newUser('asker'));
    await page.goto('/ai');
    await page.getByRole('textbox', { name: 'Your question' }).fill('Solve 2x + 3 = 7');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    // Either the solver answers (AI service running) or a clear, translated error appears — never a crash.
    await expect(page.getByText(/x\s*=\s*2|unavailable|try again|temporarily/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);
  });
});

test.describe('library moderation', () => {
  test('an uploaded resource waits for approval, then appears for everyone', async ({ browser, request }) => {
    await adminToken(request);
    const teacher = newUser('libteacher');
    const ctxT = await browser.newContext({ locale: 'en-US' });
    const ctxA = await browser.newContext({ locale: 'en-US' });
    const ctxS = await browser.newContext({ locale: 'en-US' });
    const pageT = await ctxT.newPage();
    const pageA = await ctxA.newPage();
    const pageS = await ctxS.newPage();
    const errors = [...trackErrors(pageT), ...trackErrors(pageA), ...trackErrors(pageS)];
    await register(pageT, teacher); // students' uploads wait for approval (teachers' are published immediately)
    await loginAsAdmin(pageA);
    await register(pageS, newUser('libstudent'));

    const title = `Past paper ${uid()}`;
    await pageT.goto('/library');
    await pageT.getByRole('button', { name: 'Add resource' }).click();
    await pageT.getByRole('dialog').getByLabel('Title').fill(title);
    const [chooser] = await Promise.all([
      pageT.waitForEvent('filechooser'),
      pageT
        .getByRole('dialog')
        .getByRole('button', { name: /Choose|Upload|file/i })
        .first()
        .click(),
    ]);
    await chooser.setFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') });
    await pageT
      .getByRole('dialog')
      .getByRole('button', { name: /^(Save|Publish|Add|Submit)/ })
      .last()
      .click();
    await expect(pageT.getByText(/review|submitted/i).first()).toBeVisible();

    // Students do not see it yet.
    await pageS.goto('/library');
    await expect(pageS.getByText(title)).toHaveCount(0);

    // The administrator approves it from the moderation tab.
    await pageA.goto('/admin?tab=library');
    await pageA.getByRole('listitem').or(pageA.locator('div.card')).filter({ hasText: title }).getByRole('button', { name: 'Approve' }).click();
    await pageS.goto('/library');
    await expect(pageS.getByText(title)).toBeVisible();
    expect(errors).toEqual([]);
    await ctxT.close();
    await ctxA.close();
    await ctxS.close();
  });
});
