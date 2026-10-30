import { expect, test } from '@playwright/test';
import { apiRegister, login, dismissOnboarding, newUser, register, trackErrors, uid } from './helpers';

test.describe('study tools', () => {
  test('workspace: write a document and a spreadsheet; both persist across reloads', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, newUser('writer'));
    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\//);
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    const text = `Photosynthesis notes ${uid()}`;
    await page.keyboard.type(text);
    // Reload straight away: edits still pending are flushed with keepalive when the page hides.
    await page.reload();
    await expect(page.locator('.ProseMirror').first()).toContainText(text);

    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Spreadsheet', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\//);
    // Type values and a formula into the grid.
    const grid = page.getByRole('grid');
    const cell = (row: number) => grid.getByRole('row').nth(row).getByRole('gridcell').first();
    for (const [row, value] of [
      [1, '40'],
      [2, '2'],
      [3, '=A1+A2'],
    ] as const) {
      await cell(row).click();
      await page.getByRole('textbox', { name: `A${row}`, exact: true }).fill(value);
      await page.keyboard.press('Enter');
    }
    await expect(cell(3)).toHaveText('42');
    expect(errors).toEqual([]);
  });

  test('planner: add a task, complete it and keep a note', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, newUser('planner'));
    await page.goto('/organizer');
    await page.getByRole('button', { name: 'Add task' }).click();
    const title = `Finish chapter 4 ${uid()}`;
    await page.getByRole('dialog').getByLabel('What do you need to do?').fill(title);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(title)).toBeVisible();
    // The status button cycles To do → In progress → Done; finished tasks hide unless "Show completed" is on.
    const status = page.getByRole('listitem').filter({ hasText: title }).getByRole('button').first();
    await status.click();
    await status.click();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Show completed' }).check();
    await expect(page.getByText(title)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('forms: a teacher publishes a graded form and a guest submits it', async ({ browser, request }) => {
    const teacher = newUser('formteacher');
    const token = await apiRegister(request, teacher, 'teacher');
    const title = `Unit test ${uid()}`;
    const created = await request.post('/api/v1/forms', {
      headers: { authorization: `Bearer ${token}` },
      data: {
        title,
        description: 'Quick check',
        published: true,
        settings: { quizMode: true, showResults: true, confirmationMessage: 'Thanks for answering!' },
        questions: [{ id: 'q1', type: 'single', title: 'Capital of France?', required: true, options: ['Paris', 'Rome'], correct: ['Paris'], points: 1 }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const form = (await created.json()) as { slug: string };

    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await page.goto(`/f/${form.slug}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.getByText('Paris', { exact: true }).click();
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText('Thanks for answering!')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('classroom: teacher creates a course, student joins by code, and submits work', async ({ browser, request }) => {
    const teacher = newUser('prof');
    const student = newUser('pupil');
    const token = await apiRegister(request, teacher, 'teacher');
    const auth = { authorization: `Bearer ${token}` };
    const course = await request.post('/api/v1/school/courses', {
      headers: auth,
      data: { title: `Biology ${uid()}`, subject: 'Science', description: 'Cells and genes' },
    });
    expect(course.ok(), await course.text()).toBeTruthy();
    const c = (await course.json()) as { id: string; joinCode: string };
    const assignment = await request.post(`/api/v1/school/courses/${c.id}/assignments`, {
      headers: auth,
      data: { title: 'Cell diagram', description: 'Draw and label', points: 10, state: 'published' },
    });
    expect(assignment.ok(), await assignment.text()).toBeTruthy();

    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await register(page, student);
    await page.goto('/school');
    await page.getByRole('button', { name: 'Join course' }).first().click();
    await page.getByRole('dialog').getByRole('textbox').fill(c.joinCode);
    await page.getByRole('dialog').getByRole('button', { name: 'Join course' }).click();
    await expect(page.getByText('Biology').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Biology/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Classwork' }).click();
    await page.getByText('Cell diagram').first().click();
    await page.getByRole('textbox').first().fill('Nucleus, membrane, mitochondria');
    await page
      .getByRole('button', { name: /Turn in|Submit/i })
      .first()
      .click();
    await expect(page.getByText(/Turned in|Submitted/i).first()).toBeVisible();

    // The teacher grades and returns the work; the student sees the grade and feedback.
    const a = (await assignment.json()) as { id: string };
    const ctxT = await browser.newContext({ locale: 'en-US' });
    const pageT = await ctxT.newPage();
    errors.push(...trackErrors(pageT));
    await login(pageT, teacher);
    await pageT.goto(`/school/assignments/${a.id}`);
    await expect(pageT.getByText('Nucleus, membrane, mitochondria')).toBeVisible();
    await pageT.getByRole('button', { name: 'Grade', exact: true }).click();
    await pageT.getByLabel('Grade (/10)').fill('9');
    await pageT.getByLabel('Feedback').fill('Great labels — add the cell wall next time.');
    await pageT.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(pageT.getByText('9/10').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText('Great labels — add the cell wall next time.')).toBeVisible();
    await expect(page.getByText(/^Graded|Returned$/).first()).toBeVisible();
    expect(errors).toEqual([]);
    await dismissOnboarding(page);
    await ctxT.close();
    await ctx.close();
  });

  test('flashcards: add a card, review it and see the session summary', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, newUser('carder'));
    await page.goto('/academic?tab=cards');
    await page.getByRole('button', { name: 'Add card' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Deck').fill('Chemistry');
    await dialog.getByLabel('Front (question)').fill('Symbol of sodium?');
    await dialog.getByLabel('Back (answer)').fill('Na');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Symbol of sodium?')).toBeVisible();
    await page.getByRole('button', { name: /Review now \(1 due\)/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Show answer', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Na', { exact: true }).first()).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Good', exact: true }).click();
    await expect(page.getByText('Review complete! 1 card reviewed.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
