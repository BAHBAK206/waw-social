import { Hono } from 'hono';
import type { AppEnv } from '../lib/context';
import { notFound } from '../lib/errors';
import { isSafeKey } from '../lib/storage';
import { EXT_FOR_MIME } from '../lib/storage';

const MIME_FOR_EXT = Object.fromEntries(Object.entries(EXT_FOR_MIME).map(([mime, ext]) => [ext, mime]));
const INLINE = /^(image\/(jpeg|png|gif|webp)|audio\/|video\/|application\/pdf)/;

/** Serves objects of the local storage driver. Private objects need a valid signature. */
export const fileRoutes = new Hono<AppEnv>().get('/*', async (c) => {
  const { storage } = c.get('deps');
  const key = c.req.path.replace(/^\/files\//, '');
  if (!isSafeKey(key) || storage.driver !== 'local') throw notFound();
  if (!storage.verifySignature(key, c.req.query('exp'), c.req.query('sig'))) throw notFound();
  const obj = await storage.get(key);
  if (!obj) throw notFound();
  const ext = key.split('.').pop() ?? '';
  const mime = ext === 'webm' ? (c.req.query('kind') === 'audio' ? 'audio/webm' : 'video/webm') : (MIME_FOR_EXT[ext] ?? 'application/octet-stream');
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Content-Length': String(obj.size),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': key.startsWith('public/') ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
  };
  if (!INLINE.test(mime)) headers['Content-Disposition'] = 'attachment';
  return new Response(Buffer.from(obj.data), { status: 200, headers });
});
