import { Link } from 'react-router';
import { useSession } from '@/lib/session';
import type { CourseDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Download, Ticket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';

// Byte-order mark so Excel opens the CSV as UTF-8 (Arabic names).
const BOM = String.fromCharCode(0xfeff);
const CURRENCIES = ['USD', 'EUR', 'EGP', 'SAR', 'AED', 'MAD', 'DZD', 'TND', 'JOD', 'KWD', 'QAR', 'GBP'];

/** Teacher: public catalog listing, price and currency. */
export function CatalogSettings({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [listed, setListed] = useState(course.listed);
  const [price, setPrice] = useState(String(course.priceCents / 100));
  const [currency, setCurrency] = useState(course.currency);
  const [busy, setBusy] = useState(false);
  const me = useSession((s) => s.me);
  const allowed = !!me && (me.verifiedTeacher || me.role !== 'user');
  return (
    <section className="card space-y-4 p-4">
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
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.school.update(course.id, { listed, priceCents: Math.max(0, Math.round(Number(price || 0) * 100)), currency });
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
    const blob = new Blob([`${BOM}${rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vouchers-${course.title}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
