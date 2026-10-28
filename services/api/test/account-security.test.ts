import { describe, expect, it } from 'vitest';
import type { AuthResult, Me } from '@qubedu/shared';
import { totpCode } from '../src/lib/totp';
import { call, newUser, setupApp } from './helpers';

const login = (email: string, password = 'Password#123') =>
  call<AuthResult & { twoFactorRequired?: boolean; ticket?: string }>('POST', '/auth/login', { body: { email, password }, headers: { 'x-client': 'mobile' } });

describe('two-step sign-in', () => {
  it('turns on with an authenticator code, asks for it at sign-in, and accepts a recovery code once', async () => {
    const u = await newUser({ name: 'Careful Teacher', accountType: 'teacher' });
    const setup = await call<{ secret: string; uri: string }>('POST', '/me/2fa/setup', { token: u.token });
    expect(setup.body.uri).toMatch(/^otpauth:\/\/totp\/Qubedu%3A.*secret=[A-Z2-7]+&issuer=Qubedu/);
    expect((await call('POST', '/me/2fa/enable', { token: u.token, body: { code: '000000' } })).status).toBe(400);
    const on = await call<{ recoveryCodes: string[] }>('POST', '/me/2fa/enable', { token: u.token, body: { code: totpCode(setup.body.secret) } });
    expect(on.body.recoveryCodes).toHaveLength(10);
    expect((await call<Me>('GET', '/me', { token: u.token })).body.twoFactor).toBe(true);

    // Password alone gives a ticket, not a session.
    const first = await login(u.email);
    expect(first.body).toMatchObject({ twoFactorRequired: true });
    expect(first.body.accessToken).toBeUndefined();
    expect((await call('POST', '/auth/login/2fa', { body: { ticket: first.body.ticket, code: '123456' } })).status).toBe(401);
    const ok = await call<AuthResult>('POST', '/auth/login/2fa', { body: { ticket: first.body.ticket, code: totpCode(setup.body.secret) } });
    expect(ok.body.accessToken).toBeTruthy();
    // The ticket works once.
    expect((await call('POST', '/auth/login/2fa', { body: { ticket: first.body.ticket, code: totpCode(setup.body.secret) } })).status).toBe(401);

    // A recovery code instead of the app, once.
    const second = await login(u.email);
    const rec = on.body.recoveryCodes[0]!;
    expect((await call('POST', '/auth/login/2fa', { body: { ticket: second.body.ticket, code: rec } })).status).toBe(200);
    const third = await login(u.email);
    expect((await call('POST', '/auth/login/2fa', { body: { ticket: third.body.ticket, code: rec } })).status).toBe(401);

    // Too many wrong codes end the ticket.
    const fourth = await login(u.email);
    for (let i = 0; i < 5; i++) await call('POST', '/auth/login/2fa', { body: { ticket: fourth.body.ticket, code: '000000' } });
    expect((await call('POST', '/auth/login/2fa', { body: { ticket: fourth.body.ticket, code: totpCode(setup.body.secret) } })).status).toBe(401);

    // Turning it off needs the password and a code.
    expect((await call('POST', '/me/2fa/disable', { token: u.token, body: { password: 'wrong', code: totpCode(setup.body.secret) } })).status).toBe(401);
    expect((await call('POST', '/me/2fa/disable', { token: u.token, body: { password: 'Password#123', code: totpCode(setup.body.secret) } })).status).toBe(200);
    expect((await login(u.email)).body.accessToken).toBeTruthy();
  });
});

describe('parental consent under 13', () => {
  it('needs a parent email, keeps social features and the AI off until the parent approves, and a refusal closes the account', async () => {
    const { deps } = await setupApp();
    const base = { password: 'Password#123', displayName: 'Little Sami', accountType: 'student', gradeLevel: 'p3' };
    const noParent = await call<{ error: { code: string } }>('POST', '/auth/register', { body: { ...base, email: `sami${Date.now()}@kids.test` } });
    expect(noParent.body.error.code).toBe('parent_email_required');
    const parentEmail = `sami.mum${Date.now()}@family.test`;
    const before = deps.mailer.outbox.length;
    const r = await call<AuthResult>('POST', '/auth/register', {
      body: { ...base, email: `sami${Date.now()}b@kids.test`, parentEmail },
      headers: { 'x-client': 'mobile' },
    });
    expect(r.status).toBe(201);
    const me = await call<Me>('GET', '/me', { token: r.body.accessToken });
    expect(me.body).toMatchObject({ consentPending: true, parentalControls: { ai: false, publicPosts: false } });
    expect((await call('POST', '/ai/solve', { token: r.body.accessToken, body: { question: 'hi' } })).status).toBe(403);
    // Teens and adults don't need it.
    const teen = await call<AuthResult>('POST', '/auth/register', { body: { ...base, gradeLevel: 's1', email: `teen${Date.now()}@kids.test` } });
    expect((await call<Me>('GET', '/me', { token: teen.body.accessToken })).body.consentPending).toBe(false);

    const mail = deps.mailer.outbox.slice(before).find((m) => m.to === parentEmail && m.text.includes('/consent?token='))!;
    const token = /consent\?token=([\w-]+)/.exec(mail.text)![1]!;
    const view = await call<{ childName: string }>('GET', `/auth/consent?token=${token}`);
    expect(view.body.childName).toBe('Little Sami');
    expect((await call('POST', '/auth/consent', { body: { token, approve: true } })).status).toBe(200);
    expect((await call<Me>('GET', '/me', { token: r.body.accessToken })).body).toMatchObject({ consentPending: false, parentalControls: { ai: true } });
    expect((await call('POST', '/auth/consent', { body: { token, approve: true } })).status).toBe(400);

    // Another child; the parent declines: the account is closed.
    const b2 = deps.mailer.outbox.length;
    const kidEmail = `nour${Date.now()}@kids.test`;
    await call('POST', '/auth/register', { body: { ...base, email: kidEmail, parentEmail } });
    const mail2 = deps.mailer.outbox.slice(b2).find((m) => m.text.includes('/consent?token='))!;
    const token2 = /consent\?token=([\w-]+)/.exec(mail2.text)![1]!;
    await call('POST', '/auth/consent', { body: { token: token2, approve: false } });
    expect((await call('POST', '/auth/login', { body: { email: kidEmail, password: 'Password#123' } })).status).toBe(401);

    // Asking again (to a corrected address) works for a waiting child only.
    const r3 = await call<AuthResult>('POST', '/auth/register', { body: { ...base, email: `rana${Date.now()}@kids.test`, parentEmail: 'typo@family.test' } });
    expect((await call('POST', '/me/consent/resend', { token: r3.body.accessToken, body: { parentEmail } })).status).toBe(200);
    expect((await call('POST', '/me/consent/resend', { token: r.body.accessToken, body: {} })).status).toBe(400);
    const other = await newUser();
    expect((await call('POST', '/me/consent/resend', { token: other.token, body: {} })).status).toBe(400);
  });
});
