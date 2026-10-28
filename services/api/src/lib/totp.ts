import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { safeEqual, sha256 } from './crypto';

/** Time-based one-time codes (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), as used by authenticator apps. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, at = Date.now(), step = 30): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1]! & 15;
  const bin = ((h[offset]! & 127) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Accepts the current code and the ones just before/after (clock drift). */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((w) => safeEqual(totpCode(secret, at + w * 30_000), c));
}

export const otpauthUri = (secret: string, account: string, issuer = 'Qubedu') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** The secret is stored encrypted (AES-256-GCM) with a key derived from the server secret. */
const keyOf = (serverSecret: string) => createHash('sha256').update(`${serverSecret}:totp`).digest();

export function sealSecret(secret: string, serverSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(serverSecret), iv);
  const enc = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function openSecret(sealed: string, serverSecret: string): string {
  const [iv, tag, enc] = sealed.split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', keyOf(serverSecret), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString('utf8');
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** Ten single-use recovery codes (shown once; only their hashes are kept). */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 10 }, () => {
    const part = () => Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
    return `${part()}-${part()}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}
export const recoveryHash = (code: string) => sha256(code.trim().toLowerCase());
