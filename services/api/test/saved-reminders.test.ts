import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { NotificationDto, Page, SavedItemDto } from '@qubedu/shared';
import { savedItems } from '../src/db/schema';
import { sendDueSavedReminders } from '../src/lib/savedReminders';
import { call, newUser, setupApp } from './helpers';

describe('reminders for saved items', () => {
  it('sets a reminder, rejects bad times, sends it once at the due time, and can be set again or cleared', async () => {
    const { deps } = await setupApp();
    const u = await newUser();
    const other = await newUser();
    const quiz = '11111111-1111-4111-8111-111111111111';
    const added = await call<SavedItemDto>('POST', '/saved', { token: u.token, body: { itemType: 'quiz', refId: quiz, title: 'Fractions quiz' } });
    expect(added.body).toMatchObject({ remindAt: null, reminded: false });
    const id = added.body.id;

    // Too soon, in the past and too far are refused; someone else's item can't be touched.
    for (const remindAt of [Date.now() - 1000, Date.now() + 5000, Date.now() + 400 * 86_400_000])
      expect((await call('PATCH', `/saved/${id}`, { token: u.token, body: { remindAt } })).status).toBe(400);
    expect((await call('PATCH', `/saved/${id}`, { token: other.token, body: { remindAt: Date.now() + 3_600_000 } })).status).toBe(404);

    const when = Date.now() + 3_600_000;
    const set = await call<SavedItemDto>('PATCH', `/saved/${id}`, { token: u.token, body: { remindAt: when } });
    expect(set.body).toMatchObject({ remindAt: expect.any(Number), reminded: false });
    // Not due yet: nothing is sent.
    expect(await sendDueSavedReminders(deps)).toBe(0);

    // Due: one notification that opens the item, and never again.
    await deps.db
      .update(savedItems)
      .set({ remindAt: new Date(Date.now() - 1000) })
      .where(eq(savedItems.id, id));
    expect(await sendDueSavedReminders(deps)).toBe(1);
    expect(await sendDueSavedReminders(deps)).toBe(0);
    const notes = await call<Page<NotificationDto>>('GET', '/notifications', { token: u.token });
    const n = notes.body.items.find((x) => x.type === 'saved_reminder')!;
    expect(n).toMatchObject({ link: `/quiz/${quiz}`, data: { title: 'Fractions quiz' } });
    expect((await call<{ items: SavedItemDto[] }>('GET', '/saved', { token: u.token })).body.items[0]).toMatchObject({ reminded: true });
    expect((await call<Page<NotificationDto>>('GET', '/notifications', { token: other.token })).body.items.some((x) => x.type === 'saved_reminder')).toBe(
      false,
    );

    // Setting a new time re-arms it; clearing removes it.
    const again = await call<SavedItemDto>('PATCH', `/saved/${id}`, { token: u.token, body: { remindAt: Date.now() + 86_400_000 } });
    expect(again.body.reminded).toBe(false);
    const cleared = await call<SavedItemDto>('PATCH', `/saved/${id}`, { token: u.token, body: { remindAt: null } });
    expect(cleared.body).toMatchObject({ remindAt: null, reminded: false });
  });
});
