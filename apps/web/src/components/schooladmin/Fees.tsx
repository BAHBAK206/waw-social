import type { InvoiceDto, SchoolDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, todayKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { promptDialog, toast, toastError } from '@/lib/ui';

export const money = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;

export function StatusBadge({ inv }: { inv: Pick<InvoiceDto, 'status' | 'late'> }) {
  const tr = useT();
  const key = inv.status === 'pending' ? 'statusPending' : inv.status === 'review' ? 'statusReview' : inv.status === 'paid' ? 'statusPaid' : 'statusCancelled';
  return (
    <span className={cx('badge', inv.status === 'paid' ? 'badge-ok' : inv.status === 'review' ? 'badge-warn' : inv.late ? 'badge-err' : '')}>
      {inv.late ? tr.t('schoolAdmin.fees.late') : tr.t(`schoolAdmin.fees.${key}`)}
    </span>
  );
}

function PayInfo({
  schoolId,
  info,
}: {
  schoolId: string;
  info: { instapay?: string | null; wallet?: string | null; bank?: string | null; note?: string | null } | null;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ instapay: info?.instapay ?? '', wallet: info?.wallet ?? '', bank: info?.bank ?? '', note: info?.note ?? '' });
  const save = useMutation({
    mutationFn: () =>
      api.schoolAdmin.setTransferInfo(schoolId, { instapay: f.instapay || null, wallet: f.wallet || null, bank: f.bank || null, note: f.note || null }),
    onSuccess: () => {
      toast(tr.t('schoolAdmin.fees.saved'));
      void qc.invalidateQueries({ queryKey: ['school', schoolId, 'fees'] });
    },
    onError: toastError,
  });
  return (
    <section className="card space-y-3 p-4">
      <h3 className="font-black">{tr.t('schoolAdmin.fees.payInfo')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={tr.t('schoolAdmin.fees.instapay')} value={f.instapay} onChange={(e) => setF({ ...f, instapay: e.target.value })} dir="auto" />
        <Input label={tr.t('schoolAdmin.fees.wallet')} value={f.wallet} onChange={(e) => setF({ ...f, wallet: e.target.value })} dir="auto" />
        <Input label={tr.t('schoolAdmin.fees.bank')} value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} dir="auto" />
        <Input label={tr.t('schoolAdmin.fees.note')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} dir="auto" />
      </div>
      <Button loading={save.isPending} onClick={() => save.mutate()}>
        {tr.t('schoolAdmin.fees.saveInfo')}
      </Button>
    </section>
  );
}

function NewFee({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', amount: '', currency: 'EGP', instalments: 3, firstDue: todayKey(), section: '' });
  const create = useMutation({
    mutationFn: () =>
      api.schoolAdmin.createFee(school.id, {
        title: f.title.trim(),
        amountCents: Math.round(Number(f.amount) * 100),
        currency: f.currency,
        instalments: f.instalments,
        firstDue: f.firstDue,
        section: f.section || null,
      }),
    onSuccess: (r) => {
      toast(tr.t('schoolAdmin.fees.created', { count: r.invoices }));
      setF({ ...f, title: '', amount: '' });
      void qc.invalidateQueries({ queryKey: ['school', school.id] });
    },
    onError: toastError,
  });
  return (
    <section className="card space-y-3 p-4">
      <h3 className="font-black">{tr.t('schoolAdmin.fees.new')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={tr.t('schoolAdmin.fees.name')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" maxLength={120} />
        <Input
          type="number"
          min={1}
          step="0.01"
          label={tr.t('schoolAdmin.fees.amount')}
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
          dir="ltr"
        />
        <Select
          label={tr.t('schoolAdmin.fees.currency')}
          value={f.currency}
          onChange={(e) => setF({ ...f, currency: e.target.value })}
          options={['EGP', 'USD', 'EUR', 'SAR', 'AED'].map((c) => ({ value: c, label: c }))}
        />
        <Input
          type="number"
          min={1}
          max={12}
          label={tr.t('schoolAdmin.fees.instalments')}
          value={f.instalments}
          onChange={(e) => setF({ ...f, instalments: Number(e.target.value) })}
          dir="ltr"
        />
        <Input type="date" label={tr.t('schoolAdmin.fees.firstDue')} value={f.firstDue} onChange={(e) => setF({ ...f, firstDue: e.target.value })} dir="ltr" />
        <Select
          label={tr.t('schoolAdmin.fees.section')}
          value={f.section}
          onChange={(e) => setF({ ...f, section: e.target.value })}
          options={[{ value: '', label: '—' }, ...school.sections.map((s) => ({ value: s, label: s }))]}
        />
      </div>
      <Button loading={create.isPending} disabled={!f.title.trim() || !(Number(f.amount) > 0)} onClick={() => create.mutate()}>
        {tr.t('schoolAdmin.fees.create')}
      </Button>
    </section>
  );
}

/** The school's fees: create them, set how parents pay by transfer, approve transfers, see who has paid. */
export function SchoolFees({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const fees = useQuery({ queryKey: ['school', school.id, 'fees'], queryFn: () => api.schoolAdmin.fees(school.id) });
  const [status, setStatus] = useState('review');
  const invoices = useQuery({ queryKey: ['school', school.id, 'invoices', status], queryFn: () => api.schoolAdmin.invoices(school.id, status || undefined) });
  const act = useMutation({
    mutationFn: async (v: { id: string; action: 'paid' | 'cancel' | 'reject' }) => {
      let reason: string | undefined;
      if (v.action === 'reject') {
        const r = await promptDialog({ title: tr.t('schoolAdmin.fees.reject'), input: { label: tr.t('schoolAdmin.fees.reason') } });
        if (r === null) return;
        reason = r;
      }
      await api.schoolAdmin.invoiceAction(school.id, v.id, v.action, reason);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['school', school.id] });
    },
    onError: toastError,
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <QueryState query={fees}>
          {(d) =>
            !d.items.length ? (
              <EmptyState title={tr.t('schoolAdmin.fees.empty')} />
            ) : (
              <ul className="space-y-2">
                {d.items.map((f) => (
                  <li key={f.id} className="card p-3">
                    <p className="font-black" dir="auto">
                      {f.title} · {money(f.amountCents, f.currency)}
                    </p>
                    <p className="muted text-sm">
                      {[
                        tr.t('schoolAdmin.fees.students', { count: f.students }),
                        `${f.instalments}×`,
                        f.section,
                        tr.t('schoolAdmin.fees.paid', { amount: money(f.paidCents, f.currency) }),
                        tr.t('schoolAdmin.fees.outstanding', { amount: money(f.outstandingCents, f.currency) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black">{tr.t('schoolAdmin.fees.invoices')}</h3>
            {(['review', 'pending', 'paid'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} className={cx('chip', status === s && 'is-active')} onClick={() => setStatus(s)}>
                {tr.t(s === 'review' ? 'schoolAdmin.fees.review' : s === 'pending' ? 'schoolAdmin.fees.statusPending' : 'schoolAdmin.fees.statusPaid')}
              </button>
            ))}
          </div>
          <QueryState query={invoices}>
            {(d) =>
              !d.items.length ? (
                <p className="muted text-sm">—</p>
              ) : (
                <ul className="space-y-2">
                  {d.items.map((i) => (
                    <li key={i.id} className="card flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold" dir="auto">
                          {i.student.displayName} · {i.feeTitle}
                        </p>
                        <p className="muted text-xs">
                          {[
                            tr.t('schoolAdmin.fees.instalmentOf', { no: i.no, of: i.of }),
                            money(i.amountCents, i.currency),
                            tr.t('schoolAdmin.fees.due', { day: formatDate(i.dueDay, tr) }),
                            i.reference ? tr.t('schoolAdmin.fees.reference', { ref: i.reference }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {i.receipt && (
                          <a className="link text-xs" href={i.receipt.url} target="_blank" rel="noopener noreferrer">
                            {tr.t('schoolAdmin.fees.receipt')}
                          </a>
                        )}
                      </div>
                      <StatusBadge inv={i} />
                      {(i.status === 'pending' || i.status === 'review') && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="success" onClick={() => act.mutate({ id: i.id, action: 'paid' })}>
                            {tr.t('schoolAdmin.fees.markPaid')}
                          </Button>
                          {i.status === 'review' && (
                            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: i.id, action: 'reject' })}>
                              {tr.t('schoolAdmin.fees.reject')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: i.id, action: 'cancel' })}>
                            {tr.t('schoolAdmin.fees.cancel')}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </section>
      </div>
      <div className="space-y-4 self-start">
        <NewFee school={school} />
        {fees.data && <PayInfo key={JSON.stringify(fees.data.transferInfo)} schoolId={school.id} info={fees.data.transferInfo} />}
      </div>
    </div>
  );
}

export function PrintReceiptButton() {
  const tr = useT();
  return (
    <Button variant="soft" size="sm" icon={<Printer className="size-4" />} className="print:hidden" onClick={() => window.print()}>
      {tr.t('schoolAdmin.fees.printReceipt')}
    </Button>
  );
}
