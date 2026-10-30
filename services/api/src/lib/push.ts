import { createTranslator, isLocale } from '@qubedu/i18n';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import type { Db } from '../db/client';
import { pushDevices, siteSettings, users } from '../db/schema';
import type { Env } from '../env';
import type { Deps } from './context';

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open when tapped (e.g. /chat/123). */
  link: string | null;
  /** Same tag replaces the previous notification instead of stacking (one per conversation). */
  tag?: string;
}

export interface PushTarget {
  kind: 'expo' | 'web';
  token: string;
  keys?: { p256dh: string; auth: string } | null;
}

export interface PushSender {
  /** Sends to every target; returns the tokens the push service says are gone (uninstalled app, revoked permission). */
  send(targets: PushTarget[], msg: PushMessage): Promise<{ invalid: string[] }>;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let vapidCache: VapidKeys | null = null;

/** VAPID keys from the environment, or generated once and kept in the database so every instance signs the same way. */
export async function vapidKeys(db: Db, env: Env): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const subject = env.VAPID_SUBJECT ?? `mailto:${env.ROOT_ADMIN_EMAIL ?? 'admin@example.com'}`;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    vapidCache = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
    return vapidCache;
  }
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'vapid'));
  const stored = row?.value as { publicKey?: string; privateKey?: string } | undefined;
  if (stored?.publicKey && stored.privateKey) {
    vapidCache = { publicKey: stored.publicKey, privateKey: stored.privateKey, subject };
    return vapidCache;
  }
  const fresh = webpush.generateVAPIDKeys();
  await db.insert(siteSettings).values({ key: 'vapid', value: fresh }).onConflictDoNothing();
  // Another instance may have won the race: read back whatever is stored.
  const [again] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'vapid'));
  const v = again!.value as { publicKey: string; privateKey: string };
  vapidCache = { publicKey: v.publicKey, privateKey: v.privateKey, subject };
  return vapidCache;
}

export function createPushSender(env: Env, getVapid: () => Promise<VapidKeys>): PushSender {
  return {
    async send(targets, msg) {
      const invalid: string[] = [];
      const expo = targets.filter((t) => t.kind === 'expo');
      const web = targets.filter((t) => t.kind === 'web' && t.keys);
      if (expo.length) {
        // Expo accepts up to 100 messages per request.
        for (let i = 0; i < expo.length; i += 100) {
          const batch = expo.slice(i, i + 100);
          try {
            const res = await fetch(env.EXPO_PUSH_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(
                batch.map((t) => ({
                  to: t.token,
                  title: msg.title,
                  body: msg.body,
                  sound: 'default',
                  channelId: 'default',
                  data: { link: msg.link },
                  ...(msg.tag ? { collapseId: msg.tag, threadId: msg.tag } : {}),
                })),
              ),
              signal: AbortSignal.timeout(10_000),
            });
            const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
            json?.data?.forEach((r, k) => {
              if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') invalid.push(batch[k]!.token);
            });
          } catch {
            /* network hiccup: the notification is still in the app */
          }
        }
      }
      if (web.length) {
        const v = await getVapid();
        const payload = JSON.stringify({ title: msg.title, body: msg.body, link: msg.link, tag: msg.tag });
        await Promise.all(
          web.map(async (t) => {
            try {
              await webpush.sendNotification({ endpoint: t.token, keys: t.keys! }, payload, {
                vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey },
                TTL: 24 * 3600,
                timeout: 10_000,
              });
            } catch (err) {
              const code = (err as { statusCode?: number }).statusCode;
              if (code === 404 || code === 410) invalid.push(t.token);
            }
          }),
        );
      }
      return { invalid };
    },
  };
}

export interface PushNotice {
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  actorName: string | null;
  data: Record<string, unknown>;
}

const inflight = new Set<Promise<void>>();

/** Resolves when every push started so far has been handed to the push services (tests wait on this). */
export async function pushIdle() {
  while (inflight.size) await Promise.all([...inflight]);
}

/** Sends notifications to the recipients' phones and browsers, each in the person's own language. Never throws. */
export function deliverPush(deps: Deps, list: PushNotice[]) {
  if (!deps.push || !list.length) return;
  const job = (async () => {
    const ids = [...new Set(list.map((n) => n.userId))];
    const [devices, people] = await Promise.all([
      deps.db.select().from(pushDevices).where(inArray(pushDevices.userId, ids)),
      deps.db.select({ id: users.id, appearance: users.appearance, prefs: users.notificationPrefs }).from(users).where(inArray(users.id, ids)),
    ]);
    if (!devices.length) return;
    const byUser = new Map(people.map((p) => [p.id, p]));
    const invalid: string[] = [];
    for (const n of list) {
      const person = byUser.get(n.userId);
      if ((person?.prefs as { push?: boolean } | undefined)?.push === false) continue;
      const targets = devices.filter((d) => d.userId === n.userId);
      if (!targets.length) continue;
      const lang = (person?.appearance as { language?: string } | undefined)?.language;
      const tr = createTranslator(isLocale(lang) ? lang : 'ar');
      const vars: Record<string, string | number> = { name: n.actorName ?? '' };
      for (const [k, v] of Object.entries(n.data)) if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
      const text = n.type === 'broadcast' ? n.title : tr.tDyn(`notifications.types.${n.type}`, vars, n.title || n.body);
      const msg: PushMessage = {
        title: n.type === 'broadcast' ? n.title : 'Qubedu',
        body: (n.type === 'broadcast' ? n.body : text).slice(0, 240),
        link: n.link,
        tag: n.type === 'message' && n.link ? n.link : undefined,
      };
      const r = await deps.push!.send(
        targets.map((d) => ({ kind: d.kind, token: d.token, keys: d.keys })),
        msg,
      );
      invalid.push(...r.invalid);
    }
    if (invalid.length) await deps.db.delete(pushDevices).where(inArray(pushDevices.token, invalid));
    await deps.db
      .update(pushDevices)
      .set({ lastUsedAt: new Date() })
      .where(and(inArray(pushDevices.userId, ids)));
  })()
    .catch((err) => deps.log.warn({ err }, 'push delivery failed'))
    .finally(() => inflight.delete(job));
  inflight.add(job);
}
