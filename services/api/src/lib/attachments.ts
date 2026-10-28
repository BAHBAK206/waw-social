import type { Attachment } from '@qubedu/shared';
import { eq } from 'drizzle-orm';
import { uploads } from '../db/schema';
import type { AuthUser, Deps } from './context';
import { badRequest } from './errors';

export type StoredAttachment = Attachment & { key?: string };

const KEY = /\/files\/((?:public|private)\/[^?#]+)/;

/**
 * Accepts only a file the user uploaded through our endpoint, of the expected type.
 * Returns it with its storage key so private files can be re-signed when read.
 */
export async function ownAttachment(deps: Deps, viewer: AuthUser, a: Attachment, mimePrefix: string): Promise<StoredAttachment> {
  const m = KEY.exec(a.url);
  if (!m) throw badRequest('invalid_media_url');
  const [row] = await deps.db.select({ ownerId: uploads.ownerId, mime: uploads.mime }).from(uploads).where(eq(uploads.key, m[1]!));
  if (!row || row.ownerId !== viewer.id || !row.mime.startsWith(mimePrefix)) throw badRequest('invalid_media_url');
  return { ...a, mime: row.mime, url: a.url.split('?')[0]!, key: m[1] };
}

/** Re-signs a stored private attachment's URL for the reader. */
export async function readableAttachment(deps: Deps, a: StoredAttachment | null | undefined): Promise<Attachment | null> {
  if (!a) return null;
  const { key, ...rest } = a;
  return key?.startsWith('private/') ? { ...rest, url: await deps.storage.urlFor(key) } : rest;
}
