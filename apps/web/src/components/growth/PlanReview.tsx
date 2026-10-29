import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Platform admin: approve or reject school plan payments made by transfer. */
export function PlanReview() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['plan-review'], queryFn: () => api.plans.review() });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => api.plans.decide(v.id, { approve: v.approve, reason: v.approve ? undefined : reasons[v.id]?.trim() }),
    onSuccess: (_, v) => {
      toast(tr.t(v.approve ? 'growth.plan.approved' : 'growth.plan.rejected'));
      void qc.invalidateQueries({ queryKey: ['plan-review'] });
    },
    onError: toastError,
  });
  return (
    <section className="space-y-3">
      <h2 className="font-black">{tr.t('growth.plan.review')}</h2>
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <p className="muted text-sm">{tr.t('growth.plan.reviewNone')}</p>
          ) : (
            <ul className="space-y-3">
              {d.items.map((o) => (
                <li key={o.id} className="card space-y-2 p-4">
                  <p className="font-bold" dir="auto">
                    {o.school.name} · {tr.t(`growth.plan.${o.plan}`)} · {formatPrice(o.amountCents, 'EGP', tr)} · {tr.t(`growth.plan.${o.period}`)}
                  </p>
                  <p className="muted text-sm">
                    {tr.t('growth.plan.reference')}: <span dir="auto">{o.reference}</span> · {formatDate(o.createdAt, tr)}
                  </p>
                  {o.receipt && (
                    <a href={o.receipt.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-bold underline">
                      <ExternalLink className="size-4" aria-hidden /> {tr.t('growth.plan.receipt')}
                    </a>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: o.id, approve: true })}>
                      {tr.t('growth.plan.approve')}
                    </Button>
                    <Input
                      label={tr.t('growth.plan.reason')}
                      value={reasons[o.id] ?? ''}
                      onChange={(e) => setReasons({ ...reasons, [o.id]: e.target.value })}
                      wrapperClassName="w-56"
                    />
                    <Button size="sm" variant="outline" disabled={!(reasons[o.id] ?? '').trim()} onClick={() => decide.mutate({ id: o.id, approve: false })}>
                      {tr.t('growth.plan.reject')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}
