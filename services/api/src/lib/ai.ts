import type { AiAnswerDto, AiSource, EssayGradeDto } from '@qubedu/shared';
import { AppError } from './errors';

export interface AiChunk {
  id: string;
  title: string;
  heading: string | null;
  page: number | null;
  text: string;
  materialId?: string | null;
}

export interface AiClient {
  solve(input: {
    question: string;
    material?: string;
    options?: string[];
    chunks: AiChunk[];
    synonyms: Record<string, string[]>;
    mode: string;
    language: string;
  }): Promise<Omit<AiAnswerDto, 'remainingQuota'>>;
  gradeEssay(input: { answer: string; modelAnswer: string; keyPoints: string[]; synonyms: Record<string, string[]>; language: string }): Promise<EssayGradeDto>;
  extract(input: { filename: string; mime: string; data: Uint8Array }): Promise<{ chunks: { heading: string | null; page: number | null; text: string }[]; text: string }>;
  assistant(input: {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    knowledge: { question: string; answer: string; link: string | null }[];
    chunks: AiChunk[];
    language: string;
    userName: string;
  }): Promise<{ content: string; sources: AiSource[]; actions: { label: string; link: string }[]; provider: string }>;
  health(): Promise<boolean>;
}

export function createAiClient(baseUrl: string, internalToken: string, timeoutMs = 30_000): AiClient {
  async function call<T>(path: string, body: unknown, raw?: { data: Uint8Array; headers: Record<string, string> }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: raw ? { 'x-internal-token': internalToken, ...raw.headers } : { 'content-type': 'application/json', 'x-internal-token': internalToken },
        body: raw ? Buffer.from(raw.data) : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 422 || res.status === 400) throw new AppError(400, 'ai_rejected', text.slice(0, 300));
        throw new AppError(503, 'ai_unavailable', `AI service responded ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'ai_unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    solve: (input) => call('/v1/solve', input),
    gradeEssay: (input) => call('/v1/grade-essay', input),
    extract: (input) =>
      call('/v1/extract', null, {
        data: input.data,
        headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(input.filename), 'x-mime': input.mime },
      }),
    assistant: (input) => call('/v1/assistant', input),
    async health() {
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
