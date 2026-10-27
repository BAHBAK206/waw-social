import { useQuery } from '@tanstack/react-query';
import { Flame, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export function TrendingWidget({ limit = 8 }: { limit?: number }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['explore', 'tags', limit], queryFn: () => api.explore.tags({ limit }), staleTime: 5 * 60_000 });
  const items = q.data?.items ?? [];
  return (
    <section className="card p-4" aria-label={tr.t('explore.trendingTags')}>
      <h2 className="mb-3 flex items-center gap-2 font-black">
        <Flame className="size-5 text-warn" aria-hidden /> {tr.t('explore.trendingTags')}
      </h2>
      {!items.length && !q.isPending && <p className="muted text-sm">{tr.t('explore.noTrending')}</p>}
      <ol className="space-y-1">
        {items.map((t, i) => (
          <li key={t.tag}>
            <Link
              to={`/explore/tag/${encodeURIComponent(t.tag)}`}
              className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 hover:bg-bg-3"
            >
              <span className="muted w-4 text-sm tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">#{t.tag}</span>
                <span className="muted text-xs">{tr.t('explore.posts', { count: t.count })}</span>
              </span>
              {t.growth === null ? (
                <span className="badge badge-primary">{tr.t('explore.newTag')}</span>
              ) : t.growth > 0 ? (
                <span className="badge badge-ok">
                  <TrendingUp className="size-3" aria-hidden /> {tr.t('explore.growth', { pct: t.growth })}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
      <Link to="/explore" className="link mt-2 inline-block text-sm">
        {tr.t('common.seeAll')}
      </Link>
    </section>
  );
}
