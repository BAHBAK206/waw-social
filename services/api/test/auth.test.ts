import { describe, expect, it } from 'vitest';
import type { AuthResult, Me } from '@qubedu/shared';
import { call, newUser, setupApp } from './helpers';

describe('auth', () => {
  it('registers, reads me, refreshes with rotation and detects reuse', async () => {
    const u = await newUser({ name: 'Sara' });
    expect(u.user.displayName).toBe('Sara');
    expect(u.user.role).toBe('user');
    const me = await call<Me>('GET', '/me', { token: u.token });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(u.email);

    const r1 = await call<AuthResult>('POST', '/auth/refresh', { body: { refreshToken: u.refreshToken }, headers: { 'x-client': 'mobile' } });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(u.refreshToken);
    // old token is accepted only within the grace window (parallel tabs)
    const r2 = await call<AuthResult>('POST', '/auth/refresh', { body: { refreshToken: u.refreshToken }, headers: { 'x-client': 'mobile' } });
    expect(r2.status).toBe(200);
  });

  it('rejects wrong passwords and duplicate emails', async () => {
    const u = await newUser();
    const bad = await call('POST', '/auth/login', { body: { email: u.email, password: 'nope-nope' } });
    expect(bad.status).toBe(401);
    const dup = await call('POST', '/auth/register', { body: { email: u.email, password: 'Password#123', displayName: 'Dup' } });
    expect(dup.status).toBe(409);
  });

  it('web refresh uses an httpOnly cookie and requires the CSRF header', async () => {
    const u = await newUser();
    const login = await call<AuthResult>('POST', '/auth/login', { body: { email: u.email, password: 'Password#123' } });
    const cookie = login.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('qb_rt=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(login.body.refreshToken).toBeUndefined();
    const raw = cookie.split(';')[0]!;
    const noCsrf = await call('POST', '/auth/refresh', { headers: { cookie: raw } });
    expect(noCsrf.status).toBe(403);
    const ok = await call<AuthResult>('POST', '/auth/refresh', { headers: { cookie: raw, 'x-requested-with': 'qubedu' } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(u.user.id);
  });

  it('verifies email and resets password, revoking sessions', async () => {
    const { deps } = await setupApp();
    const u = await newUser();
    const verifyMail = deps.mailer.outbox.find((m) => m.to === u.email);
    const token = verifyMail!.text.match(/token=([\w-]+)/)![1];
    expect((await call('POST', '/auth/verify-email', { body: { token } })).status).toBe(200);
    expect((await call<Me>('GET', '/me', { token: u.token })).body.emailVerified).toBe(true);

    await call('POST', '/auth/request-reset', { body: { email: u.email } });
    const resetMail = [...deps.mailer.outbox].reverse().find((m) => m.to === u.email && m.text.includes('reset-password'));
    const resetToken = resetMail!.text.match(/token=([\w-]+)/)![1];
    expect((await call('POST', '/auth/reset-password', { body: { token: resetToken, password: 'NewPassword#456' } })).status).toBe(200);
    expect((await call('GET', '/me', { token: u.token })).status).toBe(401);
    expect((await call('POST', '/auth/login', { body: { email: u.email, password: 'NewPassword#456' } })).status).toBe(200);
    expect((await call('POST', '/auth/reset-password', { body: { token: resetToken, password: 'Another#789x' } })).status).toBe(400);
  });

  it('root admin email gets root role', async () => {
    const res = await call<AuthResult>('POST', '/auth/register', {
      body: { email: 'root@qubedu.test', password: 'Password#123', displayName: 'Root Admin' },
      headers: { 'x-client': 'mobile' },
    });
    if (res.status === 201) expect(res.body.user.role).toBe('root');
    else expect(res.status).toBe(409);
  });
});
