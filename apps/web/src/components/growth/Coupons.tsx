import type { CourseDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { formatDate, formatPrice, fromLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** A teacher's discount codes for one paid course (or all of their courses). */
export function Coupons({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coupons'], queryFn: () => api.coupons.list() });
  const [f, setF] = useState({ code: '', kind: 'percent' as 'percent' | 'amount', value: '10', maxUses: '', expires: '', scope: 'course' as 'course' | 'all' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['coupons'] });
  const value = Number(f.value);
  const create = useMutation({
    mutationFn: () =>
      api.coupons.create({
        courseId: f.scope === 'course' ? course.id : null,
        code: f.code.trim() || undefined,
        percentOff: f.kind === 'percent' ? Math.round(value) : null,
        amountOffCents: f.kind === 'amount' ? Math.round(value * 100) : null,
        maxUses: f.maxUses ? Number(f.maxUses) : null,
        expiresAt: f.expires ? fromLocalInput(f.expires) : null,
      }),
    onSuccess: () => {
      toast(tr.t('growth.coupons.created'));
      setF({ ...f, code: '' });
      void refresh();
    },
    onError: toastError,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => api.coupons.setActive(v.id, v.active),
    onSuccess: refresh,
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.coupons.remove(id), onSuccess: refresh, onError: toastError });
  const items = (q.data?.items ?? []).filter((c) => !c.courseId || c.courseId === course.id);
  return (
    <section className="card space-y-3 p-4" aria-label={tr.t('growth.coupons.title')}>
      <h3 className="flex items-center gap-2 font-black">
        <Tag className="size-4" aria-hidden /> {tr.t('growth.coupons.title')}
      </h3>
      <p className="muted text-sm">{tr.t('growth.coupons.hint')}</p>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          label={tr.t('growth.coupons.code')}
          value={f.code}
          dir="ltr"
          className="font-mono uppercase"
          maxLength={20}
          onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
        />
        <Select
          label={tr.t('growth.coupons.course')}
          value={f.scope}
          onChange={(e) => setF({ ...f, scope: e.target.value as 'course' | 'all' })}
          options={[
            { value: 'course', label: course.title },
            { value: 'all', label: tr.t('growth.coupons.allCourses') },
          ]}
        />
        <Select
          label={`${tr.t('growth.coupons.percent')} / ${tr.t('growth.coupons.amount')}`}
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as 'percent' | 'amount' })}
          options={[
            { value: 'percent', label: tr.t('growth.coupons.percent') },
            { value: 'amount', label: tr.t('growth.coupons.amount') },
          ]}
        />
        <Input
          label={f.kind === 'percent' ? '%' : course.currency}
          type="number"
          min={1}
          max={f.kind === 'percent' ? 100 : undefined}
          value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })}
        />
        <Input label={tr.t('growth.coupons.maxUses')} type="number" min={1} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} />
        <Input label={tr.t('growth.coupons.expires')} type="datetime-local" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />
        <div className="sm:col-span-2">
          <Button type="submit" loading={create.isPending} disabled={!(value >= 1)}>
            {tr.t('growth.coupons.create')}
          </Button>
        </div>
      </form>
      {!items.length ? (
        <p className="muted text-sm">{tr.t('growth.coupons.none')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => {
            const expired = c.expiresAt !== null && c.expiresAt <= Date.now();
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <code className="font-mono font-black" dir="ltr">
                  {c.code}
                </code>
                <span className="badge badge-primary">
                  {tr.t('growth.coupons.off', { value: c.percentOff ? `${c.percentOff}%` : formatPrice(c.amountOffCents ?? 0, course.currency, tr) })}
                </span>
                <span className="muted text-xs">
                  {c.maxUses ? tr.t('growth.coupons.of', { uses: c.uses, max: c.maxUses }) : tr.t('growth.coupons.uses', { count: c.uses })}
                  {c.expiresAt ? ` · ${formatDate(c.expiresAt, tr)}` : ''}
                </span>
                {expired && <span className="badge badge-err">{tr.t('growth.coupons.expired')}</span>}
                {!c.active && <span className="badge">{tr.t('growth.coupons.inactive')}</span>}
                <span className="flex-1" />
                <IconButton
                  label={tr.t('growth.coupons.copy')}
                  onClick={() => void navigator.clipboard.writeText(c.code).then(() => toast(tr.t('growth.coupons.copied')))}
                >
                  <Copy className="size-4" />
                </IconButton>
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                  {c.active ? tr.t('growth.coupons.switchOff') : tr.t('growth.coupons.switchOn')}
                </Button>
                <IconButton label={tr.t('growth.coupons.delete')} onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
