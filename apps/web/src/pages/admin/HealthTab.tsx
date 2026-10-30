import type { HealthCheckDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

const TONE: Record<HealthCheckDto['status'], string> = { ok: 'badge-ok', slow: 'badge-warn', down: 'badge-err', off: '' };

function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Is everything working? The checks that matter, who is online, errors and what is waiting for staff. */
export function HealthTab() {
  const tr = useT();
  const q = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api.admin.health(), refetchInterval: 30_000 });
  return (
    <QueryState query={q}>
      {(h) => (
        <div className="space-y-4">
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <span className={cx('badge', h.overall === 'ok' ? 'badge-ok' : h.overall === 'degraded' ? 'badge-warn' : 'badge-err')} data-testid="health-overall">
              {tr.t(`ops.health.overall.${h.overall}`)}
            </span>
            <span className="muted flex-1 text-sm">{tr.t('ops.health.checkedAt', { time: formatDateTime(h.checkedAt, tr) })}</span>
            <Button size="sm" variant="outline" icon={<RefreshCw className="size-4" />} loading={q.isFetching} onClick={() => void q.refetch()}>
              {tr.t('ops.health.refresh')}
            </Button>
          </section>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {h.checks.map((c) => (
              <li key={c.name} className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{tr.t(`ops.health.checks.${c.name}`)}</p>
                  <p className="muted truncate text-xs">{c.detail}</p>
                </div>
                {c.ms !== null && <span className="muted text-xs tabular-nums">{tr.t('ops.health.ms', { ms: c.ms })}</span>}
                <span className={cx('badge', TONE[c.status])}>{tr.t(`ops.health.status.${c.status}`)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="card space-y-1 p-4 text-sm">
              <h3 className="font-black">{tr.t('ops.health.process')}</h3>
              <p>{tr.t('ops.health.uptime', { value: duration(h.process.uptimeSec) })}</p>
              <p>{tr.t('ops.health.memory', { rss: h.process.rssMb, heap: h.process.heapMb })}</p>
              <p>
                Node {h.process.node} · {tr.t('ops.health.lag', { ms: h.process.loopLagMs })}
              </p>
              <p>
                {tr.t('ops.health.backup')}:{' '}
                {h.backup.at
                  ? `${formatDate(h.backup.at, tr)}${h.backup.sizeKb ? ` · ${Math.round(h.backup.sizeKb / 1024)} MB` : ''}`
                  : tr.t('ops.health.noBackup')}
              </p>
            </section>
            <section className="card space-y-1 p-4 text-sm">
              <h3 className="font-black">{tr.t('ops.health.load')}</h3>
              <p>{tr.t('ops.health.online', { count: h.load.online })}</p>
              <p>{h.load.errors24h ? tr.t('ops.health.errors', { count: h.load.errors24h }) : tr.t('ops.health.noErrors')}</p>
              {h.load.errorKinds.map((e, i) => (
                <p key={i} className="muted truncate text-xs" dir="auto">
                  {e.count}× {e.message}
                </p>
              ))}
              <p>{tr.t('ops.health.videos', { pending: h.load.pendingVideos, failed: h.load.failedVideos })}</p>
            </section>
          </div>
          <section className="card p-4">
            <h3 className="mb-2 font-black">{tr.t('ops.health.queues')}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(['reports', 'teacherVerifications', 'transfers', 'planPayments', 'complaints'] as const).map((k) => (
                <li key={k} className="text-center">
                  <p className={cx('text-2xl font-black tabular-nums', h.queues[k] > 0 && 'text-warn')}>{h.queues[k]}</p>
                  <p className="muted text-xs">{tr.t(`ops.health.${k}`)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </QueryState>
  );
}
