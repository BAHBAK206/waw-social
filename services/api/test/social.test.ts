import { describe, expect, it } from 'vitest';
import type { CommentDto, Me, NotificationDto, Page, PostDto, PublicProfile } from '@qubedu/shared';
import { call, newUser } from './helpers';

describe('social', () => {
  it('follow → notification → feed → react → comment', async () => {
    const a = await newUser({ name: 'Ahmed' });
    const b = await newUser({ name: 'Mona' });
    const f = await call<{ following: boolean; newAchievements: string[] }>('POST', `/users/${b.user.id}/follow`, { token: a.token });
    expect(f.body.following).toBe(true);
    expect(f.body.newAchievements).toContain('ach_friend1');
    const prof = await call<PublicProfile>('GET', `/users/${b.user.id}`, { token: a.token });
    expect(prof.body.isFollowing).toBe(true);
    expect(prof.body.followers).toBe(1);

    const notifs = await call<Page<NotificationDto> & { unread: number }>('GET', '/notifications', { token: b.token });
    expect(notifs.body.items[0]?.type).toBe('follow');
    expect(notifs.body.unread).toBe(1);

    const post = await call<PostDto>('POST', '/posts', { token: b.token, body: { text: 'مرحبا بالجميع #دراسة' } });
    expect(post.status).toBe(201);
    const feed = await call<Page<PostDto>>('GET', '/posts?scope=following', { token: a.token });
    expect(feed.body.items.some((p) => p.id === post.body.id)).toBe(true);

    const r = await call<{ reactionCounts: Record<string, number> }>('PUT', `/posts/${post.body.id}/reaction`, { token: a.token, body: { reaction: 'love' } });
    expect(r.body.reactionCounts.love).toBe(1);
    const r2 = await call<{ reactionCounts: Record<string, number> }>('PUT', `/posts/${post.body.id}/reaction`, { token: a.token, body: { reaction: 'like' } });
    expect(r2.body.reactionCounts).toEqual({ like: 1 });

    const cm = await call<CommentDto>('POST', `/posts/${post.body.id}/comments`, { token: a.token, body: { text: 'أهلًا' } });
    expect(cm.status).toBe(201);
    const list = await call<Page<CommentDto>>('GET', `/posts/${post.body.id}/comments`, { token: b.token });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]!.canDelete).toBe(true);

    const edit = await call('PATCH', `/posts/${post.body.id}`, { token: a.token, body: { text: 'hijack' } });
    expect(edit.status).toBe(403);
    const del = await call('DELETE', `/posts/${post.body.id}`, { token: b.token });
    expect(del.status).toBe(200);
    expect((await call('GET', `/posts/${post.body.id}`, { token: a.token })).status).toBe(404);
  });

  it('paginates the feed with stable cursors', async () => {
    const u = await newUser();
    for (let i = 0; i < 5; i++) await call('POST', '/posts', { token: u.token, body: { text: `post ${i}` } });
    const p1 = await call<Page<PostDto>>('GET', '/posts?scope=mine&limit=2', { token: u.token });
    expect(p1.body.items.map((p) => p.text)).toEqual(['post 4', 'post 3']);
    const p2 = await call<Page<PostDto>>(`GET`, `/posts?scope=mine&limit=2&cursor=${p1.body.nextCursor}`, { token: u.token });
    expect(p2.body.items.map((p) => p.text)).toEqual(['post 2', 'post 1']);
    const p3 = await call<Page<PostDto>>(`GET`, `/posts?scope=mine&limit=2&cursor=${p2.body.nextCursor}`, { token: u.token });
    expect(p3.body.items.map((p) => p.text)).toEqual(['post 0']);
    expect(p3.body.nextCursor).toBeNull();
  });

  it('updates profile and prefs; username uniqueness', async () => {
    const a = await newUser();
    const b = await newUser();
    const uname = `user_${Date.now()}`;
    const res = await call<Me>('PATCH', '/me', { token: a.token, body: { username: uname, bio: 'hello' } });
    expect(res.body.username).toBe(uname);
    expect((await call('PATCH', '/me', { token: b.token, body: { username: uname } })).status).toBe(409);
    const prefs = await call<Me>('PATCH', '/me/prefs', { token: a.token, body: { appearance: { theme: 'dark', skin: 'ocean' }, timezone: 'Africa/Cairo' } });
    expect(prefs.body.appearance.theme).toBe('dark');
    expect(prefs.body.appearance.design).toBe('classic');
    expect(prefs.body.timezone).toBe('Africa/Cairo');
    expect((await call('PATCH', '/me/prefs', { token: a.token, body: { timezone: 'Mars/Base' } })).status).toBe(400);
  });

  it('uploads validate real file types', async () => {
    const u = await newUser();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.set('file', new File([png], 'a.png', { type: 'image/png' }));
    form.set('purpose', 'avatar');
    const ok = await call<{ url: string; key: string }>('POST', '/uploads', { token: u.token, form });
    expect(ok.status).toBe(201);
    const served = await call('GET', `/files/${ok.body.key}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');

    const fake = new FormData();
    fake.set('file', new File([new TextEncoder().encode('<script>alert(1)</script>')], 'x.png', { type: 'image/png' }));
    fake.set('purpose', 'avatar');
    expect((await call('POST', '/uploads', { token: u.token, form: fake })).status).toBe(400);

    const priv = new FormData();
    priv.set('file', new File([new TextEncoder().encode('%PDF-1.4 test')], 'doc.pdf', { type: 'application/pdf' }));
    priv.set('purpose', 'chat');
    const p = await call<{ url: string; key: string }>('POST', '/uploads', { token: u.token, form: priv });
    expect(p.body.key.startsWith('private/')).toBe(true);
    expect((await call('GET', `/files/${p.body.key}`)).status).toBe(404);
    const signed = new URL(p.body.url);
    expect((await call('GET', `${signed.pathname}${signed.search}`)).status).toBe(200);
  });
});
