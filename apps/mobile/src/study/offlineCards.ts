import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@qubedu/api-client';
import type { FlashcardDto } from '@qubedu/shared';
import { api } from '@/lib/api';
import { enqueue, useOutbox } from '@/lib/outbox';
import { useSession } from '@/lib/session';

type DueList = Awaited<ReturnType<typeof api.flashcards.list>>;
const key = (deck: string) => `qubedu.cards.${useSession.getState().me?.id ?? 'anon'}.${deck}`;

/** Due cards: from the server, or the last saved list (minus cards already reviewed offline) without a connection. */
export async function loadDueCards(deck?: string): Promise<DueList & { offline?: boolean }> {
  try {
    const res = await api.flashcards.list({ due: true, deck });
    void AsyncStorage.setItem(key(deck ?? ''), JSON.stringify(res)).catch(() => undefined);
    return res;
  } catch (e) {
    if (!(e instanceof ApiError && e.isNetwork)) throw e;
    const raw = await AsyncStorage.getItem(key(deck ?? '')).catch(() => null);
    if (!raw) throw e;
    const cached = JSON.parse(raw) as DueList;
    const done = new Set(useOutbox.getState().items.flatMap((i) => (i.kind === 'card-review' && i.rating !== 'again' ? [i.cardId] : [])));
    const items = cached.items.filter((c) => !done.has(c.id));
    return { ...cached, items, dueCount: items.length, offline: true };
  }
}

/** Reviews a card now, or saves the review to send when the connection returns. */
export async function reviewCard(card: FlashcardDto, rating: 'again' | 'unsure' | 'know' | 'easy'): Promise<{ card: FlashcardDto; queued: boolean }> {
  try {
    return { card: (await api.flashcards.review(card.id, rating)).card, queued: false };
  } catch (e) {
    if (!(e instanceof ApiError && e.isNetwork)) throw e;
    await enqueue({ kind: 'card-review', cardId: card.id, rating });
    return { card, queued: true };
  }
}
