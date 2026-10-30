import { and, inArray } from 'drizzle-orm';
import { blocks, notifications, users } from '../db/schema';
import type { Deps } from './context';
import { focusingNow } from './focus';
import { deliverPush } from './push';
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
  for (const u of await deps.db.select({ id: users.id, p: users.notificationPrefs }).from(users).where(inArray(users.id, recipients)))
    prefs.set(u.id, u.p ?? {});
  // Nothing reaches a person from someone they blocked.
  const actors = [...new Set(list.map((n) => n.actorId).filter((x): x is string => !!x))];
  const blocked = new Set(
    actors.length
      ? (
          await deps.db
            .select({ by: blocks.blockerId, who: blocks.blockedId })
            .from(blocks)
            .where(and(inArray(blocks.blockerId, recipients), inArray(blocks.blockedId, actors)))
        ).map((b) => `${b.by}:${b.who}`)
      : [],
  );
  const allowed = list.filter((n) => (!n.pref || prefs.get(n.userId)?.[n.pref] !== false) && !(n.actorId && blocked.has(`${n.userId}:${n.actorId}`)));
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
  const actorIds = [...new Set(allowed.map((n) => n.actorId).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    for (const a of await deps.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, actorIds))) names.set(a.id, a.name);
  }
  // Someone in a focus session still gets the notification in the app, but no push interrupts them.
  const focusing = await focusingNow(deps, recipients).catch(() => new Set<string>());
  deliverPush(
    deps,
    allowed
      .filter((n) => !focusing.has(n.userId))
      .map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title ?? '',
        body: n.body ?? '',
        link: n.link ?? null,
        actorName: n.actorId ? (names.get(n.actorId) ?? null) : null,
        data: n.data ?? {},
      })),
  );
}
