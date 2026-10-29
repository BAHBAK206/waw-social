import { EXTRA_TIME_CHOICES, TIME_LIMIT_CHOICES, type UsageDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, Lock } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

const USAGE = ['usage'] as const;

/** Parent's control: a daily limit for one child, today's use and a button to give extra time. */
export function TimeLimitCard({ childId, name }: { childId: string; name: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['usage', childId], queryFn: () => api.wellbeing.childUsage(childId) });
  const refresh = (u?: UsageDto) => {
    if (u) qc.setQueryData(['usage', childId], u);
    else void qc.invalidateQueries({ queryKey: ['usage', childId] });
  };
  const setLimit = useMutation({
    mutationFn: (minutes: number | null) => api.wellbeing.setLimit(childId, minutes),
    onSuccess: () => {
      toast(tr.t('wellbeing.timeLimit.saved'));
      refresh();
    },
    onError: toastError,
  });
  const extra = useMutation({
    mutationFn: (minutes: number) => api.wellbeing.extraTime(childId, minutes),
    onSuccess: (u) => {
      toast(tr.t('wellbeing.timeLimit.extraSent'));
      refresh(u);
    },
    onError: toastError,
  });
  const u = q.data;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-black">
        <Hourglass className="size-5 text-primary" aria-hidden /> <span dir="auto">{tr.t('wellbeing.timeLimit.title', { name })}</span>
      </h2>
      <p className="muted text-sm">{tr.t('wellbeing.timeLimit.hint')}</p>
      <Select
        label={tr.t('wellbeing.timeLimit.title', { name })}
        value={u?.limit ? String(u.limit) : ''}
        disabled={setLimit.isPending}
        onChange={(e) => setLimit.mutate(e.target.value ? Number(e.target.value) : null)}
        options={[
          { value: '', label: tr.t('wellbeing.timeLimit.none') },
          ...TIME_LIMIT_CHOICES.map((m) => ({ value: String(m), label: tr.t('wellbeing.timeLimit.minutes', { count: m }) })),
        ]}
      />
      {u?.limit ? (
        <>
          <p className="text-sm font-bold" data-testid="usage-today">
            {tr.t('wellbeing.timeLimit.used', { used: u.used, limit: u.limit + u.bonus })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="muted text-xs">{tr.t('wellbeing.timeLimit.extra')}</span>
            {EXTRA_TIME_CHOICES.map((m) => (
              <Button key={m} size="sm" variant="soft" disabled={extra.isPending} onClick={() => extra.mutate(m)}>
                {tr.t('wellbeing.timeLimit.plus', { count: m })}
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Counts a minute of use every minute the tab is open and visible; locks the app when the limit is reached. */
export function UsageGuard() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const q = useQuery({
    queryKey: USAGE,
    queryFn: () => api.wellbeing.usage(),
    enabled: !!me,
    staleTime: 60_000,
  });
  const limited = !!q.data?.limit;
  const locked = !!q.data?.locked;
  useEffect(() => {
    if (!limited) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      api.wellbeing
        .ping()
        .then((u) => qc.setQueryData(USAGE, u))
        .catch(() => undefined);
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [limited, qc]);
  useEffect(() => {
    if (!locked) return;
    // A parent may add time: look again every minute so the lock lifts by itself.
    const t = setInterval(() => void qc.invalidateQueries({ queryKey: USAGE }), 60_000);
    return () => clearInterval(t);
  }, [locked, qc]);
  if (!locked) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="usage-lock-title"
      className="fixed inset-0 z-[200] grid place-items-center bg-bg p-6 text-center"
    >
      <div className="max-w-sm space-y-3">
        <Lock className="mx-auto size-12 text-primary" aria-hidden />
        <h1 id="usage-lock-title" className="text-2xl font-black">
          {tr.t('wellbeing.timeLimit.lockedTitle')}
        </h1>
        <p>{tr.t('wellbeing.timeLimit.lockedBody')}</p>
        <p className="muted text-sm">{tr.t('wellbeing.timeLimit.lockedAsk')}</p>
      </div>
    </div>
  );
}
