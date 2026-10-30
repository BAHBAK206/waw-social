import { SCHOOL_PLANS, planPrice, type Attachment, type SchoolDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { UploadButton } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** The school's plan: how many students it holds, upgrade by card, wallet or transfer. */
export function SchoolPlan({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['school', school.id, 'plan'], queryFn: () => api.plans.get(school.id) });
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [pick, setPick] = useState<'standard' | 'premium' | null>(null);
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const order = useMutation({
    mutationFn: (body: Parameters<typeof api.plans.order>[1]) => api.plans.order(school.id, body),
    onSuccess: ({ url }) => {
      if (url) window.location.assign(url);
      else {
        toast(tr.t('growth.plan.sent'));
        setPick(null);
        void qc.invalidateQueries({ queryKey: ['school', school.id, 'plan'] });
      }
    },
    onError: toastError,
  });
  return (
    <QueryState query={q}>
      {(s) => (
        <div className="space-y-5">
          <section className="card space-y-1 p-4">
            <p className="muted text-sm">{tr.t('growth.plan.current')}</p>
            <p className="text-2xl font-black">{tr.t(`growth.plan.${s.plan}`)}</p>
            <p className="text-sm" data-testid="plan-usage">
              {s.limit === null ? tr.t('growth.plan.unlimited', { count: s.students }) : tr.t('growth.plan.students', { count: s.students, limit: s.limit })}
              {s.periodEnd && s.plan !== 'free' ? ` · ${tr.t('growth.plan.renews', { date: formatDate(s.periodEnd, tr) })}` : ''}
            </p>
          </section>
          <div className="flex gap-2" role="radiogroup" aria-label={tr.t('growth.plan.title')}>
            {(['month', 'year'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                className={cx('chip', period === p && 'is-active')}
                onClick={() => setPeriod(p)}
              >
                {tr.t(`growth.plan.${p}`)}
              </button>
            ))}
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {SCHOOL_PLANS.map((p) => (
              <li key={p.id} className={cx('card space-y-2 p-4', s.plan === p.id && 'ring-2 ring-primary')}>
                <p className="text-lg font-black">{tr.t(`growth.plan.${p.id}`)}</p>
                <p className="text-sm">{p.students === null ? tr.t('growth.plan.noLimit') : tr.t('growth.plan.upTo', { count: p.students })}</p>
                <p className="font-bold tabular-nums">{p.id === 'free' ? tr.t('growth.lessons.free') : formatPrice(planPrice(p, period), 'EGP', tr)}</p>
                {p.id !== 'free' && s.plan !== p.id && (
                  <Button size="sm" variant="outline" onClick={() => setPick(p.id as 'standard' | 'premium')}>
                    {tr.t('growth.plan.choose')}
                  </Button>
                )}
                {p.id !== 'free' && s.plan === p.id && (
                  <Button size="sm" variant="outline" onClick={() => setPick(p.id as 'standard' | 'premium')}>
                    {tr.t('growth.plan.choose')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {pick && (
            <section className="card space-y-3 p-4">
              <h3 className="font-black">
                {tr.t(`growth.plan.${pick}`)} ·{' '}
                {formatPrice(
                  planPrice(
                    SCHOOL_PLANS.find((p) => p.id === pick)!,
                    period,
                  ),
                  'EGP',
                  tr,
                )}{' '}
                {tr.t(`growth.plan.${period}`)}
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <Button loading={order.isPending} onClick={() => order.mutate({ plan: pick, period, method: 'paymob_card' })}>
                  {tr.t('growth.plan.payCard')}
                </Button>
                <Input
                  label={tr.t('growth.plan.phone')}
                  type="tel"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  wrapperClassName="w-48"
                />
                <Button
                  variant="outline"
                  loading={order.isPending}
                  disabled={phone.replace(/\D/g, '').length < 10}
                  onClick={() => order.mutate({ plan: pick, period, method: 'paymob_wallet', phone: phone.replace(/\s+/g, '') })}
                >
                  {tr.t('growth.plan.payWallet')}
                </Button>
              </div>
              {s.transferInfo && (
                <form
                  className="space-y-2 border-t border-line pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (receipt) order.mutate({ plan: pick, period, method: 'transfer', reference: reference.trim(), receipt });
                  }}
                >
                  <h4 className="font-bold">{tr.t('growth.plan.transferTitle')}</h4>
                  <p className="muted text-sm" dir="auto">
                    {tr.t('growth.plan.transferHint', { info: s.transferInfo })}
                  </p>
                  <Input label={tr.t('growth.plan.reference')} value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                    <UploadButton
                      purpose="receipt"
                      variant="outline"
                      accept="image/*,application/pdf"
                      icon={<Paperclip className="size-4" />}
                      onUploaded={(r) => setReceipt({ url: r.url, name: r.name, mime: r.mime, size: r.size, kind: r.kind })}
                    >
                      {tr.t('growth.plan.receipt')}
                    </UploadButton>
                    {receipt && <span className="muted text-xs">{receipt.name}</span>}
                    <Button type="submit" loading={order.isPending} disabled={!receipt || reference.trim().length < 3}>
                      {tr.t('growth.plan.send')}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
          {!!s.orders.length && (
            <section className="card p-4">
              <h3 className="mb-2 font-black">{tr.t('growth.plan.orders')}</h3>
              <ul className="divide-y divide-line text-sm">
                {s.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-bold">{tr.t(`growth.plan.${o.plan}`)}</span>
                    <span className="tabular-nums">{formatPrice(o.amountCents, 'EGP', tr)}</span>
                    <span className="muted text-xs">{formatDate(o.createdAt, tr)}</span>
                    <span className="flex-1" />
                    <span className={cx('badge', o.status === 'paid' ? 'badge-ok' : o.status === 'failed' ? 'badge-err' : 'badge-warn')}>
                      {tr.t(`growth.plan.status.${o.status}`)}
                    </span>
                    {o.reason && <span className="muted text-xs">{o.reason}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </QueryState>
  );
}
