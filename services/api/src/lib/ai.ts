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
  extract(input: {
    filename: string;
    mime: string;
    data: Uint8Array;
  }): Promise<{ chunks: { heading: string | null; page: number | null; text: string }[]; text: string }>;
  assistant(input: {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    knowledge: { question: string; answer: string; link: string | null }[];
    chunks: AiChunk[];
    language: string;
    userName: string;
  }): Promise<{ content: string; sources: AiSource[]; actions: { label: string; link: string }[]; provider: string }>;
  /** Teacher tools; `translate` needs Claude on the AI service (else rejected with ai_rejected / needs_ai). */
  teacher(input: {
    task: 'quiz' | 'summary' | 'chapters' | 'ideas' | 'translate';
    text?: string;
    cues?: { start: number; end: number; text: string }[];
    count?: number;
    types?: ('mc' | 'tf' | 'short')[];
    language: string;
    targetLanguage?: string;
  }): Promise<Record<string, unknown> & { provider: string }>;
  /** Speech → timed captions (16 kHz mono WAV). Throws AppError 501 transcription_unavailable when not installed. */
  transcribe(input: { audio: Uint8Array; language?: string }): Promise<{ cues: { start: number; end: number; text: string }[] }>;
  health(): Promise<boolean>;
}

export function createAiClient(baseUrl: string, internalToken: string, timeoutMs = 30_000): AiClient {
  async function call<T>(path: string, body: unknown, raw?: { data: Uint8Array; headers: Record<string, string> }, ms = timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: raw ? { 'x-internal-token': internalToken, ...raw.headers } : { 'content-type': 'application/json', 'x-internal-token': internalToken },
        body: raw ? Buffer.from(raw.data) : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 501) throw new AppError(501, 'transcription_unavailable');
        if (res.status === 422 && text.includes('needs_ai')) throw new AppError(422, 'needs_ai');
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
    // Claude may take a while on long lessons or full caption files.
    teacher: (input) => call('/v1/teacher', input, undefined, input.task === 'translate' ? 600_000 : 120_000),
    transcribe: (input) =>
      call(
        '/v1/transcribe',
        null,
        {
          data: input.audio,
          headers: { 'content-type': 'audio/wav', ...(input.language ? { 'x-language': input.language } : {}) },
        },
        30 * 60_000,
      ),
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
