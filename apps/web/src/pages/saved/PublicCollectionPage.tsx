import { useQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { UserChip } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { SavedLink } from './SavedPage';

export default function PublicCollectionPage() {
  const { slug = '' } = useParams();
  const tr = useT();
  const q = useQuery({ queryKey: ['saved', 'public', slug], queryFn: () => api.saved.public(slug) });
  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error)
    return (
      <div className="page-narrow">
        <ErrorState error={q.error} />
      </div>
    );
  const { collection, owner, items } = q.data;
  return (
    <div className="page-narrow">
      <PageHeader title={<span dir="auto">{collection.name}</span>} subtitle={collection.description} icon={<Bookmark className="size-6" />} />
      <div className="mb-4">
        <UserChip user={owner} size="sm" subtitle={tr.t('saved.sharedBy', { name: owner.displayName })} />
      </div>
      {!items.length ? (
        <EmptyState title={tr.t('common.empty')} />
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="card flex items-center gap-3 p-3">
              <span className="badge shrink-0">{tr.t(`saved.types.${i.itemType}`)}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                <SavedLink item={i} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-center">
        <Link to="/" className="link">
          {tr.t('app.name')}
        </Link>
      </p>
    </div>
  );
}
