import { eq } from 'drizzle-orm';
import { notifications, users } from '../db/schema';
import type { Deps } from './context';
import { ch } from './realtime';

export type NotificationPrefKey = 'follows' | 'comments' | 'reactions' | 'messages' | 'groups' | 'school' | 'live' | 'system';

export interface NotifyInput {
  userId: string;
  type: string;
  /** Literal text for custom/admin notifications; typed notifications are localized by clients from `type` + `data`. */
  title?: string;
  body?: string;
  icon?: string;
  link?: string | null;
  actorId?: string | null;
  data?: Record<string, unknown>;
  pref?: NotificationPrefKey;
}

export async function notify(deps: Deps, input: NotifyInput | NotifyInput[]): Promise<void> {
  const list = (Array.isArray(input) ? input : [input]).filter((n) => n.userId !== n.actorId);
  if (!list.length) return;
  const recipients = [...new Set(list.map((n) => n.userId))];
  const prefs = new Map<string, Record<string, unknown>>();
  for (const id of recipients) {
    const [u] = await deps.db.select({ p: users.notificationPrefs }).from(users).where(eq(users.id, id));
    prefs.set(id, u?.p ?? {});
  }
  const allowed = list.filter((n) => !n.pref || prefs.get(n.userId)?.[n.pref] !== false);
  if (!allowed.length) return;
  const rows = await deps.db
    .insert(notifications)
    .values(
      allowed.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title ?? '',
        body: n.body ?? '',
        icon: n.icon ?? 'bell',
        link: n.link ?? null,
        actorId: n.actorId ?? null,
        data: n.data ?? {},
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId, type: notifications.type });
  await Promise.all(rows.map((r) => deps.realtime.publish(ch.user(r.userId), 'notification', { id: r.id, type: r.type })));
}
