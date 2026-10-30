import { and, eq } from 'drizzle-orm';
import { feeInvoices, schoolFees } from '../db/schema';
import type { Deps } from './context';
import { notify } from './notify';

/**
 * Paymob told us a transaction finished. When the merchant reference is a school fee invoice, settle it
 * (amount and currency must match). Returns true when the reference belonged to an invoice.
 */
export async function settleFeeInvoiceFromPaymob(deps: Deps, invoiceId: string, obj: Record<string, unknown>): Promise<boolean> {
  const [inv] = await deps.db
    .select()
    .from(feeInvoices)
    .where(and(eq(feeInvoices.id, invoiceId), eq(feeInvoices.provider, 'paymob')));
  if (!inv) return false;
  if (inv.status !== 'pending') return true;
  const ok = obj.success === true && obj.pending !== true && obj.is_voided !== true && obj.is_refunded !== true;
  if (ok && Number(obj.amount_cents) === inv.amountCents && String(obj.currency ?? '').toUpperCase() === inv.currency) {
    const [paid] = await deps.db
      .update(feeInvoices)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(feeInvoices.id, inv.id), eq(feeInvoices.status, 'pending')))
      .returning();
    if (paid) {
      const [fee] = await deps.db.select({ title: schoolFees.title }).from(schoolFees).where(eq(schoolFees.id, paid.feeId));
      const who = [...new Set([paid.studentId, paid.paidBy].filter((x): x is string => !!x))];
      await notify(
        deps,
        who.map((userId) => ({ userId, type: 'fee_paid', icon: 'wallet', link: '/fees', data: { title: fee?.title ?? '' }, pref: 'school' as const })),
      );
    }
  }
  return true;
}
