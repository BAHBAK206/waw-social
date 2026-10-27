import type { Context } from 'hono';
import type { z } from 'zod';
import { hasPermission, type AdminPermission } from '@qubedu/shared';
import type { AppEnv, AuthUser } from './context';
import { badRequest, forbidden, unauthorized } from './errors';

export type Ctx = Context<AppEnv>;

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('invalid_json');
  }
  return schema.parse(raw);
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

export function clientIp(c: Ctx, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd) return fwd;
    const real = c.req.header('x-real-ip');
    if (real) return real;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}
