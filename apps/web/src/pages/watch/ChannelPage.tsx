import type { VideoChannelDto, VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, ListVideo } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { SubscribeButton } from '@/components/video/SubscribeButton';
import { ShortCard, Thumb, VideoCard } from '@/components/video/VideoCard';
import { Avatar, VerifiedBadge } from '@/components/ui/Avatar';
import { CardSkeletons, EmptyState, LoadMore, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api, fileUrl } from '@/lib/api';
import { compactNumber, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';

const TABS = ['videos', 'shorts', 'playlists', 'about'] as const;

function ChannelVideos({ ownerId, kind }: { ownerId: string; kind: 'video' | 'short' }) {
  const tr = useT();
  const list = usePaged<VideoDto>(['videos', 'channel', ownerId, kind], (cursor) => api.videos.list({ ownerId, kind, feed: 'new', cursor, limit: 24 }));
  if (list.isPending) return <CardSkeletons count={4} className="sm:grid-cols-2 lg:grid-cols-3" />;
  if (!list.items.length) return <EmptyState icon={<Film className="size-7" />} title={tr.t('watch.empty')} />;
  return (
    <>
      <div
        className={
          kind === 'short' ? 'grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6' : 'grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        }
      >
        {list.items.map((v) => (kind === 'short' ? <ShortCard key={v.id} video={v} /> : <VideoCard key={v.id} video={v} />))}
      </div>
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}

export default function ChannelPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useTabParam(TABS, 'videos');
  const key = ['channel', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.channels.get(id) });

  return (
    <div className="page !max-w-[1300px]">
      <QueryState query={q}>
        {(ch: VideoChannelDto) => {
          const u = ch.user;
          return (
            <>
              <div className="surface-gradient h-32 overflow-hidden rounded-[var(--radius-card)] md:h-48">
                {u.coverUrl && <img src={fileUrl(u.coverUrl)} alt="" className="size-full object-cover" />}
              </div>
              <header className="flex flex-wrap items-center gap-4 px-2 py-5 md:px-6">
                <Avatar name={u.displayName} url={u.avatarUrl} size="xl" />
                <div className="min-w-0 flex-1">
                  <h1 className="flex items-center gap-2 text-2xl font-black md:text-3xl">
                    <span className="truncate">{u.displayName}</span>
                    <VerifiedBadge badge={u.badge} />
                  </h1>
                  <p className="muted text-sm">
                    {u.username ? `@${u.username} · ` : ''}
                    {tr.t('watch.subscribers', { count: compactNumber(ch.subscribers, tr) })} ·{' '}
                    {tr.t('watch.playlistVideos', { count: ch.videoCount + ch.shortCount })}
                  </p>
                  {u.bio && <p className="mt-1 line-clamp-2 max-w-2xl text-sm">{u.bio}</p>}
                  <Link to={`/u/${u.id}`} className="link text-sm">
                    {tr.t('nav.profile')}
                  </Link>
                </div>
                <SubscribeButton
                  userId={u.id}
                  subscribed={ch.isSubscribed}
                  onChange={(s) => qc.setQueryData<VideoChannelDto>(key, (c) => (c ? { ...c, isSubscribed: s, subscribers: c.subscribers + (s ? 1 : -1) } : c))}
                />
              </header>
              <Tabs
                className="mb-5 border-b border-line"
                active={tab}
                onChange={setTab}
                tabs={[
                  { key: 'videos', label: tr.t('watch.channel.videos') },
                  { key: 'shorts', label: tr.t('watch.channel.shorts'), hidden: ch.shortCount === 0 },
                  { key: 'playlists', label: tr.t('watch.channel.playlists'), hidden: ch.playlists.length === 0 },
                  { key: 'about', label: tr.t('watch.channel.about') },
                ]}
              />
              {tab === 'videos' && <ChannelVideos ownerId={u.id} kind="video" />}
              {tab === 'shorts' && <ChannelVideos ownerId={u.id} kind="short" />}
              {tab === 'playlists' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {ch.playlists.map((pl) => (
                    <Link key={pl.id} to={`/playlist/${pl.id}`} className="group block">
                      <Thumb video={{ thumbnailUrl: pl.thumbnailUrl, durationSec: 1, progressSec: 0, title: pl.title }} />
                      <p className="mt-2 flex items-center gap-1 truncate font-bold">
                        <ListVideo className="size-4 shrink-0" aria-hidden /> {pl.title}
                      </p>
                      <p className="muted text-xs">{tr.t('watch.playlistVideos', { count: pl.itemCount })}</p>
                    </Link>
                  ))}
                </div>
              )}
              {tab === 'about' && (
                <div className="card max-w-2xl space-y-3 p-5">
                  <p className="whitespace-pre-wrap" dir="auto">
                    {u.bio || ' '}
                  </p>
                  <p className="muted text-sm">{tr.t('watch.channel.joined', { date: formatDate(u.createdAt, tr) })}</p>
                  <p className="muted text-sm">{tr.t('watch.channel.totalViews', { count: ch.totalViews.toLocaleString(tr.intl) })}</p>
                </div>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
