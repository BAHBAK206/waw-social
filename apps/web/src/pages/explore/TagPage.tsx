import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { useParams } from 'react-router';
import { PostCard } from '@/components/feed/PostCard';
import { VideoCard } from '@/components/video/VideoCard';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

const TABS = ['posts', 'videos'] as const;

export default function TagPage() {
  const { tag = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useTabParam(TABS, 'posts');
  const key = ['explore', 'tag', tag];
  const q = useQuery({ queryKey: key, queryFn: () => api.explore.tag(tag) });
  return (
    <div className="page-narrow !max-w-4xl">
      <PageHeader
        title={`#${decodeURIComponent(tag)}`}
        subtitle={q.data ? `${tr.t('explore.posts', { count: q.data.postCount })} · ${tr.t('watch.playlistVideos', { count: q.data.videoCount })}` : undefined}
        icon={<Hash className="size-6" />}
      />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'posts', label: tr.t('explore.tagPosts') },
          { key: 'videos', label: tr.t('explore.tagVideos') },
        ]}
      />
      <QueryState query={q}>
        {(d) =>
          tab === 'posts' ? (
            d.posts.length ? (
              <div className="space-y-4">
                {d.posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onPatch={(fn) => qc.setQueryData(key, { ...d, posts: d.posts.map((x) => (x.id === p.id ? fn(x) : x)) })}
                    onRemoved={(id) => qc.setQueryData(key, { ...d, posts: d.posts.filter((x) => x.id !== id) })}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title={tr.t('explore.tagEmpty', { tag: decodeURIComponent(tag) })} />
            )
          ) : d.videos.length ? (
            <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {d.videos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          ) : (
            <EmptyState title={tr.t('explore.tagEmpty', { tag: decodeURIComponent(tag) })} />
          )
        }
      </QueryState>
    </div>
  );
}
