import { and, eq, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { isStaff } from '@qubedu/shared';
import { sessions, users } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { verifyAccessToken } from '../lib/crypto';
import { AppError, forbidden, tooMany } from '../lib/errors';
import { clientIp, type Ctx } from '../lib/http';
import { getSettings } from '../lib/settings';

export function injectDeps(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('deps', deps);
    c.set('user', null);
    c.set('requestId', crypto.randomUUID());
    await next();
  };
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cross-Origin-Resource-Policy', 'cross-origin');
  c.header('X-Request-Id', c.get('requestId'));
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

/** Resolves the bearer token to a user (or null). Banned and revoked tokens never authenticate. */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const { env, db } = c.get('deps');
    const claims = await verifyAccessToken(env.JWT_SECRET, header.slice(7));
    if (claims) {
      const [row] = await db
        .select({
          id: users.id,
          role: users.role,
          permissions: users.permissions,
          displayName: users.displayName,
          accountType: users.accountType,
          timezone: users.timezone,
          tokenVersion: users.tokenVersion,
          bannedAt: users.bannedAt,
          bannedUntil: users.bannedUntil,
          emailVerifiedAt: users.emailVerifiedAt,
          revokedAt: sessions.revokedAt,
        })
        .from(users)
        .innerJoin(sessions, eq(sessions.id, claims.sid))
        .where(and(eq(users.id, claims.sub), isNull(users.deletedAt), eq(sessions.userId, users.id)));
      if (row && row.tokenVersion === claims.tv && !row.revokedAt) {
        const banned = !!row.bannedAt && (!row.bannedUntil || row.bannedUntil.getTime() > Date.now());
        const path = c.req.path;
        const allowWhileBanned = path.endsWith('/me') || path.includes('/auth/') || path.endsWith('/config');
        if (banned && !allowWhileBanned) throw forbidden('account_banned');
        c.set('user', {
          id: row.id,
          role: row.role,
          permissions: row.permissions ?? [],
          displayName: row.displayName,
          accountType: row.accountType,
          timezone: row.timezone,
          sessionId: claims.sid,
          emailVerified: !!row.emailVerifiedAt,
        });
      }
    }
  }
  await next();
};

/** During maintenance only staff and auth/config/health endpoints are served. */
export const maintenanceGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if (path.includes('/auth/') || path.endsWith('/config') || path.endsWith('/health') || path.startsWith('/internal')) return next();
  const { db, env } = c.get('deps');
  const settings = await getSettings(db, env.AI_DAILY_QUOTA);
  if (settings.maintenance.enabled) {
    const user = c.get('user');
    if (!user || !isStaff(user.role)) throw new AppError(503, 'maintenance', settings.maintenance.message || 'maintenance');
  }
  return next();
};

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowSec: number;
  by?: 'ip' | 'user' | 'both';
}

export async function checkRate(c: Ctx, opts: RateLimitOptions): Promise<void> {
  const { kv, env } = c.get('deps');
  if (env.NODE_ENV === 'test' && c.req.header('x-test-ratelimit') !== 'on') return;
  const user = c.get('user');
  const ip = clientIp(c, env.TRUST_PROXY);
  const who = opts.by === 'user' ? (user?.id ?? ip) : opts.by === 'both' ? `${user?.id ?? '-'}:${ip}` : ip;
  const { count, ttl } = await kv.incr(`rl:${opts.bucket}:${who}`, opts.windowSec);
  if (count > opts.limit) throw tooMany(ttl);
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await checkRate(c, opts);
    await next();
  };
}
