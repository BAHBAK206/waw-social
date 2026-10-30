import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineQuizPackDto } from '@qubedu/shared';
import { normalizeSearch } from '@qubedu/shared';
import { create } from 'zustand';
import { api } from './api';
import { enqueue, flushOutbox } from './outbox';
import { useSession } from './session';

const key = (userId: string) => `qubedu.offline.quizzes.${userId}`;

interface State {
  loaded: boolean;
  userId: string | null;
  packs: Record<string, OfflineQuizPackDto & { savedAt: number }>;
}

export const useOfflineQuizzes = create<State>(() => ({ loaded: false, userId: null, packs: {} }));

/** Quizzes saved on this phone (kept per account). */
export async function loadOfflineQuizzes() {
  const userId = useSession.getState().me?.id ?? null;
  if (!userId) return;
  const s = useOfflineQuizzes.getState();
  if (s.loaded && s.userId === userId) return;
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    useOfflineQuizzes.setState({ loaded: true, userId, packs: raw ? (JSON.parse(raw) as State['packs']) : {} });
  } catch {
    useOfflineQuizzes.setState({ loaded: true, userId, packs: {} });
  }
}

async function persist(packs: State['packs']) {
  const userId = useOfflineQuizzes.getState().userId;
  useOfflineQuizzes.setState({ packs });
  if (userId) await AsyncStorage.setItem(key(userId), JSON.stringify(packs)).catch(() => undefined);
}

export async function downloadQuiz(id: string) {
  await loadOfflineQuizzes();
  const pack = await api.offline.pack(id);
  await persist({ ...useOfflineQuizzes.getState().packs, [id]: { ...pack, savedAt: Date.now() } });
}

export async function removeQuiz(id: string) {
  const { [id]: _gone, ...rest } = useOfflineQuizzes.getState().packs;
  await persist(rest);
}

export const packSize = (p: OfflineQuizPackDto) => JSON.stringify(p).length;

type Given = number | number[] | string | null;

const clean = (s: string) => normalizeSearch(s).replace(/[.,!?؟،]/g, '');

/** Same marking rules as the server (the server marks again when the result is sent). */
export function isCorrect(q: OfflineQuizPackDto['questions'][number], given: Given): boolean {
  if (given === null || given === undefined) return false;
  switch (q.type) {
    case 'mc':
    case 'tf':
      return typeof given === 'number' && given === q.answer;
    case 'multi': {
      if (!Array.isArray(given) || !Array.isArray(q.answer)) return false;
      const a = [...new Set(given)].sort((x, y) => x - y);
      const b = [...new Set(q.answer as number[])].sort((x, y) => x - y);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    case 'short':
      return typeof given === 'string' && Array.isArray(q.answer) && (q.answer as string[]).some((acc) => clean(String(acc)) === clean(given));
    default:
      return false;
  }
}

export function markOffline(pack: OfflineQuizPackDto, answers: Given[]) {
  let earned = 0;
  let possible = 0;
  const marks = pack.questions.map((q, i) => {
    const ok = isCorrect(q, answers[i] ?? null);
    possible += q.points;
    if (ok) earned += q.points;
    return ok;
  });
  return { marks, correct: marks.filter(Boolean).length, total: marks.length, pct: possible ? Math.round((earned / possible) * 100) : 0 };
}

function uuid(): string {
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Keeps a finished offline attempt and sends it as soon as there is a connection. */
export async function finishOffline(quizId: string, answers: Given[], startedAt: number) {
  await enqueue({ kind: 'quiz-result', clientId: uuid(), quizId, answers, startedAt, finishedAt: Date.now() });
  void flushOutbox();
}
