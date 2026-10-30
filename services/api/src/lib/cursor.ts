import { badRequest } from './errors';

export interface Cursor {
  t: number;
  id: string;
}

export function encodeCursor(t: Date | number, id: string): string {
  const ms = typeof t === 'number' ? t : t.getTime();
  return Buffer.from(`${ms}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined | null): Cursor | null {
  if (!cursor) return null;
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const [t, id] = raw.split('|');
  const ms = Number(t);
  if (!Number.isFinite(ms) || !id || !/^[0-9a-f-]{36}$/i.test(id)) throw badRequest('invalid_cursor');
  return { t: ms, id };
}

/** Splits limit+1 rows into a page and computes nextCursor. */
export function pageOf<T>(rows: T[], limit: number, key: (row: T) => { t: Date; id: string }): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? encodeCursor(key(last).t, key(last).id) : null;
  return { items, nextCursor };
}
