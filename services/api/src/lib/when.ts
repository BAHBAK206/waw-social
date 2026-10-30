import { isLocale } from '@qubedu/i18n';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import type { Deps } from './context';

/** A date and time as one person reads it: their language and their time zone. */
export async function whenFor(deps: Deps, userId: string, at: Date): Promise<string> {
  const [u] = await deps.db.select({ tz: users.timezone, appearance: users.appearance }).from(users).where(eq(users.id, userId));
  const l = (u?.appearance as { language?: string } | undefined)?.language;
  try {
    return new Intl.DateTimeFormat(isLocale(l) ? l : 'ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: u?.tz || 'UTC' }).format(at);
  } catch {
    return at.toISOString().slice(0, 16).replace('T', ' ');
  }
}
