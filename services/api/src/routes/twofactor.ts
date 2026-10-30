import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { consentResendSchema, twoFactorCodeSchema, twoFactorDisableSchema } from '@qubedu/shared';
import { users } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { verifyPassword } from '../lib/crypto';
import { badRequest, unauthorized } from '../lib/errors';
import { body, requireUser } from '../lib/http';
import { consentPending, minorColumns } from '../lib/minors';
import { newRecoveryCodes, newTotpSecret, openSecret, otpauthUri, recoveryHash, sealSecret, verifyTotp } from '../lib/totp';
import { checkRate } from '../middleware';
import { sendConsentEmail } from './auth';

/** Two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). */
export const twoFactorRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const [u] = await c.get('deps').db.select({ on: users.totpEnabledAt, rec: users.totpRecovery }).from(users).where(eq(users.id, user.id));
    return c.json({ enabled: !!u?.on, recoveryLeft: u?.rec.length ?? 0 });
  })
  /** Starts setup: a new secret to add to the app (as a QR code or typed in). Nothing changes until it's confirmed. */
  .post('/setup', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: '2fa-setup', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const [u] = await deps.db.select({ email: users.email, on: users.totpEnabledAt }).from(users).where(eq(users.id, user.id));
    if (u?.on) throw badRequest('two_factor_on');
    const secret = newTotpSecret();
    await deps.kv.set(`2fa-setup:${user.id}`, sealSecret(secret, deps.env.JWT_SECRET), 900);
    return c.json({ secret, uri: otpauthUri(secret, u?.email ?? user.displayName) });
  })
  .post('/enable', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: '2fa-enable', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { code } = await body(c, twoFactorCodeSchema);
    const sealed = await deps.kv.get(`2fa-setup:${user.id}`);
    if (!sealed) throw badRequest('two_factor_setup_expired');
    if (!verifyTotp(openSecret(sealed, deps.env.JWT_SECRET), code)) throw badRequest('invalid_code');
    const { codes, hashes } = newRecoveryCodes();
    await deps.db
      .update(users)
      .set({ totpSecret: sealed, totpEnabledAt: new Date(), totpRecovery: hashes, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await deps.kv.del(`2fa-setup:${user.id}`);
    return c.json({ recoveryCodes: codes });
  })
  /** Turning it off needs the password and a current code (or a recovery code). */
  .post('/disable', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: '2fa-disable', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, twoFactorDisableSchema);
    const [u] = await deps.db.select({ hash: users.passwordHash, secret: users.totpSecret, rec: users.totpRecovery }).from(users).where(eq(users.id, user.id));
    if (!u?.secret) throw badRequest('two_factor_off');
    if (!u.hash || !(await verifyPassword(u.hash, input.password))) throw unauthorized('invalid_credentials');
    const ok = verifyTotp(openSecret(u.secret, deps.env.JWT_SECRET), input.code) || u.rec.includes(recoveryHash(input.code));
    if (!ok) throw badRequest('invalid_code');
    await deps.db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpRecovery: [], updatedAt: new Date() }).where(eq(users.id, user.id));
    return c.json({ ok: true });
  })
  .post('/recovery', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: '2fa-recovery', limit: 5, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { code } = await body(c, twoFactorCodeSchema);
    const [u] = await deps.db.select({ secret: users.totpSecret }).from(users).where(eq(users.id, user.id));
    if (!u?.secret) throw badRequest('two_factor_off');
    if (!verifyTotp(openSecret(u.secret, deps.env.JWT_SECRET), code)) throw badRequest('invalid_code');
    const { codes, hashes } = newRecoveryCodes();
    await deps.db.update(users).set({ totpRecovery: hashes }).where(eq(users.id, user.id));
    return c.json({ recoveryCodes: codes });
  });

/** An under-13 student asks again for a parent's approval (optionally to another address). */
export const consentRoutes = new Hono<AppEnv>().post('/resend', async (c) => {
  const user = requireUser(c);
  await checkRate(c, { bucket: 'consent-resend', limit: 3, windowSec: 3600, by: 'user' });
  const deps = c.get('deps');
  const input = await body(c, consentResendSchema);
  const [u] = await deps.db
    .select({ ...minorColumns, email: users.email, consentEmail: users.consentEmail, name: users.displayName, appearance: users.appearance })
    .from(users)
    .where(eq(users.id, user.id));
  if (!u || !consentPending(u)) throw badRequest('consent_not_needed');
  const to = input.parentEmail ?? u.consentEmail;
  if (!to || to === u.email) throw badRequest('parent_email_required');
  if (input.parentEmail) await deps.db.update(users).set({ consentEmail: input.parentEmail }).where(eq(users.id, user.id));
  await sendConsentEmail(deps, { id: u.id, displayName: u.name }, to, (u.appearance as { language?: string }).language ?? 'ar');
  return c.json({ ok: true });
});
