import type { CatalogCourseDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, Store } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api, fileUrl } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';

export function PriceTag({ c }: { c: Pick<CatalogCourseDto, 'priceCents' | 'currency'> }) {
  const tr = useT();
  return (
    <span className={c.priceCents ? 'badge badge-primary' : 'badge badge-ok'}>
      {c.priceCents ? formatPrice(c.priceCents, c.currency, tr) : tr.t('catalog.free')}
    </span>
  );
}

export default function CatalogPage() {
  const tr = useT();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['catalog', q], queryFn: () => api.catalog.list({ q: q.trim() || undefined }) });
  return (
    <div className="page space-y-5">
      <PageHeader title={tr.t('catalog.title')} subtitle={tr.t('catalog.subtitle')} icon={<Store className="size-6" />} />
      <label className="relative block max-w-md">
        <Search className="muted absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
        <input
          type="search"
          className="input ps-9"
          placeholder={tr.t('catalog.search')}
          aria-label={tr.t('catalog.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {list.isPending ? (
        <CardSkeletons count={6} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState title={tr.t('catalog.empty')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((c) => (
            <li key={c.id}>
              <Link to={`/courses/${c.id}`} className="card block overflow-hidden transition-shadow hover:shadow-lg">
                <div className="relative h-28" style={{ background: c.color ?? 'linear-gradient(135deg,var(--grad-from),var(--grad-to))' }}>
                  {c.coverUrl && <img src={fileUrl(c.coverUrl)} alt="" className="size-full object-cover" />}
                  <span className="absolute end-2 top-2">
                    <PriceTag c={c} />
                  </span>
                </div>
                <div className="space-y-1 p-4">
                  <p className="line-clamp-2 font-black" dir="auto">
                    {c.title}
                  </p>
                  <p className="muted flex items-center gap-2 text-sm">
                    <Avatar name={c.owner.displayName} url={c.owner.avatarUrl} size="xs" /> {c.owner.displayName}
                  </p>
                  <p className="muted text-xs">
                    {tr.t('catalog.members', { count: c.memberCount })}
                    {c.enrolled && ` · ${tr.t('catalog.enrolled')}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
