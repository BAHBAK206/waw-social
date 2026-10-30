import type { Attachment, InvoiceDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { PrintReceiptButton, StatusBadge, money } from '@/components/schooladmin/Fees';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { useUpload } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

type Info = { instapay?: string | null; wallet?: string | null; bank?: string | null; note?: string | null } | null;

function TransferDialog({ inv, info, onClose }: { inv: InvoiceDto; info: Info; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const methods = (['instapay', 'wallet', 'bank'] as const).filter((m) => info?.[m]);
  const [method, setMethod] = useState<(typeof methods)[number]>(methods[0] ?? 'instapay');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const { upload, busy } = useUpload();
  const send = useMutation({
    mutationFn: () => api.schoolAdmin.transferInvoice(inv.id, { method, reference: reference.trim(), receipt: receipt! }),
    onSuccess: () => {
      toast(tr.t('schoolAdmin.fees.transferSent'));
      void qc.invalidateQueries({ queryKey: ['my-invoices'] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal open size="sm" onClose={onClose} title={tr.t('schoolAdmin.fees.sendTransfer')}>
      <div className="space-y-3">
        <Select
          label={tr.t('schoolAdmin.fees.transferMethod')}
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          options={methods.map((m) => ({ value: m, label: tr.t(`schoolAdmin.fees.${m}`) }))}
        />
        {info?.[method] && (
          <p className="rounded-lg bg-bg-2 p-2 text-sm" dir="auto">
            {tr.t('schoolAdmin.fees.transferTo')}: <strong>{info[method]}</strong>
            {info.note ? ` — ${info.note}` : ''}
          </p>
        )}
        <Input label={tr.t('schoolAdmin.fees.transferRef')} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} dir="auto" />
        <label className="block text-sm font-bold">
          {tr.t('schoolAdmin.fees.transferReceipt')}
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            className="input mt-1"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const up = await upload(f, 'receipt');
              if (up) setReceipt({ url: up.url, name: up.name, mime: up.mime, size: up.size, kind: up.kind });
            }}
          />
        </label>
        {receipt && <p className="muted text-xs">{receipt.name}</p>}
        <Button block loading={send.isPending} disabled={reference.trim().length < 3 || !receipt} onClick={() => send.mutate()}>
          {tr.t('schoolAdmin.fees.transferSend')}
        </Button>
      </div>
    </Modal>
  );
}

function Invoice({ inv, cards, info }: { inv: InvoiceDto; cards: ('paymob_card' | 'paymob_wallet')[]; info: Info }) {
  const tr = useT();
  const [transfer, setTransfer] = useState(false);
  const [phone, setPhone] = useState('');
  const pay = useMutation({
    mutationFn: (m: 'paymob_card' | 'paymob_wallet') => api.schoolAdmin.payInvoice(inv.id, m, phone || undefined),
    onSuccess: (r) => {
      window.location.assign(r.url);
    },
    onError: toastError,
  });
  const open = inv.status === 'pending';
  const hasTransfer = !!info && (['instapay', 'wallet', 'bank'] as const).some((m) => info[m]);
  return (
    <li className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black" dir="auto">
            {inv.feeTitle} · {inv.student.displayName}
          </p>
          <p className="muted text-sm">
            {[
              tr.t('schoolAdmin.fees.instalmentOf', { no: inv.no, of: inv.of }),
              inv.schoolName,
              tr.t('schoolAdmin.fees.due', { day: formatDate(inv.dueDay, tr) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className="text-lg font-black tabular-nums">{money(inv.amountCents, inv.currency)}</span>
        <StatusBadge inv={inv} />
      </div>
      {inv.status === 'pending' && inv.reason && <p className="text-sm text-err">{inv.reason}</p>}
      {open && (
        <div className="flex flex-wrap items-end gap-2">
          {cards.includes('paymob_card') && (
            <Button size="sm" loading={pay.isPending && pay.variables === 'paymob_card'} onClick={() => pay.mutate('paymob_card')}>
              {tr.t('schoolAdmin.fees.payCard')}
            </Button>
          )}
          {cards.includes('paymob_wallet') && (
            <>
              <Input
                aria-label={tr.t('schoolAdmin.fees.walletPhone')}
                placeholder={tr.t('schoolAdmin.fees.walletPhone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                wrapperClassName="w-44"
              />
              <Button
                size="sm"
                variant="soft"
                disabled={phone.length < 8}
                loading={pay.isPending && pay.variables === 'paymob_wallet'}
                onClick={() => pay.mutate('paymob_wallet')}
              >
                {tr.t('schoolAdmin.fees.payWallet')}
              </Button>
            </>
          )}
          {hasTransfer && (
            <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>
              {tr.t('schoolAdmin.fees.sendTransfer')}
            </Button>
          )}
        </div>
      )}
      {inv.status === 'paid' && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-ok">{tr.t('schoolAdmin.fees.paidThanks')}</span>
          <a className="link" href={`/fees/receipt/${inv.id}`} target="_blank" rel="noopener noreferrer">
            {tr.t('schoolAdmin.fees.printReceipt')}
          </a>
        </div>
      )}
      {transfer && <TransferDialog inv={inv} info={info} onClose={() => setTransfer(false)} />}
    </li>
  );
}

/** The student's own instalments, or those of the children a parent is linked to. */
export default function FeesPage() {
  const tr = useT();
  const q = useQuery({ queryKey: ['my-invoices'], queryFn: () => api.schoolAdmin.myInvoices() });
  return (
    <div className="page mx-auto max-w-3xl">
      <PageHeader title={tr.t('schoolAdmin.fees.mineTitle')} subtitle={tr.t('schoolAdmin.fees.mineSubtitle')} icon={<Wallet className="size-6" />} />
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState icon={<Wallet className="size-7" />} title={tr.t('schoolAdmin.fees.mineEmpty')} />
          ) : (
            <ul className="space-y-3">
              {d.items.map((i) => (
                <Invoice key={i.id} inv={i} cards={d.cardMethods} info={d.transfer[i.schoolId] ?? null} />
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

export function ReceiptPage() {
  const tr = useT();
  const id = location.pathname.split('/').pop() ?? '';
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.schoolAdmin.invoice(id) });
  return (
    <div className="page mx-auto max-w-xl">
      <QueryState query={q}>
        {(i) => (
          <article className="card space-y-3 p-6">
            <h1 className="text-xl font-black">{tr.t('schoolAdmin.fees.receiptTitle')}</h1>
            <p className="font-bold" dir="auto">
              {i.schoolName}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="muted">{tr.t('schoolAdmin.fees.mineTitle')}</dt>
              <dd dir="auto">{i.feeTitle}</dd>
              <dt className="muted">{tr.t('schoolAdmin.fees.instalmentOf', { no: i.no, of: i.of })}</dt>
              <dd className="font-black tabular-nums">{money(i.amountCents, i.currency)}</dd>
              <dt className="muted">{tr.t('schoolAdmin.fees.statusPaid')}</dt>
              <dd>{i.paidAt ? tr.t('schoolAdmin.fees.paidOn', { day: formatDate(i.paidAt, tr) }) : '—'}</dd>
              <dt className="muted">{tr.t('schoolAdmin.dashboard.students')}</dt>
              <dd dir="auto">{i.student.displayName}</dd>
              {i.reference && (
                <>
                  <dt className="muted">{tr.t('schoolAdmin.fees.transferRef')}</dt>
                  <dd dir="auto">{i.reference}</dd>
                </>
              )}
            </dl>
            <PrintReceiptButton />
          </article>
        )}
      </QueryState>
    </div>
  );
}
