import { useQuery } from '@tanstack/react-query';
import { Compass, Flame, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { PostCard } from '@/components/feed/PostCard';
import { ShortCard, VideoCard } from '@/components/video/VideoCard';
import { EventCard } from '@/pages/events/EventsPage';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function ExplorePage() {
  const tr = useT();
  const q = useQuery({ queryKey: ['explore', 'home'], queryFn: () => api.explore.home() });
  return (
    <div className="page">
      <PageHeader title={tr.t('explore.title')} subtitle={tr.t('explore.subtitle')} icon={<Compass className="size-6" />} />
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-10">
            <section aria-label={tr.t('explore.trendingTags')}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
                <Flame className="size-5 text-warn" /> {tr.t('explore.trendingTags')}
              </h2>
              {!d.tags.length ? (
                <p className="muted">{tr.t('explore.noTrending')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {d.tags.map((t) => (
                    <Link key={t.tag} to={`/explore/tag/${encodeURIComponent(t.tag)}`} className="chip">
                      #{t.tag}
                      <span className="muted text-xs">{t.count}</span>
                      {t.growth !== null && t.growth > 0 && (
                        <span className="text-ok flex items-center text-xs">
                          <TrendingUp className="size-3" /> {t.growth}%
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {d.videos.length > 0 && (
              <section aria-label={tr.t('explore.popularVideos')}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black">{tr.t('explore.popularVideos')}</h2>
                  <Link to="/watch?feed=trending" className="link text-sm">
                    {tr.t('common.seeAll')}
                  </Link>
                </div>
                <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                  {d.videos
                    .filter((v) => v.kind === 'video')
                    .slice(0, 4)
                    .map((v) => (
                      <VideoCard key={v.id} video={v} />
                    ))}
                </div>
                {d.videos.some((v) => v.kind === 'short') && (
                  <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {d.videos
                      .filter((v) => v.kind === 'short')
                      .slice(0, 6)
                      .map((v) => (
                        <ShortCard key={v.id} video={v} />
                      ))}
                  </div>
                )}
              </section>
            )}

            {d.people.length > 0 && (
              <section aria-label={tr.t('explore.people')}>
                <h2 className="mb-3 text-lg font-black">{tr.t('explore.people')}</h2>
                <ul className="scroll-thin flex gap-3 overflow-x-auto pb-2">
                  {d.people.map((u) => (
                    <li key={u.id} className="card w-40 shrink-0 p-4 text-center">
                      <Link to={`/u/${u.id}`} className="flex flex-col items-center gap-2">
                        <Avatar name={u.displayName} url={u.avatarUrl} size="lg" online={u.online} />
                        <UserName user={u} link={false} className="max-w-full text-sm" />
                      </Link>
                      <ButtonLink to={`/u/${u.id}`} size="sm" variant="soft" className="mt-3" block>
                        {tr.t('common.follow')}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="grid gap-8 lg:grid-cols-2">
              {d.posts.length > 0 && (
                <section aria-label={tr.t('explore.popularPosts')} className="space-y-4">
                  <h2 className="text-lg font-black">{tr.t('explore.popularPosts')}</h2>
                  {d.posts.slice(0, 4).map((p) => (
                    <PostCard key={p.id} post={p} onPatch={() => undefined} onRemoved={() => undefined} />
                  ))}
                </section>
              )}
              {d.events.length > 0 && (
                <section aria-label={tr.t('explore.events')} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black">{tr.t('explore.events')}</h2>
                    <Link to="/events" className="link text-sm">
                      {tr.t('common.seeAll')}
                    </Link>
                  </div>
                  {d.events.map((e) => (
                    <EventCard key={e.id} event={e} compact />
                  ))}
                </section>
              )}
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
