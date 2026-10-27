import { Hono } from 'hono';
import { ALLOWED_UPLOAD_MIME, IMAGE_MIME, LIMITS, type UploadResultDto } from '@qubedu/shared';
import { uploads } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { AppError, badRequest, forbidden } from '../lib/errors';
import { requireUser } from '../lib/http';
import { getSettings } from '../lib/settings';
import { EXT_FOR_MIME, sniffMime } from '../lib/storage';
import { checkRate } from '../middleware';

const PURPOSES = ['avatar', 'cover', 'post', 'chat', 'group', 'library', 'course', 'assignment', 'form', 'live', 'workspace', 'general'] as const;
const PRIVATE_PURPOSES = new Set(['chat', 'assignment']);

function kindOf(mime: string): UploadResultDto['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export const uploadRoutes = new Hono<AppEnv>().post('/', async (c) => {
  const user = requireUser(c);
  await checkRate(c, { bucket: 'upload', limit: 60, windowSec: 600, by: 'user' });
  const deps = c.get('deps');
  const settings = await getSettings(deps.db, deps.env.AI_DAILY_QUOTA);
  if (!settings.uploads.enabled) throw forbidden('uploads_disabled');
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > LIMITS.uploadBytes + 64 * 1024) throw new AppError(413, 'file_too_large');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw badRequest('file_required');
  const purposeRaw = String(form?.get('purpose') ?? 'general');
  const purpose = (PURPOSES as readonly string[]).includes(purposeRaw) ? purposeRaw : 'general';
  if (file.size === 0) throw badRequest('empty_file');
  const imageOnly = purpose === 'avatar' || purpose === 'cover' || purpose === 'post';
  const max = imageOnly ? LIMITS.imageBytes : LIMITS.uploadBytes;
  if (file.size > max) throw new AppError(413, 'file_too_large');
  const declared = (file.type || 'application/octet-stream').toLowerCase().split(';')[0]!.trim();
  const data = new Uint8Array(await file.arrayBuffer());
  const real = sniffMime(data, declared);
  if (!real || !ALLOWED_UPLOAD_MIME.includes(real)) throw badRequest('unsupported_file_type');
  if (imageOnly && !(IMAGE_MIME as readonly string[]).includes(real)) throw badRequest('image_required');
  const visibility = PRIVATE_PURPOSES.has(purpose) ? 'private' : 'public';
  const stored = await deps.storage.put(data, { mime: real, ext: EXT_FOR_MIME[real] ?? 'bin', visibility });
  const name = (file.name || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
  await deps.db.insert(uploads).values({ ownerId: user.id, key: stored.key, mime: real, size: file.size, name, visibility, purpose });
  const result: UploadResultDto = { url: stored.url, key: stored.key, mime: real, size: file.size, name, kind: kindOf(real) };
  return c.json(result, 201);
});
