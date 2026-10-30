import type { FocusStatusDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Focus, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useFeatureOn } from '@/lib/features';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

const KEY = ['focus'] as const;
const DURATIONS = [15, 25, 45, 60] as const;

/** The running focus session (if any); the menus use it to hide social pages. */
export function useFocus() {
  const signedIn = useSession((s) => !!s.me);
  const on = useFeatureOn('focus-mode');
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.study.focus(),
    enabled: signedIn && on,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.active ? 60_000 : false),
  });
}

export function useFocusing(): boolean {
  const { data } = useFocus();
  return !!data?.active && data.active.endsAt > Date.now();
}

function useSecondsLeft(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
}

function useFocusActions() {
  const qc = useQueryClient();
  const tr = useT();
  const set = (s: FocusStatusDto) => qc.setQueryData(KEY, s);
  const start = useMutation({ mutationFn: (m: number) => api.study.startFocus(m), onSuccess: set, onError: toastError });
  const stop = useMutation({
    mutationFn: () => api.study.stopFocus(),
    onSuccess: (s) => {
      set(s);
      toast(tr.t('focus.finished'));
    },
    onError: toastError,
  });
  return { start, stop };
}

/** Thin bar under the top bar while focusing. */
export function FocusBar() {
  const tr = useT();
  const { data } = useFocus();
  const qc = useQueryClient();
  const left = useSecondsLeft(data?.active?.endsAt ?? null);
  const { stop } = useFocusActions();
  useEffect(() => {
    if (data?.active && left === 0) void qc.invalidateQueries({ queryKey: KEY });
  }, [data?.active, left, qc]);
  if (!data?.active || left === 0) return null;
  return (
    <div className="app-chrome bg-ink text-white" role="status">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 text-sm font-bold">
        <Focus className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate tabular-nums">{tr.t('focus.banner', { time: formatClock(left) })}</span>
        <Button size="sm" variant="soft" loading={stop.isPending} onClick={() => stop.mutate()}>
          {tr.t('focus.stop')}
        </Button>
      </div>
    </div>
  );
}

/** Start/stop panel with this week's numbers. */
export function FocusPanel() {
  const tr = useT();
  const q = useFocus();
  const left = useSecondsLeft(q.data?.active?.endsAt ?? null);
  const { start, stop } = useFocusActions();
  const s = q.data;
  return (
    <section className="card space-y-4 p-4" aria-label={tr.t('focus.title')}>
      <h2 className="flex items-center gap-2 font-black">
        <Focus className="size-5 text-ink" aria-hidden /> {tr.t('focus.title')}
      </h2>
      <p className="muted text-sm">{tr.t('focus.hint')}</p>
      {s?.active && left > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-black tabular-nums">{formatClock(left)}</span>
          <Button variant="danger" icon={<Square className="size-4" />} loading={stop.isPending} onClick={() => stop.mutate()}>
            {tr.t('focus.stop')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((m) => (
            <Button key={m} variant={m === 25 ? 'primary' : 'soft'} loading={start.isPending && start.variables === m} onClick={() => start.mutate(m)}>
              {tr.t('focus.minutes', { count: m })}
            </Button>
          ))}
        </div>
      )}
      {s && (
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          {(
            [
              ['today', s.todayMinutes],
              ['week', s.weekMinutes],
              ['sessions', s.weekSessions],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-bg-2 p-2">
              <dd className="text-lg font-black tabular-nums">{v}</dd>
              <dt className="muted text-xs">{tr.t(`focus.${k}`)}</dt>
            </div>
          ))}
        </dl>
      )}
      {s && <p className="muted text-xs">{tr.t('focus.muted', { count: s.mutedWeek })}</p>}
    </section>
  );
}
