import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
export const hashPassword = (pw: string) => hash(pw, ARGON);
export async function verifyPassword(hashValue: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashValue, pw);
  } catch {
    return false;
  }
}

export interface AccessClaims {
  sub: string;
  sid: string;
  role: string;
  name: string;
  tv: number;
}

export async function signAccessToken(secret: string, claims: AccessClaims, ttlSec: number): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + ttlSec * 1000;
  const token = await new SignJWT({ sid: claims.sid, role: claims.role, name: claims.name, tv: claims.tv, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('qubedu')
    .setAudience('qubedu')
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}

export async function verifyAccessToken(secret: string, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'qubedu', audience: 'qubedu', algorithms: ['HS256'] });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, sid: String(payload.sid), role: String(payload.role), name: String(payload.name ?? ''), tv: Number(payload.tv ?? 0) };
  } catch {
    return null;
  }
}
