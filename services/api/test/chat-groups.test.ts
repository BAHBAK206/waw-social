import { describe, expect, it } from 'vitest';
import type { ChannelDto, ConversationDto, GroupDto, GroupMemberDto, Me, MessageDto, Page, PostDto } from '@qubedu/shared';
import { call, newUser } from './helpers';

describe('chat', () => {
  it('direct messages with unread counts, replies, reactions, edit/delete and idempotency', async () => {
    const a = await newUser({ name: 'Ali' });
    const b = await newUser({ name: 'Bushra' });
    const conv = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: a.token, body: { userId: b.user.id } });
    expect(conv.status).toBe(201);
    const again = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: b.token, body: { userId: a.user.id } });
    expect(again.body.id).toBe(conv.body.id);

    const m1 = await call<MessageDto>('POST', `/chat/conversations/${conv.body.id}/messages`, {
      token: a.token,
      body: { text: 'السلام عليكم', clientId: 'c1' },
    });
    expect(m1.status).toBe(201);
    const dup = await call<MessageDto>('POST', `/chat/conversations/${conv.body.id}/messages`, {
      token: a.token,
      body: { text: 'السلام عليكم', clientId: 'c1' },
    });
    expect(dup.body.id).toBe(m1.body.id);

    const list = await call<{ items: ConversationDto[] }>('GET', '/chat/conversations', { token: b.token });
    const entry = list.body.items.find((x) => x.id === conv.body.id)!;
    expect(entry.unread).toBe(1);
    expect(entry.peer?.id).toBe(a.user.id);
    expect((await call<Me>('GET', '/me', { token: b.token })).body.unreadMessages).toBe(1);

    const reply = await call<MessageDto>('POST', `/chat/conversations/${conv.body.id}/messages`, {
      token: b.token,
      body: { text: 'وعليكم السلام', replyToId: m1.body.id },
    });
    expect(reply.body.replyTo?.id).toBe(m1.body.id);
    const react = await call<MessageDto>('POST', `/chat/messages/${m1.body.id}/reactions`, { token: b.token, body: { emoji: '❤️' } });
    expect(react.body.reactions['❤️']).toEqual([b.user.id]);
    expect((await call('PATCH', `/chat/messages/${m1.body.id}`, { token: b.token, body: { text: 'x' } })).status).toBe(403);
    const edited = await call<MessageDto>('PATCH', `/chat/messages/${m1.body.id}`, { token: a.token, body: { text: 'edited' } });
    expect(edited.body.editedAt).not.toBeNull();
    await call('DELETE', `/chat/messages/${reply.body.id}`, { token: b.token });

    const msgs = await call<{ items: MessageDto[] }>('GET', `/chat/conversations/${conv.body.id}/messages`, { token: a.token });
    expect(msgs.body.items.map((m) => m.text)).toEqual(['edited', '']);
    expect(msgs.body.items[1]!.deleted).toBe(true);

    await call('POST', `/chat/conversations/${conv.body.id}/read`, { token: b.token });
    expect((await call<Me>('GET', '/me', { token: b.token })).body.unreadMessages).toBe(0);

    const outsider = await newUser();
    expect((await call('GET', `/chat/conversations/${conv.body.id}/messages`, { token: outsider.token })).status).toBe(404);
  });

  it('respects message privacy', async () => {
    const a = await newUser();
    const b = await newUser();
    await call('PATCH', '/me/prefs', { token: b.token, body: { privacy: { allowMessages: 'none' } } });
    expect((await call('POST', '/chat/conversations/direct', { token: a.token, body: { userId: b.user.id } })).status).toBe(403);
  });
});

describe('groups & communities', () => {
  it('public group lifecycle: create, join, post, pin, members, chat', async () => {
    const owner = await newUser({ name: 'Teacher', accountType: 'teacher' });
    const member = await newUser({ name: 'Student' });
    const g = await call<GroupDto & { newAchievements: string[] }>('POST', '/groups', {
      token: owner.token,
      body: { name: 'Physics 101', description: 'd', privacy: 'public' },
    });
    expect(g.status).toBe(201);
    expect(g.body.myRole).toBe('owner');
    expect(g.body.newAchievements).toContain('ach_grp1');
    expect((await call<{ status: string }>('POST', `/groups/${g.body.id}/join`, { token: member.token })).body.status).toBe('member');

    const post = await call<PostDto>('POST', '/posts', { token: member.token, body: { text: 'question?', groupId: g.body.id } });
    expect(post.status).toBe(201);
    expect((await call('POST', `/posts/${post.body.id}/pin`, { token: member.token, body: { pinned: true } })).status).toBe(403);
    expect((await call('POST', `/posts/${post.body.id}/pin`, { token: owner.token, body: { pinned: true } })).status).toBe(200);
    await call('POST', '/posts', { token: owner.token, body: { text: 'newer', groupId: g.body.id } });
    const feed = await call<Page<PostDto>>('GET', `/groups/${g.body.id}/posts`, { token: member.token });
    expect(feed.body.items[0]!.id).toBe(post.body.id);
    expect(feed.body.items[0]!.pinned).toBe(true);

    const members = await call<Page<GroupMemberDto>>('GET', `/groups/${g.body.id}/members`, { token: member.token });
    expect(members.body.items).toHaveLength(2);
    expect((await call('PATCH', `/groups/${g.body.id}/members/${member.user.id}`, { token: owner.token, body: { role: 'teacher' } })).status).toBe(200);

    const detail = await call<GroupDto>('GET', `/groups/${g.body.id}`, { token: member.token });
    expect(detail.body.myRole).toBe('teacher');
    const msg = await call<MessageDto>('POST', `/chat/conversations/${detail.body.conversationId}/messages`, {
      token: member.token,
      body: { text: 'hi group' },
    });
    expect(msg.status).toBe(201);
    const ownerConvs = await call<{ items: ConversationDto[] }>('GET', '/chat/conversations', { token: owner.token });
    expect(ownerConvs.body.items.some((x) => x.id === detail.body.conversationId)).toBe(false);
    const open = await call<ConversationDto>('GET', `/chat/conversations/${detail.body.conversationId}`, { token: owner.token });
    expect(open.body.unread).toBe(1);

    expect((await call('POST', `/groups/${g.body.id}/leave`, { token: owner.token })).status).toBe(400);
    expect((await call('POST', `/groups/${g.body.id}/leave`, { token: member.token })).status).toBe(200);
  });

  it('private group requires approval; community has channels with announcement-only rules', async () => {
    const owner = await newUser();
    const user = await newUser();
    const g = await call<GroupDto>('POST', '/groups', { token: owner.token, body: { name: 'Secret club', privacy: 'private' } });
    expect((await call<{ status: string }>('POST', `/groups/${g.body.id}/join`, { token: user.token, body: { message: 'please' } })).body.status).toBe(
      'requested',
    );
    expect((await call('GET', `/groups/${g.body.id}/posts`, { token: user.token })).status).toBe(403);
    const reqs = await call<{ items: { user: { id: string } }[] }>('GET', `/groups/${g.body.id}/requests`, { token: owner.token });
    expect(reqs.body.items[0]!.user.id).toBe(user.user.id);
    await call('POST', `/groups/${g.body.id}/requests/${user.user.id}/approve`, { token: owner.token });
    expect((await call('GET', `/groups/${g.body.id}/posts`, { token: user.token })).status).toBe(200);

    const com = await call<GroupDto>('POST', '/groups', { token: owner.token, body: { name: 'Big community', kind: 'community' } });
    await call('POST', `/groups/${com.body.id}/join`, { token: user.token });
    const chans = await call<{ items: ChannelDto[] }>('GET', `/groups/${com.body.id}/channels`, { token: user.token });
    expect(chans.body.items.map((x) => x.name)).toEqual(['announcements', 'general']);
    const ann = chans.body.items[0]!;
    const gen = chans.body.items[1]!;
    expect((await call('POST', `/chat/conversations/${ann.conversationId}/messages`, { token: user.token, body: { text: 'x' } })).status).toBe(403);
    expect((await call('POST', `/chat/conversations/${ann.conversationId}/messages`, { token: owner.token, body: { text: 'news' } })).status).toBe(201);
    expect((await call('POST', `/chat/conversations/${gen.conversationId}/messages`, { token: user.token, body: { text: 'hello' } })).status).toBe(201);
    const list = await call<Page<GroupDto>>('GET', '/groups?kind=community&scope=mine', { token: user.token });
    expect(list.body.items.some((x) => x.id === com.body.id)).toBe(true);
  });
});
