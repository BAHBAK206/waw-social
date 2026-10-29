import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  changePasswordSchema,
  consentDecisionSchema,
  isValidTimeZone,
  loginSchema,
  normalizeSearch,
  refreshSchema,
  registerSchema,
  requestResetSchema,
  resetPasswordSchema,
  twoFactorLoginSchema,
  verifyEmailSchema,
  type AuthResult,
  ageTier,
} from '@qubedu/shared';
import { emailTokens, sessions, users } from '../db/schema';
import { recordReferral } from '../lib/growth';
import { openSecret, recoveryHash, verifyTotp } from '../lib/totp';
import { createLink, inviteGuardian } from './family';
import type { AppEnv, Deps } from '../lib/context';
import { hashPassword, randomToken, sha256, signAccessToken, verifyPassword } from '../lib/crypto';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors';
import { body, clientIp, param, requireUser, type Ctx } from '../lib/http';
import { emailTemplate } from '../lib/mailer';
import { buildMe } from '../lib/profile';
import { getSettings } from '../lib/settings';
import { checkRate } from '../middleware';

export const REFRESH_COOKIE = 'qb_rt';
const ROTATION_GRACE_MS = 60_000;
let dummyHash: Promise<string> | null = null;
const HANDOFF_TTL_SEC = 60;
const handoffRedeemSchema = z.object({ code: z.string().min(16).max(200) });
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(16)));

const isMobile = (c: Ctx) => c.req.header('x-client') === 'mobile';

function cookieOptions(deps: Deps) {
  return {
    httpOnly: true,
    secure: deps.env.APP_URL.startsWith('https://'),
    sameSite: 'Lax' as const,
    path: '/api/v1/auth',
    maxAge: deps.env.REFRESH_TOKEN_TTL_DAYS * 86400,
  };
}

async function issueSession(c: Ctx, userId: string): Promise<AuthResult> {
  const deps = c.get('deps');
  const raw = randomToken(32);
  const [session] = await deps.db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(raw),
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
      ip: clientIp(c, deps.env.TRUST_PROXY, deps.env.TRUST_PROXY_HOPS),
      client: isMobile(c) ? 'mobile' : 'web',
      expiresAt: new Date(Date.now() + deps.env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
    })
    .returning({ id: sessions.id });
  return finishAuth(c, userId, session!.id, raw);
}

async function finishAuth(c: Ctx, userId: string, sessionId: string, rawRefresh: string): Promise<AuthResult> {
  const deps = c.get('deps');
  const [u] = await deps.db.select({ role: users.role, name: users.displayName, tv: users.tokenVersion }).from(users).where(eq(users.id, userId));
  if (!u) throw unauthorized();
  const access = await signAccessToken(
    deps.env.JWT_SECRET,
    { sub: userId, sid: sessionId, role: u.role, name: u.name, tv: u.tv },
    deps.env.ACCESS_TOKEN_TTL_SEC,
  );
  const me = await buildMe(deps, userId);
  if (isMobile(c)) return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken: rawRefresh, user: me };
  setCookie(c, REFRESH_COOKIE, rawRefresh, cookieOptions(deps));
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt, user: me };
}

export async function sendEmailToken(deps: Deps, user: { id: string; email: string; language: string }, kind: 'verify' | 'reset') {
  const raw = randomToken(32);
  await deps.db.insert(emailTokens).values({
    userId: user.id,
    kind,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + (kind === 'verify' ? 3 * 86400_000 : 3600_000)),
  });
  const ar = user.language === 'ar';
  const url = `${deps.env.APP_URL.replace(/\/$/, '')}/${kind === 'verify' ? 'verify-email' : 'reset-password'}?token=${raw}`;
  const t =
    kind === 'verify'
      ? ar
        ? emailTemplate('تأكيد بريدك الإلكتروني', 'مرحبًا بك في Qubedu! اضغط الزر لتأكيد بريدك.', 'تأكيد البريد', url, 'rtl')
        : emailTemplate('Confirm your email', 'Welcome to Qubedu! Press the button to confirm your email.', 'Confirm email', url, 'ltr')
      : ar
        ? emailTemplate('إعادة تعيين كلمة المرور', 'طلبت إعادة تعيين كلمة المرور. الرابط صالح لمدة ساعة.', 'تعيين كلمة مرور جديدة', url, 'rtl')
        : emailTemplate('Reset your password', 'You asked to reset your password. The link is valid for one hour.', 'Set a new password', url, 'ltr');
  await deps.mailer.send({
    to: user.email,
    subject:
      kind === 'verify' ? (ar ? 'تأكيد البريد — Qubedu' : 'Confirm your email — Qubedu') : ar ? 'إعادة تعيين كلمة المرور — Qubedu' : 'Reset password — Qubedu',
    ...t,
  });
  return raw;
}

async function consumeEmailToken(deps: Deps, raw: string, kind: 'verify' | 'reset' | 'consent') {
  const [row] = await deps.db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.tokenHash, sha256(raw)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .returning({ userId: emailTokens.userId });
  if (!row) throw badRequest('invalid_or_expired_token');
  return row.userId;
}

/** Asks a parent to approve an under-13 account (link valid 14 days). */
export async function sendConsentEmail(deps: Deps, child: { id: string; displayName: string }, parentEmail: string, language: string) {
  const raw = randomToken(32);
  await deps.db.insert(emailTokens).values({ userId: child.id, kind: 'consent', tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 14 * 86400_000) });
  const url = `${deps.env.APP_URL.replace(/\/$/, '')}/consent?token=${raw}`;
  const ar = language === 'ar';
  const t = ar
    ? emailTemplate(
        `موافقة على حساب ${child.displayName}`,
        `أنشأ ${child.displayName} حسابًا على Qubedu، منصة تعليمية للمدارس. لأن عمره أقل من 13 سنة، نحتاج موافقتك قبل تفعيل الرسائل والذكاء الاصطناعي. يمكنك أيضًا الرفض لحذف الحساب.`,
        'مراجعة الطلب',
        url,
        'rtl',
      )
    : emailTemplate(
        `Approve ${child.displayName}'s account`,
        `${child.displayName} created an account on Qubedu, a learning platform for schools. Because they are under 13, we need your approval before messages and the AI are turned on. You can also decline to delete the account.`,
        'Review the request',
        url,
        'ltr',
      );
  await deps.mailer.send({ to: parentEmail, subject: ar ? `موافقة ولي الأمر — Qubedu` : `Parent approval — Qubedu`, ...t });
}

export const authRoutes = new Hono<AppEnv>()
  .post('/register', async (c) => {
    await checkRate(c, { bucket: 'register', limit: 8, windowSec: 3600 });
    const deps = c.get('deps');
    const input = await body(c, registerSchema);
    const settings = await getSettings(deps.db, deps.env.AI_DAILY_QUOTA);
    if (!settings.registrationOpen) throw forbidden('registration_closed');
    const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw new AppError(409, 'email_taken');
    const isRoot = !!deps.env.ROOT_ADMIN_EMAIL && deps.env.ROOT_ADMIN_EMAIL.toLowerCase() === input.email;
    // Teacher and parent accounts are for adults.
    if (input.accountType !== 'student' && ageTier({ birthYear: input.birthYear }) !== 'adult') throw badRequest('adult_account_required');
    // Under 13: a parent must approve the account.
    const child = input.accountType === 'student' && ageTier({ birthYear: input.birthYear, gradeLevel: input.gradeLevel, accountType: 'student' }) === 'child';
    if (child && (!input.parentEmail || input.parentEmail === input.email)) throw badRequest('parent_email_required');
    const language = input.language ?? 'ar';
    const [user] = await deps.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        searchName: normalizeSearch(input.displayName),
        accountType: input.accountType,
        birthYear: input.birthYear ?? null,
        gradeLevel: input.accountType === 'student' ? (input.gradeLevel ?? null) : null,
        role: isRoot ? 'root' : 'user',
        timezone: input.timezone && isValidTimeZone(input.timezone) ? input.timezone : 'UTC',
        appearance: { language },
        consentAt: child ? null : new Date(),
        consentEmail: child ? input.parentEmail : null,
      })
      .returning({ id: users.id });
    await sendEmailToken(deps, { id: user!.id, email: input.email, language }, 'verify');
    if (input.referralCode) await recordReferral(deps, user!.id, input.referralCode).catch((err) => deps.log.warn({ err }, 'referral failed'));
    if (child) await sendConsentEmail(deps, { id: user!.id, displayName: input.displayName }, input.parentEmail!, language);
    if (input.parentEmail && input.accountType === 'student' && input.parentEmail !== input.email)
      await inviteGuardian(deps, { id: user!.id, displayName: input.displayName }, input.parentEmail).catch((err) =>
        deps.log.warn({ err }, 'guardian invite failed'),
      );
    return c.json(await issueSession(c, user!.id), 201);
  })
  .post('/login', async (c) => {
    await checkRate(c, { bucket: 'login', limit: 20, windowSec: 900 });
    const deps = c.get('deps');
    const input = await body(c, loginSchema);
    await checkRate(c, { bucket: `login:${sha256(input.email).slice(0, 16)}`, limit: 10, windowSec: 900 });
    const [user] = await deps.db
      .select({ id: users.id, hash: users.passwordHash, deletedAt: users.deletedAt, totp: users.totpEnabledAt })
      .from(users)
      .where(eq(users.email, input.email));
    // Always run a hash verification to keep timing similar for unknown emails.
    const ok = await verifyPassword(user?.hash ?? (await getDummyHash()), input.password);
    if (!user || !user.hash || !ok || user.deletedAt) throw unauthorized('invalid_credentials');
    if (user.totp) {
      // Second step: a short-lived ticket that only an authenticator code (or a recovery code) can turn into a session.
      const ticket = randomToken(24);
      await deps.kv.set(`2fa:${sha256(ticket)}`, user.id, 300);
      return c.json({ twoFactorRequired: true, ticket });
    }
    return c.json(await issueSession(c, user.id));
  })
  .post('/login/2fa', async (c) => {
    await checkRate(c, { bucket: 'login-2fa', limit: 20, windowSec: 900 });
    const deps = c.get('deps');
    const input = await body(c, twoFactorLoginSchema);
    const key = `2fa:${sha256(input.ticket)}`;
    const userId = await deps.kv.get(key);
    if (!userId) throw unauthorized('two_factor_expired');
    const { count: tries } = await deps.kv.incr(`${key}:tries`, 300);
    if (tries > 5) {
      await deps.kv.del(key);
      throw unauthorized('two_factor_expired');
    }
    const [u] = await deps.db.select({ secret: users.totpSecret, recovery: users.totpRecovery }).from(users).where(eq(users.id, userId));
    if (!u?.secret) throw unauthorized('two_factor_expired');
    let ok = verifyTotp(openSecret(u.secret, deps.env.JWT_SECRET), input.code);
    if (!ok) {
      // A recovery code works once.
      const h = recoveryHash(input.code);
      if (u.recovery.includes(h)) {
        await deps.db
          .update(users)
          .set({ totpRecovery: u.recovery.filter((x) => x !== h) })
          .where(eq(users.id, userId));
        ok = true;
      }
    }
    if (!ok) throw unauthorized('invalid_code');
    await deps.kv.del(key);
    return c.json(await issueSession(c, userId));
  })
  /** The parent's view of a child's account request (no sign-in needed: the emailed link is the key). */
  .get('/consent', async (c) => {
    const deps = c.get('deps');
    const raw = c.req.query('token') ?? '';
    const [row] = await deps.db
      .select({ name: users.displayName, grade: users.gradeLevel, consentAt: users.consentAt })
      .from(emailTokens)
      .innerJoin(users, eq(users.id, emailTokens.userId))
      .where(and(eq(emailTokens.tokenHash, sha256(raw)), eq(emailTokens.kind, 'consent'), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())));
    if (!row) throw badRequest('invalid_or_expired_token');
    return c.json({ childName: row.name, gradeLevel: row.grade, approved: !!row.consentAt });
  })
  .post('/consent', async (c) => {
    await checkRate(c, { bucket: 'consent', limit: 20, windowSec: 3600 });
    const deps = c.get('deps');
    const { token, approve } = await body(c, consentDecisionSchema);
    const childId = await consumeEmailToken(deps, token, 'consent');
    if (approve) {
      await deps.db.update(users).set({ consentAt: new Date(), updatedAt: new Date() }).where(eq(users.id, childId));
      // A signed-in parent account approving also becomes the child's parent on Qubedu.
      const viewer = c.get('user');
      if (viewer?.accountType === 'parent') await createLink(deps, { id: viewer.id, displayName: viewer.displayName }, childId).catch(() => undefined);
    } else {
      // Declined: the account is closed and signed out everywhere.
      await deps.db
        .update(users)
        .set({ deletedAt: new Date(), tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
        .where(eq(users.id, childId));
      await deps.db.delete(sessions).where(eq(sessions.userId, childId));
    }
    return c.json({ ok: true });
  })
  /**
   * One-time sign-in handoff: the mobile app opens a web-only tool (workspace editors, live room, admin) in an
   * in-app browser already signed in. The code lives 60 s, works once and only carries the user id.
   */
  .post('/handoff', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'handoff', limit: 30, windowSec: 600, by: 'user' });
    const code = randomToken(24);
    await c.get('deps').kv.set(`handoff:${sha256(code)}`, user.id, HANDOFF_TTL_SEC);
    return c.json({ code, expiresAt: Date.now() + HANDOFF_TTL_SEC * 1000 });
  })
  .post('/handoff/redeem', async (c) => {
    await checkRate(c, { bucket: 'handoff-redeem', limit: 30, windowSec: 600 });
    const deps = c.get('deps');
    const { code } = await body(c, handoffRedeemSchema);
    const key = `handoff:${sha256(code)}`;
    const userId = await deps.kv.get(key);
    await deps.kv.del(key);
    if (!userId) throw unauthorized('handoff_invalid');
    const [u] = await deps.db.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId));
    if (!u || u.deletedAt) throw unauthorized('handoff_invalid');
    return c.json(await issueSession(c, userId));
  })
  .post('/refresh', async (c) => {
    await checkRate(c, { bucket: 'refresh', limit: 60, windowSec: 300 });
    const deps = c.get('deps');
    let raw: string | undefined;
    if (isMobile(c)) {
      raw = (await body(c, refreshSchema)).refreshToken;
    } else {
      // Cookie-based refresh requires a custom header: cross-site forms cannot set it (CSRF guard).
      if (c.req.header('x-requested-with') !== 'qubedu') throw forbidden('csrf');
      raw = getCookie(c, REFRESH_COOKIE);
    }
    if (!raw) throw unauthorized('no_refresh_token');
    const hashed = sha256(raw);
    const [session] = await deps.db
      .select()
      .from(sessions)
      .where(or(eq(sessions.tokenHash, hashed), eq(sessions.previousTokenHash, hashed)));
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      if (!isMobile(c)) deleteCookie(c, REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw unauthorized('session_expired');
    }
    if (session.previousTokenHash === hashed && session.tokenHash !== hashed) {
      const withinGrace = session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!withinGrace) {
        await deps.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
        throw unauthorized('refresh_reused');
      }
    }
    const next = randomToken(32);
    await deps.db
      .update(sessions)
      .set({
        previousTokenHash: session.tokenHash,
        tokenHash: sha256(next),
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + deps.env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
      })
      .where(eq(sessions.id, session.id));
    return c.json(await finishAuth(c, session.userId, session.id, next));
  })
  .post('/logout', async (c) => {
    const deps = c.get('deps');
    const user = c.get('user');
    let raw: string | undefined;
    if (isMobile(c)) raw = (await c.req.json().catch(() => ({})))?.refreshToken;
    else raw = getCookie(c, REFRESH_COOKIE);
    if (raw)
      await deps.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, sha256(raw)));
    if (user) await deps.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, user.sessionId));
    deleteCookie(c, REFRESH_COOKIE, { path: '/api/v1/auth' });
    return c.json({ ok: true });
  })
  .post('/logout-all', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    deleteCookie(c, REFRESH_COOKIE, { path: '/api/v1/auth' });
    return c.json({ ok: true });
  })
  .get('/sessions', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt));
    return c.json({
      items: rows.map((s) => ({
        id: s.id,
        client: s.client,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.getTime(),
        lastUsedAt: s.lastUsedAt.getTime(),
        current: s.id === user.sessionId,
      })),
    });
  })
  .delete('/sessions/:id', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, param(c, 'id')), eq(sessions.userId, user.id)));
    return c.json({ ok: true });
  })
  .post('/verify-email', async (c) => {
    const deps = c.get('deps');
    const { token } = await body(c, verifyEmailSchema);
    const userId = await consumeEmailToken(deps, token, 'verify');
    await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    return c.json({ ok: true });
  })
  .post('/resend-verification', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'resend-verify', limit: 3, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const [u] = await deps.db.select().from(users).where(eq(users.id, user.id));
    if (!u || u.emailVerifiedAt) return c.json({ ok: true });
    await sendEmailToken(deps, { id: u.id, email: u.email, language: String((u.appearance as { language?: string }).language ?? 'ar') }, 'verify');
    return c.json({ ok: true });
  })
  .post('/request-reset', async (c) => {
    await checkRate(c, { bucket: 'reset', limit: 5, windowSec: 3600 });
    const deps = c.get('deps');
    const { email } = await body(c, requestResetSchema);
    const [u] = await deps.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    if (u) await sendEmailToken(deps, { id: u.id, email: u.email, language: String((u.appearance as { language?: string }).language ?? 'ar') }, 'reset');
    // Same response whether or not the account exists (no account enumeration).
    return c.json({ ok: true });
  })
  .post('/reset-password', async (c) => {
    await checkRate(c, { bucket: 'reset-confirm', limit: 10, windowSec: 3600 });
    const deps = c.get('deps');
    const { token, password } = await body(c, resetPasswordSchema);
    const userId = await consumeEmailToken(deps, token, 'reset');
    await deps.db.transaction(async (tx) => {
      const [u] = await tx.select({ tv: users.tokenVersion }).from(users).where(eq(users.id, userId));
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(password), tokenVersion: (u?.tv ?? 0) + 1, emailVerifiedAt: new Date() })
        .where(eq(users.id, userId));
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
    });
    return c.json({ ok: true });
  })
  .post('/change-password', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'change-password', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, changePasswordSchema);
    const [u] = await deps.db.select().from(users).where(eq(users.id, user.id));
    if (!u?.passwordHash || !(await verifyPassword(u.passwordHash, input.currentPassword))) throw badRequest('wrong_password');
    await deps.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword), tokenVersion: u.tokenVersion + 1 })
        .where(eq(users.id, user.id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, user.id)));
    });
    return c.json(await issueSession(c, user.id));
  });
