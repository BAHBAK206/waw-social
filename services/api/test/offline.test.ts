import type { FlashcardDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser } from './helpers';

describe('offline flashcard reviews', () => {
  it('uses the time the review happened, and ignores the same review sent twice', async () => {
    const u = await newUser();
    const created = await call<{ items: FlashcardDto[] }>('POST', '/flashcards', { token: u.token, body: { cards: [{ front: 'H2O', back: 'Water' }] } });
    const card = created.body.items[0]!;
    const at = Date.now() - 2 * 86_400_000;
    const first = await call<{ card: FlashcardDto }>('POST', `/flashcards/${card.id}/review`, { token: u.token, body: { rating: 'know', reviewedAt: at } });
    expect(first.status).toBe(200);
    // Scheduled from two days ago, so it is due sooner than a review made now.
    const fresh = await call<{ items: FlashcardDto[] }>('POST', '/flashcards', { token: u.token, body: { cards: [{ front: 'NaCl', back: 'Salt' }] } });
    const now = await call<{ card: FlashcardDto }>('POST', `/flashcards/${fresh.body.items[0]!.id}/review`, { token: u.token, body: { rating: 'know' } });
    expect(first.body.card.dueAt).toBeLessThan(now.body.card.dueAt);

    // The app retries after a lost reply: nothing changes.
    const again = await call<{ card: FlashcardDto }>('POST', `/flashcards/${card.id}/review`, { token: u.token, body: { rating: 'know', reviewedAt: at } });
    expect(again.body.card.dueAt).toBe(first.body.card.dueAt);
    expect(again.body.card.level).toBe(first.body.card.level);

    // A time in the future is treated as now.
    const future = await call<{ card: FlashcardDto }>('POST', `/flashcards/${card.id}/review`, {
      token: u.token,
      body: { rating: 'easy', reviewedAt: Date.now() + 30 * 86_400_000 },
    });
    expect(future.body.card.dueAt).toBeGreaterThan(first.body.card.dueAt);
    expect(future.body.card.dueAt).toBeLessThan(Date.now() + 400 * 86_400_000);
  });
});
