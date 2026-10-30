import { and, isNull, lte, sql } from 'drizzle-orm';
import { savedItems } from '../db/schema';
import type { Deps } from './context';
import { notify } from './notify';

/** Where a saved item opens inside the app (web paths; the app maps them to its own screens). */
export function savedLink(i: { itemType: string; refId: string | null }): string {
  const base: Record<string, string> = {
    post: '/post/',
    quiz: '/quiz/',
    library: '/library?item=',
    group: '/groups/',
    user: '/u/',
    form: '/forms/',
    course: '/school/',
  };
  return i.refId && base[i.itemType] ? `${base[i.itemType]}${i.refId}` : '/saved';
}

/** Sends the reminders that are due (each exactly once, even with several API instances running). */
export async function sendDueSavedReminders(deps: Deps, limit = 200): Promise<number> {
  const due = await deps.db
    .update(savedItems)
    .set({ remindedAt: new Date() })
    .where(
      and(
        sql`${savedItems.id} in (select id from saved_items where remind_at <= now() and reminded_at is null order by remind_at limit ${limit} for update skip locked)`,
        isNull(savedItems.remindedAt),
        lte(savedItems.remindAt, new Date()),
      ),
    )
    .returning();
  if (!due.length) return 0;
  await notify(
    deps,
    due.map((i) => ({
      userId: i.ownerId,
      type: 'saved_reminder',
      icon: 'bookmark',
      link: savedLink(i),
      data: { title: i.title, note: i.note.slice(0, 120) },
      pref: 'system' as const,
    })),
  );
  return due.length;
}

export function startSavedReminders(deps: Deps): () => void {
  const tick = () => void sendDueSavedReminders(deps).catch((err) => deps.log.warn({ err }, 'saved reminders failed'));
  const timer = setInterval(tick, 60_000);
  setTimeout(tick, 20_000);
  return () => clearInterval(timer);
}

export const REMINDER_MAX_MS = 366 * 86_400_000;
