import type { LeaderboardEntry, UserSummary } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Crown, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FollowButton } from '@/components/common/FollowButton';
import { UserChip } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged, useSentinel } from '@/lib/infinite';
import { useSession } from '@/lib/session';

const TABS = ['discover', 'following', 'followers', 'leaderboard'] as const;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function UserRow({ user, following }: { user: UserSummary; following?: boolean }) {
  const me = useSession((s) => s.me);
  const [state, setState] = useState(following);
  return (
    <div className="card flex items-center gap-3 p-3">
      <UserChip user={user} className="flex-1" />
      {me && me.id !== user.id && state !== undefined && <FollowButton userId={user.id} following={state} onChange={setState} />}
    </div>
  );
}

function Leaderboard() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('week');
  const [scope, setScope] = useState<'global' | 'following'>('global');
  const q = useQuery({ queryKey: ['leaderboard', period, scope], queryFn: () => api.users.leaderboard({ period, scope, limit: 50 }) });
  const medal = (rank: number) => (rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-slate-400' : rank === 3 ? 'text-amber-700' : '');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['week', 'month', 'all'] as const).map((p) => (
          <button key={p} type="button" className={cx('chip', period === p && 'is-active')} aria-pressed={period === p} onClick={() => setPeriod(p)}>
            {tr.t(`people.periods.${p}`)}
          </button>
        ))}
        <span className="mx-1 w-px bg-line" aria-hidden />
        {(['global', 'following'] as const).map((s) => (
          <button key={s} type="button" className={cx('chip', scope === s && 'is-active')} aria-pressed={scope === s} onClick={() => setScope(s)}>
            {tr.t(`people.scopes.${s}`)}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <CardSkeletons count={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState title={tr.t('people.empty')} />
      ) : (
        <ol className="space-y-2">
          {q.data.items.map((e: LeaderboardEntry) => (
            <li key={e.user.id} className={cx('card flex items-center gap-3 p-3', e.user.id === me?.id && 'border-primary bg-soft')}>
              <span className={cx('w-8 text-center text-lg font-black tabular-nums', medal(e.rank))}>
                {e.rank <= 3 ? <Crown className="mx-auto size-5" aria-label={String(e.rank)} /> : e.rank}
              </span>
              <UserChip user={e.user} className="flex-1" />
              <span className="font-black tabular-nums">
                {formatNumber(e.score, tr)} <span className="muted text-xs font-normal">XP</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function PeoplePage() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const tabs = TABS.filter((t) => me || t === 'discover' || t === 'leaderboard');
  const [tab, setTab] = useTabParam(tabs, 'discover');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const suggested = useQuery({ queryKey: ['users', 'suggested'], queryFn: () => api.users.suggested(), enabled: !!me && tab === 'discover' && !term });
  const list = usePaged<UserSummary>(
    ['users', tab, term, me?.id],
    (cursor) =>
      tab === 'following' && me
        ? api.users.following(me.id, { cursor })
        : tab === 'followers' && me
          ? api.users.followers(me.id, { cursor })
          : api.users.list({ q: term, cursor, limit: 24 }),
    tab !== 'leaderboard',
  );
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);
  return (
    <div className="page-narrow">
      <PageHeader title={tr.t('people.title')} icon={<Users className="size-6" />} />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={tabs.map((k) => ({
          key: k,
          label: k === 'discover' ? tr.t('people.discover') : k === 'leaderboard' ? tr.t('people.leaderboard') : tr.t(`people.${k}`),
        }))}
      />
      {tab === 'leaderboard' ? (
        <Leaderboard />
      ) : (
        <div className="space-y-4">
          {tab === 'discover' && (
            <Input
              type="search"
              aria-label={tr.t('people.searchPlaceholder')}
              placeholder={tr.t('people.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {tab === 'discover' && !term && (suggested.data?.items.length ?? 0) > 0 && (
            <section className="space-y-2">
              <h2 className="font-black">{tr.t('people.suggested')}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggested.data!.items.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </div>
            </section>
          )}
          {list.isPending ? (
            <CardSkeletons count={4} />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : !list.items.length ? (
            <EmptyState title={tr.t('people.empty')} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {list.items.map((u) => (
                <UserRow key={u.id} user={u} following={tab === 'following' ? true : undefined} />
              ))}
            </div>
          )}
          <div ref={sentinel} aria-hidden />
        </div>
      )}
    </div>
  );
}
