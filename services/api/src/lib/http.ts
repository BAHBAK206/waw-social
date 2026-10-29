import type { Context } from 'hono';
import type { z } from 'zod';
import { hasPermission, moderateBody, type AdminPermission } from '@qubedu/shared';
import type { AppEnv, AuthUser } from './context';
import { AppError, badRequest, forbidden, unauthorized } from './errors';
import { getSettings } from './settings';

export type Ctx = Context<AppEnv>;

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('invalid_json');
  }
  const parsed = schema.parse(raw) as z.infer<T>;
  return screen(c, parsed);
}

/**
 * Every published text goes through the automatic filter: insults are masked, threats / self-harm encouragement /
 * solicitation are rejected. Admin console writes are exempt so moderators can quote what they act on, and so is the
 * anonymous complaint box: a child reporting a threat has to be able to repeat the threat.
 */
async function screen<V>(c: Ctx, value: V): Promise<V> {
  if (
    c.req.path.includes('/admin/') ||
    c.req.path.includes('/wellbeing/complaints') ||
    c.req.path.includes('/internal/') ||
    c.req.path.endsWith('/client-errors')
  )
    return value;
  const deps = c.get('deps');
  if (!deps) return value;
  const settings = await getSettings(deps.db, deps.env.AI_DAILY_QUOTA);
  if (!settings.moderation.enabled) return value;
  const r = moderateBody(value, { mask: settings.moderation.mask, block: settings.moderation.block });
  if (r.blocked) throw new AppError(422, 'content_blocked');
  return r.value;
}

export function query<T extends z.ZodType>(c: Ctx, schema: T): z.infer<T> {
  return schema.parse(c.req.query());
}

export function param(c: Ctx, name: string): string {
  const v = c.req.param(name);
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw badRequest(`invalid_${name}`);
  return v.toLowerCase();
}

export function requireUser(c: Ctx): AuthUser {
  const user = c.get('user');
  if (!user) throw unauthorized();
  return user;
}

export function requirePerm(c: Ctx, perm: AdminPermission): AuthUser {
  const user = requireUser(c);
  if (!hasPermission(user.role, user.permissions, perm)) throw forbidden('missing_permission');
  return user;
}

export function isStaffUser(user: AuthUser | null, perm: AdminPermission): boolean {
  return !!user && hasPermission(user.role, user.permissions, perm);
}

/**
 * The caller's address. Behind trusted proxies, X-Forwarded-For is read from the right: each proxy appends the address it
 * saw, so the leftmost entries are whatever the client sent and must never be trusted (they would let anyone dodge rate limits).
 */
export function clientIp(c: Ctx, trustProxy: boolean, hops = 1): string {
  if (trustProxy) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length) return chain[Math.max(0, chain.length - hops)]!;
    const real = c.req.header('x-real-ip');
    if (real) return real;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}
