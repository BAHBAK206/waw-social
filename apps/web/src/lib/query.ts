import { ApiError } from '@qubedu/api-client';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Shared query keys so realtime events can invalidate the right caches. */
export const qk = {
  config: ['config'] as const,
  notifications: ['notifications'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  feed: (scope: string) => ['feed', scope] as const,
  post: (id: string) => ['post', id] as const,
  comments: (id: string) => ['comments', id] as const,
  user: (id: string) => ['user', id] as const,
  taxonomy: ['taxonomy'] as const,
  quizzes: (filters: object) => ['quizzes', filters] as const,
  quiz: (id: string) => ['quiz', id] as const,
  daily: ['daily'] as const,
  dashboard: ['academic', 'dashboard'] as const,
  flashcards: ['flashcards'] as const,
  tasks: ['tasks'] as const,
  notes: ['notes'] as const,
  exams: ['exams'] as const,
  sessions: ['study-sessions'] as const,
  mastery: ['mastery'] as const,
  groups: (filters: object) => ['groups', filters] as const,
  group: (id: string) => ['group', id] as const,
  courses: ['courses'] as const,
  course: (id: string) => ['course', id] as const,
  live: ['live'] as const,
  liveRoom: (id: string) => ['live', id] as const,
  forms: ['forms'] as const,
  library: (filters: object) => ['library', filters] as const,
  workspace: ['workspace'] as const,
  saved: ['saved'] as const,
  assistantThreads: ['assistant', 'threads'] as const,
};
