import { randomInt } from 'node:crypto';
import { createTranslator, isLocale } from '@qubedu/i18n';
import { and, eq, gt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizePhone, phonePrefsSchema, phoneStartSchema, phoneVerifySchema, type PhoneSettingsDto } from '@qubedu/shared';
import { messageLog, phoneCodes, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { hmac, safeEqual } from '../lib/crypto';
import { AppError, badRequest, forbidden } from '../lib/errors';
import { body, requireUser } from '../lib/http';
import { messagePerson } from '../lib/parentMessages';
import { checkRate } from '../middleware';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

/** +201001234567 → +20 100 ••• 4567 */
export const maskPhone = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ••• ${p.slice(-4)}`;

const codeHash = (deps: Deps, userId: string, code: string) => hmac(deps.env.JWT_SECRET, `phone:${userId}:${code}`);

/** Only parent accounts get WhatsApp / SMS (no phone numbers are collected from students). */
function requireParent(user: AuthUser) {
  if (user.accountType !== 'parent') throw forbidden('parents_only');
}

async function settings(deps: Deps, userId: string): Promise<PhoneSettingsDto> {
  const [u] = await deps.db
    .select({ phone: users.phone, verified: users.phoneVerifiedAt, channel: users.phoneChannel, prefs: users.phonePrefs })
    .from(users)
    .where(eq(users.id, userId));
  const [pending] = await deps.db
    .select({ phone: phoneCodes.phone })
    .from(phoneCodes)
    .where(and(eq(phoneCodes.userId, userId), gt(phoneCodes.expiresAt, new Date())));
  return {
    phone: u?.phone ? maskPhone(u.phone) : null,
    verified: !!u?.verified,
    channel: u?.channel ?? 'whatsapp',
    weekly: u?.prefs.weekly !== false,
    alerts: u?.prefs.alerts !== false,
    pending: pending ? maskPhone(pending.phone) : null,
    available: deps.messages.available,
  };
}

export const phoneRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    return c.json(await settings(c.get('deps'), user.id));
  })
  /** Sends a 6-digit code to the number; it becomes the parent's number once confirmed. */
  .post('/', async (c) => {
    const user = requireUser(c);
    requireParent(user);
    await checkRate(c, { bucket: 'phone-code', limit: 5, windowSec: 3600, by: 'user' });
    await checkRate(c, { bucket: 'phone-code-ip', limit: 20, windowSec: 3600 });
    const deps = c.get('deps');
    const input = await body(c, phoneStartSchema);
    const phone = normalizePhone(input.phone);
    if (!phone) throw badRequest('invalid_phone');
    if (!deps.messages.available[input.channel]) throw new AppError(503, 'channel_unavailable');
    // Codes cost money: a few per day per account, whatever the rate limiter's state.
    const [{ n } = { n: 0 }] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageLog)
      .where(and(eq(messageLog.userId, user.id), eq(messageLog.kind, 'code'), gt(messageLog.createdAt, sql`now() - interval '1 day'`)));
    if (n >= 10) throw new AppError(429, 'rate_limited');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = { phone, channel: input.channel, codeHash: codeHash(deps, user.id, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS) };
    await deps.db
      .insert(phoneCodes)
      .values({ userId: user.id, ...row })
      .onConflictDoUpdate({ target: phoneCodes.userId, set: { ...row, createdAt: new Date() } });
    const [u] = await deps.db.select({ appearance: users.appearance }).from(users).where(eq(users.id, user.id));
    const lang = (u?.appearance as { language?: string } | undefined)?.language;
    const locale = isLocale(lang) ? lang : 'ar';
    try {
      await deps.messages.send({
        to: phone,
        channel: input.channel,
        kind: 'code',
        text: createTranslator(locale).t('phone.messages.code', { code }),
        params: [code],
        lang: locale,
      });
      await deps.db.insert(messageLog).values({ userId: user.id, channel: input.channel, kind: 'code', status: 'sent' });
    } catch (err) {
      deps.log.warn({ err }, 'phone code failed');
      await deps.db.insert(messageLog).values({ userId: user.id, channel: input.channel, kind: 'code', status: 'failed' });
      await deps.db.delete(phoneCodes).where(eq(phoneCodes.userId, user.id));
      throw new AppError(502, 'message_failed');
    }
    return c.json(await settings(deps, user.id));
  })
  .post('/verify', async (c) => {
    const user = requireUser(c);
    requireParent(user);
    await checkRate(c, { bucket: 'phone-verify', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const { code } = await body(c, phoneVerifySchema);
    // Count the attempt first, so parallel guesses can't get more than MAX_ATTEMPTS tries.
    const [p] = await deps.db
      .update(phoneCodes)
      .set({ attempts: sql`${phoneCodes.attempts} + 1` })
      .where(and(eq(phoneCodes.userId, user.id), gt(phoneCodes.expiresAt, new Date())))
      .returning();
    if (!p) throw badRequest('code_expired');
    if (p.attempts > MAX_ATTEMPTS) {
      await deps.db.delete(phoneCodes).where(eq(phoneCodes.userId, user.id));
      throw badRequest('code_expired');
    }
    if (!safeEqual(p.codeHash, codeHash(deps, user.id, code))) throw badRequest('invalid_code');
    await deps.db.delete(phoneCodes).where(eq(phoneCodes.userId, user.id));
    await deps.db
      .update(users)
      .set({ phone: p.phone, phoneChannel: p.channel, phoneVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return c.json(await settings(deps, user.id));
  })
  .patch('/', async (c) => {
    const user = requireUser(c);
    requireParent(user);
    const deps = c.get('deps');
    const input = await body(c, phonePrefsSchema);
    const [u] = await deps.db.select({ prefs: users.phonePrefs }).from(users).where(eq(users.id, user.id));
    if (input.channel && !deps.messages.available[input.channel]) throw new AppError(503, 'channel_unavailable');
    await deps.db
      .update(users)
      .set({
        ...(input.channel ? { phoneChannel: input.channel } : {}),
        phonePrefs: {
          ...(u?.prefs ?? {}),
          ...(input.weekly !== undefined ? { weekly: input.weekly } : {}),
          ...(input.alerts !== undefined ? { alerts: input.alerts } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return c.json(await settings(deps, user.id));
  })
  .delete('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await deps.db.delete(phoneCodes).where(eq(phoneCodes.userId, user.id));
    await deps.db.update(users).set({ phone: null, phoneVerifiedAt: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    return c.json(await settings(deps, user.id));
  })
  /** Sends a short test message, so the parent knows it reaches them. */
  .post('/test', async (c) => {
    const user = requireUser(c);
    requireParent(user);
    await checkRate(c, { bucket: 'phone-test', limit: 3, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const ok = await messagePerson(deps, user.id, { kind: 'alert', key: 'test', vars: {} });
    if (!ok) throw badRequest('phone_not_ready');
    return c.json({ ok: true });
  });
