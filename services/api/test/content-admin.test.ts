import { describe, expect, it } from 'vitest';
import type {
  AdminOverviewDto,
  AssistantMessageDto,
  FormAnalyticsDto,
  FormDto,
  LibraryItemDto,
  Page,
  PublicConfigDto,
  SavedItemDto,
  SearchResultsDto,
  WorkspaceFileDto,
} from '@qubedu/shared';
import { call, newUser, rootUser } from './helpers';

describe('forms', () => {
  it('builder, public fill with validation, one response per user, analytics, CSV', async () => {
    const owner = await newUser();
    const resp = await newUser();
    const form = await call<FormDto>('POST', '/forms', {
      token: owner.token,
      body: {
        title: 'Event registration',
        published: true,
        settings: { oneResponsePerUser: true, quizMode: true },
        questions: [
          { id: 'name', type: 'short', title: 'Name', required: true },
          { id: 'track', type: 'single', title: 'Track', options: ['AI', 'Web'], required: true, correct: ['AI'], points: 2 },
          { id: 'rate', type: 'scale', title: 'Rate', min: 1, max: 5 },
        ],
      },
    });
    expect(form.status).toBe(201);
    const pub = await call<FormDto>('GET', `/forms/public/${form.body.slug}`, { token: resp.token });
    expect(pub.body.questions[1]!.correct).toBeUndefined();
    const bad = await call<{ error: { code: string; details: { id: string; code: string }[] } }>('POST', `/forms/public/${form.body.slug}/responses`, {
      token: resp.token,
      body: { answers: { track: 'Mobile', rate: 9 } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.code).sort()).toEqual(['invalid_option', 'out_of_range', 'required']);
    const ok = await call<{ score: number }>('POST', `/forms/public/${form.body.slug}/responses`, {
      token: resp.token,
      body: { answers: { name: '=cmd()', track: 'AI', rate: 4 } },
    });
    expect(ok.status).toBe(201);
    expect(ok.body.score).toBe(2);
    expect((await call('POST', `/forms/public/${form.body.slug}/responses`, { token: resp.token, body: { answers: { name: 'x', track: 'AI' } } })).status).toBe(
      409,
    );
    expect((await call('POST', `/forms/public/${form.body.slug}/responses`, { body: { answers: { name: 'x', track: 'AI' } } })).status).toBe(401);
    const an = await call<FormAnalyticsDto>('GET', `/forms/${form.body.id}/analytics`, { token: owner.token });
    expect(an.body.questions.find((q) => q.id === 'track')!.counts).toEqual({ AI: 1 });
    const csv = await call<string>('GET', `/forms/${form.body.id}/export.csv`, { token: owner.token });
    expect(String(csv.body)).toContain("'=cmd()");
    expect((await call('GET', `/forms/${form.body.id}`, { token: resp.token })).status).toBe(404);
  });
});

describe('library, workspace, saved, search', () => {
  it('library approval flow and downloads', async () => {
    const student = await newUser();
    const root = await rootUser();
    const item = await call<{ id: string; approved: boolean }>('POST', '/library', {
      token: student.token,
      body: { title: 'Chemistry summary', category: 'summary', fileUrl: '/files/public/2026/01/x.pdf', mime: 'application/pdf', size: 10 },
    });
    expect(item.body.approved).toBe(false);
    const pub = await call<Page<LibraryItemDto>>('GET', '/library?q=chemistry');
    expect(pub.body.items.some((i) => i.id === item.body.id)).toBe(false);
    const pending = await call<Page<LibraryItemDto>>('GET', '/library?pending=true', { token: root.token });
    expect(pending.body.items.some((i) => i.id === item.body.id)).toBe(true);
    await call('POST', `/library/${item.body.id}/approve`, { token: root.token });
    const after = await call<Page<LibraryItemDto>>('GET', '/library?q=chemistry');
    expect(after.body.items.some((i) => i.id === item.body.id)).toBe(true);
    expect((await call('POST', `/library/${item.body.id}/download`)).status).toBe(200);
  });

  it('workspace optimistic concurrency', async () => {
    const u = await newUser();
    const f = await call<WorkspaceFileDto>('POST', '/workspace/files', {
      token: u.token,
      body: { title: 'Notes', kind: 'doc', content: { html: '<p>a</p>' } },
    });
    const v1 = await call<WorkspaceFileDto>('PATCH', `/workspace/files/${f.body.id}`, { token: u.token, body: { version: 1, content: { html: '<p>b</p>' } } });
    expect(v1.body.version).toBe(2);
    const stale = await call<{ error: { code: string; details: WorkspaceFileDto } }>('PATCH', `/workspace/files/${f.body.id}`, {
      token: u.token,
      body: { version: 1, content: { html: '<p>c</p>' } },
    });
    expect(stale.status).toBe(409);
    expect((stale.body.error.details.content as { html: string }).html).toBe('<p>b</p>');
    const other = await newUser();
    expect((await call('GET', `/workspace/files/${f.body.id}`, { token: other.token })).status).toBe(404);
  });

  it('saved collections share publicly; search finds people and posts', async () => {
    const u = await newUser({ name: 'Zeinab Searchable' });
    const col = await call<{ id: string; shareSlug: string }>('POST', '/saved/collections', {
      token: u.token,
      body: { name: 'Physics links', isPublic: true },
    });
    const s = await call<SavedItemDto>('POST', '/saved', {
      token: u.token,
      body: { itemType: 'link', title: 'Khan', url: 'https://khanacademy.org', collectionId: col.body.id },
    });
    expect(s.status).toBe(201);
    const pub = await call<{ items: SavedItemDto[] }>('GET', `/saved/public/${col.body.shareSlug}`);
    expect(pub.body.items).toHaveLength(1);
    await call('POST', '/posts', { token: u.token, body: { text: 'unique-term-photosynthesis rocks' } });
    const res = await call<SearchResultsDto>('GET', '/search?q=Zeinab', { token: u.token });
    expect(res.body.users.some((x) => x.id === u.user.id)).toBe(true);
    const res2 = await call<SearchResultsDto>('GET', '/search?q=photosynthesis', { token: u.token });
    expect(res2.body.posts.length).toBeGreaterThan(0);
  });
});

describe('assistant & admin', () => {
  it('assistant uses the admin knowledge base and stores threads', async () => {
    const root = await rootUser();
    expect(
      (
        await call('POST', '/admin/assistant-knowledge', {
          token: root.token,
          body: { question: 'How do I reset my password?', answer: 'Open settings → security → reset.', tags: ['password'] },
        })
      ).status,
    ).toBe(201);
    const u = await newUser();
    const r = await call<{ threadId: string; message: AssistantMessageDto }>('POST', '/assistant/messages', {
      token: u.token,
      body: { text: 'how to reset password' },
    });
    expect(r.status).toBe(201);
    expect(r.body.message.content).toContain('reset');
    const fb = await call('POST', '/assistant/feedback', { token: u.token, body: { messageId: r.body.message.id, rating: 'up' } });
    expect(fb.status).toBe(200);
    const thread = await call<{ messages: AssistantMessageDto[] }>('GET', `/assistant/threads/${r.body.threadId}`, { token: u.token });
    expect(thread.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('root controls features, maintenance and AI quota; admins cannot', async () => {
    const root = await rootUser();
    const u = await newUser();
    expect((await call('GET', '/admin/overview', { token: u.token })).status).toBe(403);
    const ov = await call<AdminOverviewDto>('GET', '/admin/overview', { token: root.token });
    expect(ov.body.users.total).toBeGreaterThan(1);

    await call('PUT', `/admin/users/${u.user.id}/role`, { token: root.token, body: { role: 'admin' } });
    const relog = await call<{ accessToken: string }>('POST', '/auth/login', { body: { email: u.email, password: 'Password#123' } });
    expect((await call('PUT', '/admin/features', { token: relog.body.accessToken, body: { chat: { mode: 'locked' } } })).status).toBe(403);
    expect((await call('GET', '/admin/overview', { token: relog.body.accessToken })).status).toBe(200);

    const f = await call('PUT', '/admin/features', { token: root.token, body: { chat: { mode: 'locked', message: 'Soon' }, quiz: { mode: 'hidden' } } });
    expect(f.status).toBe(200);
    const cfg = await call<PublicConfigDto>('GET', '/config');
    expect(cfg.body.features.chat).toEqual({ mode: 'locked', message: 'Soon' });
    await call('PUT', '/admin/features', { token: root.token, body: {} });

    await call('PUT', '/admin/settings', { token: root.token, body: { ai: { enabled: true, dailyQuota: 1 } } });
    const s = await newUser();
    expect((await call('POST', '/ai/solve', { token: s.token, body: { question: '2 + 3' } })).status).toBe(200);
    expect((await call('POST', '/ai/solve', { token: s.token, body: { question: '2 + 3' } })).status).toBe(429);
    await call('PUT', '/admin/settings', {
      token: root.token,
      body: { ai: { enabled: true, dailyQuota: 60 }, maintenance: { enabled: true, message: 'brb' } },
    });
    expect((await call('GET', '/posts', { token: s.token })).status).toBe(503);
    expect((await call('GET', '/posts', { token: root.token })).status).toBe(200);
    await call('PUT', '/admin/settings', { token: root.token, body: { maintenance: { enabled: false, message: '' } } });
    expect((await call('GET', '/posts', { token: s.token })).status).toBe(200);
  });

  it('ban blocks access and revokes sessions; reports resolve', async () => {
    const root = await rootUser();
    const bad = await newUser();
    const reporter = await newUser();
    const post = await call<{ id: string }>('POST', '/posts', { token: bad.token, body: { text: 'spam spam' } });
    await call('POST', '/reports', { token: reporter.token, body: { targetType: 'post', targetId: post.body.id, reason: 'spam' } });
    const reports = await call<{ items: { id: string; target: { label: string } | null }[] }>('GET', '/admin/reports', { token: root.token });
    const rep = reports.body.items.find((r) => r.target?.label === 'spam spam')!;
    await call('POST', `/admin/reports/${rep.id}/resolve`, { token: root.token, body: { status: 'resolved', removeContent: true } });
    expect((await call('GET', `/posts/${post.body.id}`, { token: reporter.token })).status).toBe(404);
    await call('POST', `/admin/users/${bad.user.id}/ban`, { token: root.token, body: { reason: 'spam' } });
    expect((await call('GET', '/posts', { token: bad.token })).status).toBe(401);
    const login = await call<{ accessToken: string }>('POST', '/auth/login', { body: { email: bad.email, password: 'Password#123' } });
    expect((await call('GET', '/posts', { token: login.body.accessToken })).status).toBe(403);
    const me = await call<{ banned: boolean }>('GET', '/me', { token: login.body.accessToken });
    expect(me.body.banned).toBe(true);
  });
});
