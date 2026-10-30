import type { NotificationDto, Page, PostDto, UserSummary } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser } from './helpers';

describe('blocking', () => {
  it('hides the blocked person’s comments, stops their notifications and lists them for unblocking', async () => {
    const me = await newUser({ name: 'Lina' });
    const other = await newUser({ name: 'Rude Ron' });
    const post = await call<PostDto>('POST', '/posts', { token: me.token, body: { text: 'Who can explain photosynthesis?' } });
    expect(post.status).toBe(201);
    await call('POST', `/posts/${post.body.id}/comments`, { token: other.token, body: { text: 'Before the block' } });
    let comments = await call<Page<{ text: string }>>('GET', `/posts/${post.body.id}/comments`, { token: me.token });
    expect(comments.body.items.map((x) => x.text)).toContain('Before the block');

    expect((await call('POST', `/users/${other.user.id}/block`, { token: me.token })).status).toBe(200);
    const before = (await call<Page<NotificationDto>>('GET', '/notifications', { token: me.token })).body.items.length;
    await call('POST', `/posts/${post.body.id}/comments`, { token: other.token, body: { text: 'After the block' } });
    comments = await call<Page<{ text: string }>>('GET', `/posts/${post.body.id}/comments`, { token: me.token });
    expect(comments.body.items).toHaveLength(0);
    expect((await call<Page<NotificationDto>>('GET', '/notifications', { token: me.token })).body.items.length).toBe(before);

    const list = await call<{ items: UserSummary[] }>('GET', '/me/blocks', { token: me.token });
    expect(list.body.items.map((u) => u.id)).toEqual([other.user.id]);
    await call('DELETE', `/users/${other.user.id}/block`, { token: me.token });
    expect((await call<{ items: UserSummary[] }>('GET', '/me/blocks', { token: me.token })).body.items).toEqual([]);
    comments = await call<Page<{ text: string }>>('GET', `/posts/${post.body.id}/comments`, { token: me.token });
    expect(comments.body.items).toHaveLength(2);
  });
});
