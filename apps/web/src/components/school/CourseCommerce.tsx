import { Link } from 'react-router';
import { useSession } from '@/lib/session';
import type { CourseDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Check, Download, ExternalLink, Ticket, Trash2, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';
import { downloadCsv } from '@/lib/download';

const CURRENCIES = ['USD', 'EUR', 'EGP', 'SAR', 'AED', 'MAD', 'DZD', 'TND', 'JOD', 'KWD', 'QAR', 'GBP'];

/** Teacher: public catalog listing, price and currency. */
export function CatalogSettings({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [listed, setListed] = useState(course.listed);
  const [price, setPrice] = useState(String(course.priceCents / 100));
  const [currency, setCurrency] = useState(course.currency);
  const [transfer, setTransfer] = useState({
    instapay: course.transferInfo?.instapay ?? '',
    wallet: course.transferInfo?.wallet ?? '',
    bank: course.transferInfo?.bank ?? '',
    note: course.transferInfo?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const me = useSession((s) => s.me);
  const allowed = !!me && (me.verifiedTeacher || me.role !== 'user');
  return (
    <section className="card space-y-4 p-4" aria-label={tr.t('catalog.title')}>
      {!allowed && (
        <p className="rounded-[var(--radius-control)] bg-soft p-3 text-sm">
          {tr.t('errors.verified_teacher_required')}{' '}
          <Link to="/settings?tab=account" className="link">
            {tr.t('verification.title')}
          </Link>
        </p>
      )}
      <Switch checked={listed} disabled={!allowed} onChange={setListed} label={tr.t('certificates.listed')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="number" min={0} step="0.01" label={tr.t('certificates.price')} value={price} onChange={(e) => setPrice(e.target.value)} dir="ltr" />
        <Select
          label={tr.t('certificates.currency')}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <fieldset className="space-y-3 rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 font-black">{tr.t('payments.settingsTitle')}</legend>
        <p className="muted text-sm">{tr.t('payments.settingsHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={tr.t('payments.instapayLabel')}
            value={transfer.instapay}
            maxLength={100}
            dir="ltr"
            onChange={(e) => setTransfer({ ...transfer, instapay: e.target.value })}
          />
          <Input
            label={tr.t('payments.walletLabel')}
            type="tel"
            value={transfer.wallet}
            maxLength={20}
            dir="ltr"
            onChange={(e) => setTransfer({ ...transfer, wallet: e.target.value })}
          />
        </div>
        <Input
          label={tr.t('payments.bankLabel')}
          value={transfer.bank}
          maxLength={300}
          dir="auto"
          onChange={(e) => setTransfer({ ...transfer, bank: e.target.value })}
        />
        <Textarea
          label={tr.t('payments.noteLabel')}
          rows={2}
          value={transfer.note}
          maxLength={500}
          onChange={(e) => setTransfer({ ...transfer, note: e.target.value })}
        />
      </fieldset>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.school.update(course.id, {
              listed,
              priceCents: Math.max(0, Math.round(Number(price || 0) * 100)),
              currency,
              transferInfo: transfer,
            });
            await qc.invalidateQueries({ queryKey: qk.course(course.id) });
            toast(tr.t('common.saved'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr.t('common.save')}
      </Button>
    </section>
  );
}

/** Teacher: InstaPay / wallet / bank payments waiting for approval, with the receipt. */
export function TransferRequests({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['transfers', course.id], queryFn: () => api.school.transfers(course.id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const review = async (id: string, approve: boolean, name: string) => {
    setBusy(id);
    try {
      await api.school.reviewTransfer(id, approve ? { approve } : { approve, reason: reason.trim() });
      if (approve) toast(tr.t('payments.approvedToast', { name }));
      setRefusing(null);
      setReason('');
      await q.refetch();
      await qc.invalidateQueries({ queryKey: qk.course(course.id) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (!course.transferInfo && !q.data?.items.length) return null;
  return (
    <section className="card space-y-3 p-4" aria-label={tr.t('payments.requests')}>
      <h3 className="flex items-center gap-2 font-black">
        <Wallet className="size-4" aria-hidden /> {tr.t('payments.requests')}
      </h3>
      {!q.data?.items.length ? (
        <p className="muted text-sm">{tr.t('payments.none')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.map((t) => (
            <li key={t.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold" dir="auto">
                  {t.user.displayName}
                </span>
                <span className="badge">{tr.t(`payments.methods.${t.method}`)}</span>
                <span className="muted text-sm">{formatPrice(t.amountCents, t.currency, tr)}</span>
                <span className={t.status === 'approved' ? 'badge badge-ok' : t.status === 'rejected' ? 'badge badge-err' : 'badge badge-primary'}>
                  {tr.t(`payments.status.${t.status}`)}
                </span>
                <span className="muted ms-auto text-xs">{formatDate(t.createdAt, tr)}</span>
              </div>
              <p className="text-sm">
                <span className="muted">{tr.t('payments.reference')}: </span>
                <span className="font-mono" dir="auto">
                  {t.reference}
                </span>
              </p>
              {t.note && (
                <p className="text-sm" dir="auto">
                  {t.note}
                </p>
              )}
              {t.reason && <p className="text-sm text-err">{t.reason}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {t.receipt && (
                  <a href={t.receipt.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm inline-flex items-center gap-1">
                    <ExternalLink className="size-4" aria-hidden /> {tr.t('payments.viewReceipt')}
                  </a>
                )}
                {t.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      icon={<Check className="size-4" />}
                      loading={busy === t.id && refusing !== t.id}
                      onClick={() => void review(t.id, true, t.user.displayName)}
                    >
                      {tr.t('payments.approve')}
                    </Button>
                    <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setRefusing(refusing === t.id ? null : t.id)}>
                      {tr.t('payments.reject')}
                    </Button>
                  </>
                )}
              </div>
              {refusing === t.id && (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void review(t.id, false, t.user.displayName);
                  }}
                >
                  <Input
                    label={tr.t('payments.rejectReason')}
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                    wrapperClassName="min-w-60 flex-1"
                  />
                  <Button type="submit" variant="danger" size="sm" loading={busy === t.id} disabled={!reason.trim()}>
                    {tr.t('payments.reject')}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Vouchers({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['vouchers', course.id], queryFn: () => api.school.vouchers(course.id) });
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const download = () => {
    const rows = [
      ['code', 'used_by', 'used_at'],
      ...(q.data?.items ?? []).map((v) => [v.code, v.usedBy?.displayName ?? '', v.usedAt ? new Date(v.usedAt).toISOString() : '']),
    ];
    downloadCsv(`vouchers-${course.title}.csv`, rows);
  };
  return (
    <section className="card space-y-3 p-4" aria-label={tr.t('certificates.vouchers')}>
      <h3 className="flex items-center gap-2 font-black">
        <Ticket className="size-4" aria-hidden /> {tr.t('certificates.vouchers')}
      </h3>
      <p className="muted text-sm">{tr.t('certificates.vouchersHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="number"
          min={1}
          max={200}
          label={tr.t('certificates.howMany')}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          wrapperClassName="w-32"
        />
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.school.makeVouchers(course.id, count);
              await q.refetch();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('certificates.makeVouchers')}
        </Button>
        {!!q.data?.items.length && (
          <Button variant="outline" icon={<Download className="size-4" />} onClick={download}>
            {tr.t('certificates.download')}
          </Button>
        )}
      </div>
      {!!q.data?.items.length && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto text-sm">
          {q.data.items.map((v) => (
            <li key={v.code} className="flex items-center gap-3 py-1.5">
              <span className="font-mono" dir="ltr">
                {v.code}
              </span>
              <span className="muted ms-auto text-xs">
                {v.usedBy ? tr.t('certificates.used', { name: v.usedBy.displayName }) : tr.t('certificates.unused')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CourseCertificates({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course-certificates', course.id], queryFn: () => api.certificates.course(course.id) });
  const [minGrade, setMinGrade] = useState(60);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 p-4" aria-label={tr.t('certificates.title')}>
      <h3 className="flex items-center gap-2 font-black">
        <Award className="size-4" aria-hidden /> {tr.t('certificates.title')}
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="number"
          min={0}
          max={100}
          label={tr.t('certificates.minGrade')}
          value={minGrade}
          onChange={(e) => setMinGrade(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          wrapperClassName="w-72"
        />
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.certificates.issue(course.id, { minGrade });
              toast(tr.t('certificates.issued', { count: r.issued }));
              await q.refetch();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('certificates.issue')}
        </Button>
      </div>
      {!!q.data?.items.length && (
        <ul className="divide-y divide-line text-sm">
          {q.data.items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-1.5">
              <a href={`/certificate/${c.code}`} className="link" dir="auto">
                {c.holder.displayName}
              </a>
              <span className="muted text-xs">{formatDate(c.issuedAt, tr)}</span>
              {c.grade !== null && <span className="badge">{c.grade}%</span>}
              {c.revoked ? (
                <span className="badge badge-err ms-auto">{tr.t('certificates.revoked')}</span>
              ) : (
                <IconButton
                  size="sm"
                  className="ms-auto"
                  label={tr.t('certificates.revoke')}
                  onClick={async () => {
                    try {
                      await api.certificates.revoke(c.id);
                      await q.refetch();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
