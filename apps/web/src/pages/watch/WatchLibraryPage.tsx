import type { VideoDto, WatchHistoryItem } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, History, ListVideo, Plus, ThumbsUp, Trash2, X } from 'lucide-react';
import { Link } from 'react-router';
import { Thumb, VideoCard, VideoRow } from '@/components/video/VideoCard';
import { Button, IconButton } from '@/components/ui/Button';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, PageHeader } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { confirmDialog, promptDialog, toastError } from '@/lib/ui';

const TABS = ['history', 'later', 'liked', 'playlists'] as const;

function HistoryTab() {
  const tr = useT();
  const qc = useQueryClient();
  const list = usePaged<WatchHistoryItem>(['watch-history'], (cursor) => api.videos.history({ cursor, limit: 20 }));
  if (list.isPending) return <CardSkeletons count={4} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <div className="space-y-2">
      {!!list.items.length && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (!(await confirmDialog({ title: tr.t('watch.clearHistoryConfirm'), danger: true, confirmLabel: tr.t('watch.clearHistory') }))) return;
              try {
                await api.videos.clearHistory();
                await qc.invalidateQueries({ queryKey: ['watch-history'] });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('watch.clearHistory')}
          </Button>
        </div>
      )}
      {list.items.map((h) => (
        <VideoRow
          key={h.video.id}
          video={{ ...h.video, progressSec: h.completed ? 0 : h.progressSec }}
          trailing={
            <IconButton
              label={tr.t('watch.removeFromHistory')}
              size="sm"
              onClick={async () => {
                try {
                  await api.videos.removeFromHistory(h.video.id);
                  await qc.invalidateQueries({ queryKey: ['watch-history'] });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <X className="size-4" />
            </IconButton>
          }
        />
      ))}
      {!list.items.length && <EmptyState icon={<History className="size-7" />} title={tr.t('watch.historyEmpty')} />}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}

function VideoGrid({
  queryKey,
  fetchPage,
  empty,
  icon,
}: {
  queryKey: unknown[];
  fetchPage: (cursor: string | undefined) => ReturnType<typeof api.videos.list>;
  empty: string;
  icon: React.ReactNode;
}) {
  const list = usePaged<VideoDto>(queryKey, fetchPage);
  if (list.isPending) return <CardSkeletons count={4} className="sm:grid-cols-2 lg:grid-cols-3" />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.items.length) return <EmptyState icon={icon} title={empty} />;
  return (
    <>
      <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.items.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}

function Playlists() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['playlists', 'mine', 'all'], queryFn: () => api.playlists.mine() });
  if (q.isPending) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button
          icon={<Plus className="size-4" />}
          onClick={async () => {
            const title = await promptDialog({
              title: tr.t('watch.newPlaylist'),
              input: { label: tr.t('watch.playlistName') },
              confirmLabel: tr.t('common.create'),
            });
            if (!title) return;
            try {
              await api.playlists.create({ title });
              await qc.invalidateQueries({ queryKey: ['playlists'] });
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('watch.newPlaylist')}
        </Button>
      </div>
      {!q.data.items.length ? (
        <EmptyState icon={<ListVideo className="size-7" />} title={tr.t('watch.noPlaylists')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {q.data.items.map((pl) => (
            <Link key={pl.id} to={`/playlist/${pl.id}`} className="group block">
              <div className="relative">
                <Thumb video={{ thumbnailUrl: pl.thumbnailUrl, durationSec: 1, progressSec: 0, title: pl.title }} />
                <span className="absolute inset-y-0 end-0 flex w-1/3 flex-col items-center justify-center rounded-e-[var(--radius-control)] bg-black/70 text-white">
                  <ListVideo className="size-5" aria-hidden />
                  <span className="text-sm font-bold tabular-nums">{pl.itemCount}</span>
                </span>
              </div>
              <p className="mt-2 truncate font-bold">{pl.title}</p>
              <p className="muted text-xs">
                {pl.visibility === 'private' ? tr.t('watch.privateBadge') : tr.t('watch.playlistVideos', { count: pl.itemCount })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WatchLibraryPage() {
  const tr = useT();
  const [tab, setTab] = useTabParam(TABS, 'history');
  return (
    <div className="page !max-w-[1500px]">
      <PageHeader title={tr.t('watch.history')} icon={<History className="size-6" />} />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'history', label: tr.t('watch.history'), icon: <History className="size-4" /> },
          { key: 'later', label: tr.t('watch.watchLaterTitle'), icon: <Clock className="size-4" /> },
          { key: 'liked', label: tr.t('watch.likedTitle'), icon: <ThumbsUp className="size-4" /> },
          { key: 'playlists', label: tr.t('watch.playlists'), icon: <ListVideo className="size-4" /> },
        ]}
      />
      {tab === 'history' && <HistoryTab />}
      {tab === 'later' && (
        <VideoGrid
          queryKey={['watch-later']}
          fetchPage={(cursor) => api.videos.watchLaterList({ cursor, limit: 24 })}
          empty={tr.t('watch.watchLaterEmpty')}
          icon={<Clock className="size-7" />}
        />
      )}
      {tab === 'liked' && (
        <VideoGrid
          queryKey={['videos', 'liked']}
          fetchPage={(cursor) => api.videos.list({ feed: 'liked', cursor, limit: 24 })}
          empty={tr.t('watch.empty')}
          icon={<ThumbsUp className="size-7" />}
        />
      )}
      {tab === 'playlists' && <Playlists />}
    </div>
  );
}
