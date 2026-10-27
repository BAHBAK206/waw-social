import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { AppEnv } from '../lib/context';
import { notFound } from '../lib/errors';
import { EXT_FOR_MIME, isSafeKey } from '../lib/storage';

const MIME_FOR_EXT = Object.fromEntries(Object.entries(EXT_FOR_MIME).map(([mime, ext]) => [ext, mime]));
const INLINE = /^(image\/(jpeg|png|gif|webp)|audio\/|video\/|application\/pdf)/;

/** Parses a single "bytes=a-b" range; returns null when absent, 'invalid' when unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

/** Serves objects of the local storage driver (with HTTP Range for video seeking). Private objects need a valid signature. */
export const fileRoutes = new Hono<AppEnv>().on(['GET', 'HEAD'], '/*', async (c) => {
  const { storage } = c.get('deps');
  const key = c.req.path.replace(/^\/files\//, '');
  if (!isSafeKey(key) || storage.driver !== 'local' || !storage.size || !storage.stream) throw notFound();
  if (!storage.verifySignature(key, c.req.query('exp'), c.req.query('sig'))) throw notFound();
  const size = await storage.size(key);
  if (size === null) throw notFound();
  const ext = key.split('.').pop() ?? '';
  const mime = ext === 'webm' ? (c.req.query('kind') === 'audio' ? 'audio/webm' : 'video/webm') : (MIME_FOR_EXT[ext] ?? 'application/octet-stream');
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': key.startsWith('public/') ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
  };
  if (!INLINE.test(mime)) headers['Content-Disposition'] = 'attachment';

  const range = parseRange(c.req.header('range'), size);
  if (range === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  const status = range ? 206 : 200;
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  if (c.req.method === 'HEAD' || size === 0) return new Response(null, { status, headers });
  const body = Readable.toWeb(storage.stream(key, start, end)) as unknown as ReadableStream;
  return new Response(body, { status, headers });
});
