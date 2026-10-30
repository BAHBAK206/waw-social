import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@qubedu/api-client';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { api } from './api';
import { useSession } from './session';

/** Things done without a connection, sent in order once it returns. */
export type OutboxItem =
  | { kind: 'card-review'; cardId: string; rating: 'again' | 'unsure' | 'know' | 'easy'; at: number; userId: string }
  | { kind: 'video-progress'; videoId: string; sec: number; completed: boolean; at: number; userId: string }
  | {
      kind: 'quiz-result';
      clientId: string;
      quizId: string;
      answers: (number | number[] | string | null)[];
      startedAt: number;
      finishedAt: number;
      at: number;
      userId: string;
    };

type Draft<T> = T extends unknown ? Omit<T, 'userId' | 'at'> & { at?: number } : never;
type NewItem = Draft<OutboxItem>;

const KEY = 'qubedu.outbox';
const MAX = 2000;

export const useOutbox = create<{ items: OutboxItem[]; loaded: boolean }>(() => ({ items: [], loaded: false }));

async function load() {
  if (useOutbox.getState().loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    useOutbox.setState({ items: raw ? (JSON.parse(raw) as OutboxItem[]) : [], loaded: true });
  } catch {
    useOutbox.setState({ loaded: true });
  }
}

async function save(items: OutboxItem[]) {
  useOutbox.setState({ items });
  await AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => undefined);
}

export async function enqueue(item: NewItem) {
  const userId = useSession.getState().me?.id;
  if (!userId) return;
  await load();
  const full = { ...item, at: item.at ?? Date.now(), userId } as OutboxItem;
  let items = useOutbox.getState().items;
  // Only the latest position of a lesson matters.
  if (full.kind === 'video-progress') {
    const prev = items.find((i) => i.kind === 'video-progress' && i.videoId === full.videoId) as Extract<OutboxItem, { kind: 'video-progress' }> | undefined;
    if (prev?.completed) full.completed = true;
    items = items.filter((i) => !(i.kind === 'video-progress' && i.videoId === full.videoId));
  }
  await save([...items, full].slice(-MAX));
}

let flushing: Promise<void> | null = null;

/** Sends what is waiting. Stops at the first network failure; drops items the server refuses (deleted card, etc.). */
export function flushOutbox(): Promise<void> {
  if (!flushing)
    flushing = (async () => {
      await load();
      const me = useSession.getState().me?.id;
      if (!me || !api.http.token) return;
      let items = useOutbox.getState().items.filter((i) => i.userId === me);
      while (items.length) {
        const it = items[0]!;
        try {
          if (it.kind === 'card-review') await api.flashcards.review(it.cardId, it.rating, it.at);
          else if (it.kind === 'quiz-result')
            await api.offline.results([{ clientId: it.clientId, quizId: it.quizId, answers: it.answers, startedAt: it.startedAt, finishedAt: it.finishedAt }]);
          else await api.videos.progress(it.videoId, it.sec, it.completed);
        } catch (e) {
          if (e instanceof ApiError && (e.isNetwork || e.status === 429 || e.status >= 500)) break;
        }
        items = items.slice(1);
        await save(items);
      }
      if (!items.length) await save([]);
    })().finally(() => (flushing = null));
  return flushing;
}

export function startOutbox() {
  void load().then(() => flushOutbox());
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && useOutbox.getState().items.length) void flushOutbox();
  });
}
