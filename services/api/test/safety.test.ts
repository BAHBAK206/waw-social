import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AuthResult, ConversationDto, MessageDto, PostDto, PublicProfile, ReportDto } from '@qubedu/shared';
import { users } from '../src/db/schema';
import { call, newUser, rootUser, setupApp } from './helpers';

const kidYear = new Date().getUTCFullYear() - 14;

async function verified(id: string) {
  const { deps } = await setupApp();
  await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, id));
}

async function student(birthYear: number, name: string) {
  const res = await call<AuthResult>('POST', '/auth/register', {
    body: { email: `${name.toLowerCase()}${Date.now()}${Math.random()}@qubedu.test`, password: 'Password#123', displayName: name, birthYear },
    headers: { 'x-client': 'mobile' },
  });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken, user: res.body.user };
}

describe('automatic text filter', () => {
  it('masks insults and rejects threats in posts, comments, messages and names', async () => {
    const u = await newUser();
    const masked = await call<PostDto>('POST', '/posts', { token: u.token, body: { text: 'this homework is shit honestly' } });
    expect(masked.status).toBe(201);
    expect(masked.body.text).toBe('this homework is s*** honestly');

    const blocked = await call<{ error: { code: string } }>('POST', '/posts', { token: u.token, body: { text: 'just kill yourself' } });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('content_blocked');

    const comment = await call<{ text: string }>('POST', `/posts/${masked.body.id}/comments`, { token: u.token, body: { text: 'يا حمار' } });
    expect(comment.body.text).toBe('ي* ح***');

    const badName = await call('POST', '/auth/register', {
      body: { email: `n${Date.now()}@qubedu.test`, password: 'Password#123', displayName: 'kys' },
    });
    expect(badName.status).toBe(422);

    // Biology stays biology.
    const ok = await call<PostDto>('POST', '/posts', { token: u.token, body: { text: 'الكلب والحمار من الثدييات' } });
    expect(ok.body.text).toBe('الكلب والحمار من الثدييات');
  });

  it('uses the words the administrator adds, and can be switched off', async () => {
    const root = await rootUser();
    const u = await newUser();
    const put = await call('PUT', '/admin/settings', {
      token: root.token,
      body: { moderation: { enabled: true, mask: ['meh'], block: ['spamcoin'], autoHideReports: 3 } },
    });
    expect(put.status).toBe(200);
    expect((await call('POST', '/posts', { token: u.token, body: { text: 'buy spamcoin today' } })).status).toBe(422);
    expect((await call<PostDto>('POST', '/posts', { token: u.token, body: { text: 'meh lesson' } })).body.text).toBe('m** lesson');
    await call('PUT', '/admin/settings', { token: root.token, body: { moderation: { enabled: false, mask: [], block: [], autoHideReports: 3 } } });
    expect((await call<PostDto>('POST', '/posts', { token: u.token, body: { text: 'shit' } })).body.text).toBe('shit');
    await call('PUT', '/admin/settings', { token: root.token, body: { moderation: { enabled: true, mask: [], block: [], autoHideReports: 3 } } });
  });
});

describe('reports', () => {
  it('hides a post after reports from three established members, and a dismissal restores it', async () => {
    const author = await newUser({ name: 'Author' });
    const post = await call<PostDto>('POST', '/posts', { token: author.token, body: { text: 'Join my channel for answers' } });
    const report = (token: string) =>
      call<{ id: string; hidden: boolean }>('POST', '/reports', { token, body: { targetType: 'post', targetId: post.body.id, reason: 'spam' } });

    // Brand-new, unverified accounts don't count toward hiding.
    for (let i = 0; i < 3; i++) {
      const r = await report((await newUser()).token);
      expect(r.body, JSON.stringify(r.body)).toMatchObject({ hidden: false });
    }
    expect((await call('GET', `/posts/${post.body.id}`, { token: author.token })).status).toBe(200);

    const reporters = [await newUser(), await newUser(), await newUser()];
    for (const r of reporters) await verified(r.user.id);
    expect((await report(reporters[0]!.token)).body.hidden).toBe(false);
    // Reporting twice is one report.
    expect((await report(reporters[0]!.token)).status).toBe(200);
    expect((await report(reporters[1]!.token)).body.hidden).toBe(false);
    expect((await report(reporters[2]!.token)).body.hidden).toBe(true);
    expect((await call('GET', `/posts/${post.body.id}`, { token: author.token })).status).toBe(404);

    const root = await rootUser();
    const list = await call<{ items: ReportDto[] }>('GET', '/admin/reports', { token: root.token });
    const mine = list.body.items.find((r) => r.targetId === post.body.id)!;
    expect(mine.autoHidden).toBe(true);
    expect(mine.reportCount).toBe(6);
    expect((await call('POST', `/admin/reports/${mine.id}/resolve`, { token: root.token, body: { status: 'dismissed' } })).status).toBe(200);
    expect((await call('GET', `/posts/${post.body.id}`, { token: author.token })).status).toBe(200);
    const after = await call<{ items: ReportDto[] }>('GET', '/admin/reports', { token: root.token });
    expect(after.body.items.some((r) => r.targetId === post.body.id)).toBe(false);
  });
});

describe('under-18 protections', () => {
  it('limits messages between adults and students who do not know them, and strips contact details', async () => {
    const kid = await student(kidYear, 'Kid');
    expect(kid.user.isMinor).toBe(true);
    const stranger = await newUser({ name: 'Stranger' });
    const teacher = await newUser({ name: 'Teacher', accountType: 'teacher' });

    const prof = await call<PublicProfile>('GET', `/users/${kid.user.id}`, { token: stranger.token });
    expect(prof.body.canMessage).toBe(false);
    const denied = await call<{ error: { code: string } }>('POST', '/chat/conversations/direct', { token: stranger.token, body: { userId: kid.user.id } });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('minor_protected');

    // The student follows their teacher: now they can talk, but numbers and other apps stay out of the chat.
    expect((await call('POST', `/users/${teacher.user.id}/follow`, { token: kid.token })).status).toBeLessThan(300);
    const conv = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: teacher.token, body: { userId: kid.user.id } });
    expect(conv.status).toBeLessThan(300);
    const msg = await call<MessageDto>('POST', `/chat/conversations/${conv.body.id}/messages`, {
      token: teacher.token,
      body: { text: 'Call me on 01012345678 or whatsapp: teach99, mail t@x.com. Chapter 3.14159 page 12' },
    });
    expect(msg.status).toBe(201);
    expect(msg.body.text).toBe('Call me on [•••] or [•••], mail [•••]. Chapter 3.14159 page 12');

    // Two adults are unaffected.
    const conv2 = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: teacher.token, body: { userId: stranger.user.id } });
    const m2 = await call<MessageDto>('POST', `/chat/conversations/${conv2.body.id}/messages`, { token: teacher.token, body: { text: '01012345678' } });
    expect(m2.body.text).toBe('01012345678');
  });

  it('hides school details from strangers and keeps the birth year from being changed', async () => {
    const kid = await student(kidYear, 'Pupil');
    await call('PATCH', '/me', { token: kid.token, body: { institution: 'Cairo Prep School' } });
    const stranger = await newUser();
    expect((await call<PublicProfile>('GET', `/users/${kid.user.id}`, { token: stranger.token })).body.institution).toBeNull();
    expect((await call<PublicProfile>('GET', `/users/${kid.user.id}`, { token: kid.token })).body.institution).toBe('Cairo Prep School');

    const lift = await call<{ error: { code: string } }>('PATCH', '/me', { token: kid.token, body: { birthYear: 1990 } });
    expect(lift.status).toBe(403);
    expect(lift.body.error.code).toBe('birth_year_locked');

    const adult = await newUser();
    expect((await call('PATCH', '/me', { token: adult.token, body: { birthYear: 1995 } })).status).toBe(200);
    const root = await rootUser();
    expect((await call('PUT', `/admin/users/${kid.user.id}/birth-year`, { token: root.token, body: { birthYear: 1990 } })).status).toBe(200);
    expect((await call<{ isMinor: boolean }>('GET', '/me', { token: kid.token })).body.isMinor).toBe(false);
  });
});

describe('attachments and links', () => {
  it("won't re-sign someone else's private file and rejects script links", async () => {
    const owner = await newUser();
    const other = await newUser();
    const form = new FormData();
    form.set('file', new File([new TextEncoder().encode('%PDF-1.4 secret')], 'secret.pdf', { type: 'application/pdf' }));
    form.set('purpose', 'chat');
    const up = await call<{ url: string; key: string; mime: string; size: number }>('POST', '/uploads', { token: owner.token, form });
    expect(up.body.key.startsWith('private/')).toBe(true);

    const conv = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: other.token, body: { userId: owner.user.id } });
    const attachment = { url: up.body.url, name: 'secret.pdf', mime: 'application/pdf', size: up.body.size, kind: 'file' };
    const stolen = await call('POST', `/chat/conversations/${conv.body.id}/messages`, { token: other.token, body: { attachment } });
    expect(stolen.status).toBe(400);
    const own = await call('POST', `/chat/conversations/${conv.body.id}/messages`, { token: owner.token, body: { attachment } });
    expect(own.status).toBe(201);

    const lib = await call('POST', '/library', { token: owner.token, body: { title: 'Notes', fileUrl: 'javascript:alert(1)' } });
    expect(lib.status).toBe(400);
  });
});
