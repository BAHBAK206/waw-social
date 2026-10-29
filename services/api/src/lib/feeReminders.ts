import { addDays, dayKey } from '@qubedu/shared';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { feeInvoices, guardianLinks, schoolFees, users } from '../db/schema';
import type { Deps } from './context';
import { notify } from './notify';
import { messagePerson } from './parentMessages';

const MONEY = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

/**
 * Reminds the student and their parents about instalments due within three days or already late, at most once
 * every three days per invoice (each claimed exactly once, even with several API instances running).
 */
export async function sendDueFeeReminders(deps: Deps, limit = 200): Promise<number> {
  const today = dayKey(Date.now());
  const soon = addDays(today, 3);
  const recently = new Date(Date.now() - 3 * 86_400_000);
  const due = await deps.db
    .update(feeInvoices)
    .set({ lastRemindedAt: new Date() })
    .where(
      and(
        sql`${feeInvoices.id} in (select id from fee_invoices where status = 'pending' and due_day <= ${soon} and (last_reminded_at is null or last_reminded_at < ${recently.toISOString()}::timestamptz) order by due_day limit ${limit} for update skip locked)`,
        eq(feeInvoices.status, 'pending'),
        or(isNull(feeInvoices.lastRemindedAt), lt(feeInvoices.lastRemindedAt, recently)),
      ),
    )
    .returning();
  if (!due.length) return 0;
  const students = await deps.db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(
      inArray(
        users.id,
        due.map((d) => d.studentId),
      ),
    );
  const names = new Map(students.map((s) => [s.id, s.name]));
  const fees = await deps.db
    .select({ id: schoolFees.id, title: schoolFees.title })
    .from(schoolFees)
    .where(
      inArray(
        schoolFees.id,
        due.map((d) => d.feeId),
      ),
    );
  const titles = new Map(fees.map((f) => [f.id, f.title]));
  const parents = await deps.db
    .select({ guardianId: guardianLinks.guardianId, studentId: guardianLinks.studentId })
    .from(guardianLinks)
    .where(
      inArray(
        guardianLinks.studentId,
        due.map((d) => d.studentId),
      ),
    );
  for (const inv of due) {
    const data = {
      name: names.get(inv.studentId) ?? '',
      title: titles.get(inv.feeId) ?? '',
      amount: MONEY(inv.amountCents, inv.currency),
      due: inv.dueDay,
    };
    const link = '/fees';
    const people = [inv.studentId, ...parents.filter((p) => p.studentId === inv.studentId).map((p) => p.guardianId)];
    await notify(
      deps,
      people.map((userId) => ({ userId, type: 'fee_due', icon: 'wallet', link, data, pref: 'school' as const })),
    );
    const url = `${deps.env.APP_URL.replace(/\/$/, '')}${link}`;
    for (const p of parents.filter((x) => x.studentId === inv.studentId))
      await messagePerson(deps, p.guardianId, { kind: 'alert', key: 'fee_due', vars: { ...data, link: url } }).catch((err) =>
        deps.log.warn({ err }, 'fee message failed'),
      );
  }
  return due.length;
}

export function startFeeReminders(deps: Deps): () => void {
  const tick = () => void sendDueFeeReminders(deps).catch((err) => deps.log.warn({ err }, 'fee reminders failed'));
  const timer = setInterval(tick, 60 * 60_000);
  setTimeout(tick, 60_000);
  return () => clearInterval(timer);
}
