import { describe, expect, it } from 'vitest';
import type { ConversationDto } from '@qubedu/shared';
import { pushIdle } from '../src/lib/push';
import { call, newUser, sentPushes } from './helpers';

const expoToken = (s: string) => `ExponentPushToken[${s}${Date.now()}${Math.random().toString(36).slice(2, 8)}]`;

describe('push notifications', () => {
  it('delivers a chat message to the phone in the reader’s language and forgets uninstalled apps', async () => {
    const sender = await newUser({ name: 'Mona' });
    const reader = await newUser({ name: 'Omar' });
    await call('PATCH', '/me/prefs', { token: reader.token, body: { appearance: { language: 'en' } } });
    const phone = expoToken('phone');
    const gone = expoToken('gone');
    expect((await call('POST', '/me/push', { token: reader.token, body: { kind: 'expo', token: phone, platform: 'android' } })).status).toBe(200);
    expect((await call('POST', '/me/push', { token: reader.token, body: { kind: 'expo', token: gone, platform: 'ios' } })).status).toBe(200);

    const conv = await call<ConversationDto>('POST', '/chat/conversations/direct', { token: sender.token, body: { userId: reader.user.id } });
    const before = sentPushes.length;
    await call('POST', `/chat/conversations/${conv.body.id}/messages`, { token: sender.token, body: { text: 'Did you finish chapter 4?' } });
    await pushIdle();
    const sent = sentPushes.slice(before).find((p) => p.targets.some((t) => t.token === phone))!;
    expect(sent.msg.body).toContain('Mona');
    expect(sent.msg.body).toContain('Did you finish chapter 4?');
    expect(sent.msg.link).toBe(`/chat/${conv.body.id}`);
    expect(sent.msg.tag).toBe(`/chat/${conv.body.id}`);

    // The "gone" device was reported as uninstalled and removed: the next push only goes to the phone.
    const mark = sentPushes.length;
    await call('POST', `/chat/conversations/${conv.body.id}/messages`, { token: sender.token, body: { text: 'Hello?' } });
    await pushIdle();
    const next = sentPushes.slice(mark).find((p) => p.targets.some((t) => t.token === phone))!;
    expect(next.targets.map((t) => t.token)).toEqual([phone]);
  });

  it('respects the push switch, unregisters devices and only accepts real push services', async () => {
    const a = await newUser();
    const b = await newUser();
    const phone = expoToken('quiet');
    await call('POST', '/me/push', { token: b.token, body: { kind: 'expo', token: phone } });
    await call('PATCH', '/me/prefs', { token: b.token, body: { notifications: { push: false } } });
    const mark = sentPushes.length;
    await call('POST', `/users/${b.user.id}/follow`, { token: a.token });
    await pushIdle();
    expect(sentPushes.slice(mark).some((p) => p.targets.some((t) => t.token === phone))).toBe(false);

    await call('PATCH', '/me/prefs', { token: b.token, body: { notifications: { push: true } } });
    expect((await call('DELETE', '/me/push', { token: b.token, body: { token: phone } })).status).toBe(200);
    await call('DELETE', `/users/${b.user.id}/follow`, { token: a.token });
    const mark2 = sentPushes.length;
    await call('POST', `/users/${b.user.id}/follow`, { token: a.token });
    await pushIdle();
    expect(sentPushes.slice(mark2).some((p) => p.targets.some((t) => t.token === phone))).toBe(false);

    const internal = await call('POST', '/me/push', {
      token: a.token,
      body: { kind: 'web', token: 'https://169.254.169.254/latest/meta-data', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(10) } },
    });
    expect(internal.status).toBe(400);
    const browser = await call('POST', '/me/push', {
      token: a.token,
      body: { kind: 'web', token: `https://fcm.googleapis.com/fcm/send/${Date.now()}`, keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(10) } },
    });
    expect(browser.status).toBe(200);
    const key = await call<{ enabled: boolean; vapidPublicKey: string }>('GET', '/me/push/key', { token: a.token });
    expect(key.body.enabled).toBe(true);
    expect(key.body.vapidPublicKey.length).toBeGreaterThan(40);
  });
});
