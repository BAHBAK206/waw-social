import type { Attachment } from '@qubedu/shared';
import { and, eq, inArray } from 'drizzle-orm';
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

/**
 * Attachments a person adds to a message, announcement, material, assignment or submission. Files from our storage
 * keep their key (so private ones can be re-signed for readers) only when this person uploaded them: a copied private
 * link from someone else would otherwise be re-signed forever, past its expiry, for anyone who reads the item.
 */
export async function claimAttachments<T extends { url: string }>(
  deps: Deps,
  viewer: AuthUser,
  list: T[],
  /** Attachments already on the item being edited (a co-teacher may keep the original teacher's files). */
  existing: { key?: string }[] = [],
): Promise<(T & { key?: string })[]> {
  const keyed = list.map((a) => ({ a, key: KEY.exec(a.url)?.[1] ?? null }));
  const keys = keyed.map((k) => k.key).filter((k): k is string => !!k);
  const owned = new Set<string>(existing.map((e) => e.key).filter((k): k is string => !!k));
  if (keys.length) {
    const rows = await deps.db
      .select({ key: uploads.key })
      .from(uploads)
      .where(and(inArray(uploads.key, keys), eq(uploads.ownerId, viewer.id)));
    for (const r of rows) owned.add(r.key);
  }
  return keyed.map(({ a, key }) => {
    const url = a.url.split('?')[0]!;
    if (!key) return { ...a, url };
    if (owned.has(key)) return { ...a, url, key };
    if (key.startsWith('private/')) throw badRequest('invalid_media_url');
    return { ...a, url };
  });
}
