import { createTranslator, isLocale } from '@qubedu/i18n';
import { and, eq, gt, sql } from 'drizzle-orm';
import { guardianLinks, messageLog, users } from '../db/schema';
import type { Deps } from './context';
import type { MessageKind } from './messaging';
import { notify } from './notify';

/** At most this many alerts per parent per day (cost, and no one wants a buzzing phone). */
export const DAILY_ALERTS = 5;

export interface PhoneMessage {
  kind: MessageKind;
  /** Key under `phone.messages`. */
  key: string;
  vars: Record<string, string | number>;
  /** WhatsApp template values, in order (default: the whole text as one value). */
  params?: (text: string) => string[];
}

async function logMessage(deps: Deps, userId: string, channel: string, kind: string, status: 'sent' | 'failed') {
  await deps.db.insert(messageLog).values({ userId, channel, kind, status });
}

/** Sends one WhatsApp / SMS to a person with a verified phone who wants this kind. Returns true when sent. */
export async function messagePerson(deps: Deps, userId: string, m: PhoneMessage): Promise<boolean> {
  const [p] = await deps.db
    .select({ phone: users.phone, verified: users.phoneVerifiedAt, channel: users.phoneChannel, prefs: users.phonePrefs, appearance: users.appearance })
    .from(users)
    .where(eq(users.id, userId));
  if (!p?.phone || !p.verified) return false;
  if (m.kind === 'weekly' && p.prefs.weekly === false) return false;
  if (m.kind === 'alert') {
    if (p.prefs.alerts === false) return false;
    const [{ n } = { n: 0 }] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageLog)
      .where(and(eq(messageLog.userId, userId), eq(messageLog.kind, 'alert'), gt(messageLog.createdAt, sql`now() - interval '1 day'`)));
    if (n >= DAILY_ALERTS) return false;
  }
  if (!deps.messages.available[p.channel]) return false;
  const lang = (p.appearance as { language?: string }).language;
  const locale = isLocale(lang) ? lang : 'ar';
  const text = createTranslator(locale).tDyn(`phone.messages.${m.key}`, m.vars);
  try {
    await deps.messages.send({ to: p.phone, channel: p.channel, kind: m.kind, text, params: m.params ? m.params(text) : [text], lang: locale });
    await logMessage(deps, userId, p.channel, m.kind, 'sent');
    return true;
  } catch (err) {
    deps.log.warn({ err, userId, kind: m.kind }, 'message failed');
    await logMessage(deps, userId, p.channel, m.kind, 'failed');
    return false;
  }
}

/**
 * Tells a student's linked parents something that needs attention now (absence, a low grade): an in-app / push
 * notification, and a WhatsApp / SMS when they turned alerts on.
 */
export async function alertParents(
  deps: Deps,
  studentId: string,
  alert: { type: 'child_absent' | 'child_low_grade'; data: Record<string, string | number>; link: string },
): Promise<void> {
  const parents = await deps.db.select({ id: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, studentId));
  if (!parents.length) return;
  const [child] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, studentId));
  const data = { name: child?.name ?? '', ...alert.data };
  await notify(
    deps,
    parents.map((p) => ({ userId: p.id, type: alert.type, icon: 'users', link: alert.link, data, pref: 'school' as const })),
  );
  const link = `${deps.env.APP_URL.replace(/\/$/, '')}${alert.link}`;
  for (const p of parents) {
    await messagePerson(deps, p.id, { kind: 'alert', key: alert.type, vars: { ...data, link } }).catch((err) => deps.log.warn({ err }, 'parent alert failed'));
  }
}
