import type { LeagueDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Medal } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

export const TIER_COLORS = ['#cd7f32', '#a8b2bd', '#e5b80b', '#2f6fde', '#d6336c', '#2fb380', '#7ad7f0'];

export function daysLeft(l: LeagueDto) {
  return Math.max(0, Math.floor((l.endsAt - Date.now()) / 86_400_000));
}

/** Small card for the home dashboard. */
export function LeagueCard() {
  const tr = useT();
  const q = useQuery({ queryKey: ['league'], queryFn: () => api.leagues.me(), staleTime: 60_000 });
  if (!q.data) return null;
  const l = q.data;
  const me = l.members.find((m) => m.me);
  return (
    <Link to="/league" className="card flex items-center gap-3 p-4 hover:shadow-lg">
      <Medal className="size-8 shrink-0" style={{ color: TIER_COLORS[l.tierIndex] }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-black">{tr.t(`league.tiers.${l.tier}`)}</p>
        <p className="muted text-sm">
          {me ? tr.t('league.rank', { rank: me.rank, tier: tr.t(`league.tiers.${l.tier}`) }) : tr.t('league.notJoined')} ·{' '}
          {tr.t('league.endsIn', { count: daysLeft(l) })}
        </p>
      </div>
    </Link>
  );
}

export default function LeaguePage() {
  const tr = useT();
  const q = useQuery({ queryKey: ['league'], queryFn: () => api.leagues.me(), refetchInterval: 60_000 });
  return (
    <div className="page-narrow space-y-5">
      <PageHeader title={tr.t('league.title')} subtitle={tr.t('league.subtitle')} icon={<Medal className="size-6" />} />
      {q.isPending ? (
        <CardSkeletons count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <section className="card flex flex-wrap items-center gap-4 p-5">
            <Medal className="size-14" style={{ color: TIER_COLORS[q.data.tierIndex] }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-black">{tr.t(`league.tiers.${q.data.tier}`)}</p>
              <p className="muted text-sm">{tr.t('league.endsIn', { count: daysLeft(q.data) })}</p>
              {q.data.lastResult && (
                <p className="text-sm font-bold">
                  {tr.t(q.data.lastResult === 'up' ? 'league.lastUp' : q.data.lastResult === 'down' ? 'league.lastDown' : 'league.lastStay')}
                </p>
              )}
            </div>
            <ol className="flex gap-1" aria-hidden>
              {TIER_COLORS.map((c, i) => (
                <li key={c} className={cx('size-3 rounded-full', i === q.data.tierIndex && 'ring-2 ring-offset-2')} style={{ background: c }} />
              ))}
            </ol>
          </section>
          {!q.data.joined ? (
            <EmptyState icon={<Medal className="size-7" />} title={tr.t('league.notJoined')} />
          ) : (
            <ol className="card divide-y divide-line overflow-hidden" aria-label={tr.t('league.title')}>
              {q.data.members.map((m, i) => {
                const up = i < q.data.promote && m.xp > 0;
                const down = q.data.demote > 0 && i >= q.data.members.length - q.data.demote;
                return (
                  <li
                    key={m.user.id}
                    className={cx(
                      'flex items-center gap-3 px-4 py-2.5',
                      m.me && 'bg-soft font-bold',
                      up && 'border-s-4 border-s-[var(--ok)]',
                      down && 'border-s-4 border-s-[var(--err)]',
                    )}
                  >
                    <span className="w-6 text-center font-black tabular-nums">{m.rank}</span>
                    <Avatar name={m.user.displayName} url={m.user.avatarUrl} size="sm" online={m.user.online} />
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {m.me ? `${m.user.displayName} (${tr.t('league.you')})` : m.user.displayName}
                    </span>
                    {up && <span className="badge badge-ok hidden sm:inline-flex">{tr.t('league.promoteZone')}</span>}
                    {down && <span className="badge badge-err hidden sm:inline-flex">{tr.t('league.demoteZone')}</span>}
                    <span className="tabular-nums">{tr.t('league.xp', { xp: m.xp })}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
