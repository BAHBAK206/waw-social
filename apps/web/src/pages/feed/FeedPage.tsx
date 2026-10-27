import type { PostDto } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Newspaper } from 'lucide-react';
import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { TrendingWidget } from '@/components/feed/TrendingWidget';
import { StoriesTray } from '@/components/stories/Stories';
import { PageHeader, EmptyState, ErrorState, CardSkeletons } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { patchItem, removeItem, usePaged, useSentinel } from '@/lib/infinite';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';

const SCOPES = ['foryou', 'following', 'all', 'mine'] as const;

export default function FeedPage() {
  const tr = useT();
  const qc = useQueryClient();
  const [scope, setScope] = useTabParam(SCOPES, 'foryou', 'scope');
  const key = qk.feed(scope);
  const list = usePaged<PostDto>(key, (cursor) => api.posts.feed({ scope, cursor, limit: 15 }));
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);

  return (
    <div className="page grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <PageHeader title={tr.t('feed.title')} icon={<Newspaper className="size-6" />} />
        <StoriesTray />
        <Composer />
        <Tabs
          label={tr.t('feed.title')}
          active={scope}
          onChange={setScope}
          tabs={[
            { key: 'foryou', label: tr.t('feed.scopeForYou') },
            { key: 'following', label: tr.t('feed.scopeFollowing') },
            { key: 'all', label: tr.t('feed.scopeAll') },
            { key: 'mine', label: tr.t('feed.scopeMine') },
          ]}
        />
        {list.isPending ? (
          <CardSkeletons count={3} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.items.length ? (
          <EmptyState title={tr.t('feed.empty')} />
        ) : (
          <div className="space-y-4">
            {list.items.map((p) => (
              <PostCard key={p.id} post={p} onPatch={(fn) => patchItem<PostDto>(qc, key, p.id, fn)} onRemoved={(id) => removeItem<PostDto>(qc, key, id)} />
            ))}
            <div ref={sentinel} aria-hidden />
            {list.isFetchingNextPage && <CardSkeletons count={1} />}
          </div>
        )}
      </div>
      <aside className="hidden space-y-4 lg:block">
        <TrendingWidget />
      </aside>
    </div>
  );
}
