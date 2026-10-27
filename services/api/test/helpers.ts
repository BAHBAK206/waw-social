import type { AiClient } from '../src/lib/ai';
import { createApp } from '../src/app';
import { createDeps } from '../src/deps';
import { loadEnv } from '../src/env';
import { MemoryKv } from '../src/lib/kv';
import type { Deps } from '../src/lib/context';
import type { AuthResult } from '@qubedu/shared';

export const fakeAi: AiClient = {
  async solve(input) {
    const m = input.question.match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/);
    if (m) return { answer: String(Number(m[1]) + Number(m[2])), steps: ['add'], confidence: 'high', kind: 'math', sources: [], choice: null, provider: 'fake' };
    const src = input.chunks[0];
    return {
      answer: src ? src.text.slice(0, 60) : 'unknown',
      steps: [],
      confidence: src ? 'medium' : 'uncertain',
      kind: src ? 'retrieval' : 'unknown',
      sources: src ? [{ title: src.title, heading: src.heading, page: src.page, snippet: src.text.slice(0, 40) }] : [],
      choice: null,
      provider: 'fake',
    };
  },
  async gradeEssay(input) {
    const coverage = input.keyPoints.map((p) => ({ point: p, matched: input.answer.includes(p), evidence: null }));
    return { score: Math.round((coverage.filter((x) => x.matched).length / Math.max(1, coverage.length)) * 100), coverage, feedback: 'ok' };
  },
  async extract(input) {
    const text = Buffer.from(input.data).toString('utf8');
    return { text, chunks: [{ heading: 'Section', page: 1, text }] };
  },
  async assistant(input) {
    const hit = input.knowledge[0];
    return { content: hit ? hit.answer : `echo: ${input.message}`, sources: [], actions: [], provider: 'fake' };
  },
  async health() {
    return true;
  },
};

let shared: { deps: Deps; app: ReturnType<typeof createApp> } | null = null;

export async function setupApp() {
  if (shared) return shared;
  const env = loadEnv(process.env);
  const deps = await createDeps(env, { kv: new MemoryKv(), ai: fakeAi });
  shared = { deps, app: createApp(deps) };
  return shared;
}

export interface Req {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  form?: FormData;
}

export async function call<T = unknown>(method: string, path: string, opts: Req = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const { app } = await setupApp();
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let reqBody: BodyInit | undefined;
  if (opts.form) reqBody = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    reqBody = JSON.stringify(opts.body);
  }
  const res = await app.request(path.startsWith('/api') || path.startsWith('/files') || path === '/health' ? path : `/api/v1${path}`, { method, headers, body: reqBody });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* raw body */
  }
  return { status: res.status, body: parsed as T, headers: res.headers };
}

let counter = 0;
export async function newUser(opts: { name?: string; accountType?: 'student' | 'teacher'; email?: string } = {}) {
  counter += 1;
  const email = opts.email ?? `user${Date.now()}${counter}@qubedu.test`;
  const res = await call<AuthResult>('POST', '/auth/register', {
    body: { email, password: 'Password#123', displayName: opts.name ?? `User ${counter}`, accountType: opts.accountType ?? 'student' },
    headers: { 'x-client': 'mobile' },
  });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken!, user: res.body.user, email };
}

export async function rootUser() {
  try {
    return await newUser({ email: 'root@qubedu.test', name: 'Root Admin' });
  } catch {
    const res = await call<AuthResult>('POST', '/auth/login', { body: { email: 'root@qubedu.test', password: 'Password#123' }, headers: { 'x-client': 'mobile' } });
    return { token: res.body.accessToken, refreshToken: res.body.refreshToken!, user: res.body.user, email: 'root@qubedu.test' };
  }
}
