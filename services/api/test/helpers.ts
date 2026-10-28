import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema';
import type { AiClient } from '../src/lib/ai';
import { createApp } from '../src/app';
import { createDeps } from '../src/deps';
import { loadEnv } from '../src/env';
import { MemoryKv } from '../src/lib/kv';
import type { Deps } from '../src/lib/context';
import type { AuthResult } from '@qubedu/shared';
import type { PushMessage, PushSender, PushTarget } from '../src/lib/push';

/** Records pushes instead of calling Expo / browser push services. Tokens containing "gone" report as uninstalled. */
export const sentPushes: { targets: PushTarget[]; msg: PushMessage }[] = [];
export const fakePush: PushSender = {
  async send(targets, msg) {
    sentPushes.push({ targets, msg });
    return { invalid: targets.filter((t) => t.token.includes('gone')).map((t) => t.token) };
  },
};

/** The last payload the fake assistant received (tests check what the API feeds the AI). */
export let lastAssistantInput: Parameters<AiClient['assistant']>[0] | null = null;

export const fakeAi: AiClient = {
  async solve(input) {
    const m = input.question.match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/);
    if (m)
      return { answer: String(Number(m[1]) + Number(m[2])), steps: ['add'], confidence: 'high', kind: 'math', sources: [], choice: null, provider: 'fake' };
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
    lastAssistantInput = input;
    const hit = input.knowledge[0];
    if (hit) return { content: hit.answer, sources: [], actions: [], provider: 'qubedu:kb' };
    if (input.message.startsWith('??')) return { content: 'not sure', sources: [], actions: [], provider: 'qubedu:none' };
    return { content: `echo: ${input.message}`, sources: [], actions: [], provider: 'fake' };
  },
  async teacher(input) {
    if (input.task === 'translate') return { provider: 'fake', cues: (input.cues ?? []).map((c) => ({ ...c, text: `[${input.targetLanguage}] ${c.text}` })) };
    if (input.task === 'quiz')
      return {
        provider: 'fake',
        questions: [
          { type: 'mc', prompt: 'Plants make _____ from light.', options: ['glucose', 'salt', 'iron', 'oil'], answer: 0, explanation: 'From the lesson.' },
          { type: 'tf', prompt: 'Oxygen is released.', options: ['true', 'false'], answer: 0, explanation: null },
          { type: 'short', prompt: 'The green pigment is _____.', options: [], answer: ['chlorophyll'], explanation: null },
        ].slice(0, input.count ?? 3),
      };
    if (input.task === 'summary') return { provider: 'fake', summary: [String(input.text).slice(0, 40)], keyPoints: ['photosynthesis'] };
    if (input.task === 'chapters')
      return { provider: 'fake', chapters: (input.cues ?? []).slice(0, 2).map((c, i) => ({ at: i ? Math.floor(c.start) : 0, title: c.text })) };
    return { provider: 'fake', ideas: ['Explain it in your own words.'] };
  },
  async transcribe() {
    return {
      cues: [
        { start: 0, end: 2, text: 'Hello class' },
        { start: 2, end: 4, text: 'Today: light' },
      ],
    };
  },
  async health() {
    return true;
  },
};

let shared: { deps: Deps; app: ReturnType<typeof createApp> } | null = null;

export async function setupApp() {
  if (shared) return shared;
  const env = loadEnv(process.env);
  const deps = await createDeps(env, { kv: new MemoryKv(), ai: fakeAi, push: fakePush });
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
  let reqBody: FormData | string | undefined;
  if (opts.form) reqBody = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    reqBody = JSON.stringify(opts.body);
  }
  const res = await app.request(
    path.startsWith('/api') || path.startsWith('/files') || path.startsWith('/internal') || path === '/health' ? path : `/api/v1${path}`,
    { method, headers, body: reqBody },
  );
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
/** Teachers are verified by default (most tests need full teacher powers); pass `verified: false` to test the unverified path. */
export async function newUser(opts: { name?: string; accountType?: 'student' | 'teacher' | 'parent'; email?: string; verified?: boolean } = {}) {
  counter += 1;
  const email = opts.email ?? `user${Date.now()}${counter}@qubedu.test`;
  const res = await call<AuthResult>('POST', '/auth/register', {
    body: { email, password: 'Password#123', displayName: opts.name ?? `User ${counter}`, accountType: opts.accountType ?? 'student' },
    headers: { 'x-client': 'mobile' },
  });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  if (opts.accountType === 'teacher' && opts.verified !== false) {
    const { deps } = await setupApp();
    await deps.db.update(users).set({ teacherVerifiedAt: new Date() }).where(eq(users.id, res.body.user.id));
  }
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken!, user: res.body.user, email };
}

export async function rootUser() {
  try {
    return await newUser({ email: 'root@qubedu.test', name: 'Root Admin' });
  } catch {
    const res = await call<AuthResult>('POST', '/auth/login', {
      body: { email: 'root@qubedu.test', password: 'Password#123' },
      headers: { 'x-client': 'mobile' },
    });
    return { token: res.body.accessToken, refreshToken: res.body.refreshToken!, user: res.body.user, email: 'root@qubedu.test' };
  }
}
