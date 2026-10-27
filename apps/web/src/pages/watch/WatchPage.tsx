import type { VideoDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, History, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ShortCard, VideoCard } from '@/components/video/VideoCard';
import { ButtonLink } from '@/components/ui/Button';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useFeatureOn } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { usePaged, useSentinel } from '@/lib/infinite';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';

const FEEDS = ['home', 'trending', 'subscriptions', 'new'] as const;
type Feed = (typeof FEEDS)[number];

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function WatchPage() {
  const tr = useT();
  const authed = useSession((s) => s.status === 'authed');
  const canUpload = useFeatureOn('video-upload');
  const [params, setParams] = useSearchParams();
  const feed = (FEEDS as readonly string[]).includes(params.get('feed') ?? '') ? (params.get('feed') as Feed) : 'home';
  const sectionId = params.get('section') ?? undefined;
  const materialId = params.get('subject') ?? undefined;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });

  const set = (k: string, v: string | undefined) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const filters = { feed, sectionId, materialId, q };
  const videos = usePaged<VideoDto>(['videos', 'list', 'video', filters], (cursor) =>
    api.videos.list({ feed, kind: 'video', sectionId, materialId, q: q || undefined, cursor, limit: 24 }),
  );
  const sectionMaterials = taxonomy.data?.sections.find((s) => s.id === sectionId)?.materials ?? [];
  const shorts = useQuery({
    queryKey: ['videos', 'shorts-strip', feed === 'home' && !q && !sectionId],
    queryFn: () => api.videos.list({ feed: 'home', kind: 'short', limit: 8 }),
    enabled: feed === 'home' && !q && !sectionId,
  });
  const sentinel = useSentinel(() => void videos.fetchNextPage(), !!videos.hasNextPage && !videos.isFetchingNextPage);

  const feedChips = FEEDS.filter((f) => f !== 'subscriptions' || authed);
  return (
    <div className="page !max-w-[1500px]">
      <PageHeader
        title={tr.t('watch.title')}
        subtitle={tr.t('watch.subtitle')}
        icon={<Clapperboard className="size-6" />}
        actions={
          <>
            {authed && (
              <ButtonLink to="/watch/library" variant="outline" icon={<History className="size-4" />}>
                {tr.t('watch.history')}
              </ButtonLink>
            )}
            {authed && canUpload && (
              <ButtonLink to="/studio?upload=1" icon={<Upload className="size-4" />}>
                {tr.t('studio.upload')}
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="relative mb-4 max-w-xl">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          className="input ps-10"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr.t('watch.searchPlaceholder')}
          aria-label={tr.t('watch.searchPlaceholder')}
        />
      </div>
      <div className="scroll-thin mb-5 flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label={tr.t('watch.title')}>
        {feedChips.map((f) => (
          <button
            key={f}
            type="button"
            className={cx('chip', feed === f && 'is-active')}
            aria-pressed={feed === f}
            onClick={() => set('feed', f === 'home' ? undefined : f)}
          >
            {tr.t(`watch.feeds.${f}`)}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        {taxonomy.data?.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cx('chip', sectionId === s.id && 'is-active')}
            aria-pressed={sectionId === s.id}
            onClick={() =>
              setParams(
                (p) => {
                  const n = new URLSearchParams(p);
                  n.delete('subject');
                  if (sectionId === s.id) n.delete('section');
                  else n.set('section', s.id);
                  return n;
                },
                { replace: true },
              )
            }
          >
            {s.name}
          </button>
        ))}
      </div>
      {sectionMaterials.length > 0 && (
        <div className="scroll-thin -mt-3 mb-5 flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label={tr.t('feed.subject')}>
          <button type="button" className={cx('chip', !materialId && 'is-active')} aria-pressed={!materialId} onClick={() => set('subject', undefined)}>
            {tr.t('feed.anySubject')}
          </button>
          {sectionMaterials.map((m) => (
            <button
              key={m.id}
              type="button"
              className={cx('chip', materialId === m.id && 'is-active')}
              aria-pressed={materialId === m.id}
              onClick={() => set('subject', materialId === m.id ? undefined : m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {shorts.data && shorts.data.items.length > 0 && (
        <section className="mb-8" aria-label={tr.t('nav.shorts')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">{tr.t('nav.shorts')}</h2>
            <Link to="/shorts" className="link text-sm">
              {tr.t('common.seeAll')}
            </Link>
          </div>
          <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
            {shorts.data.items.map((s) => (
              <div key={s.id} className="w-36 shrink-0 sm:w-44">
                <ShortCard video={s} />
              </div>
            ))}
          </div>
        </section>
      )}

      {videos.isPending ? (
        <CardSkeletons count={6} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
      ) : videos.error ? (
        <ErrorState error={videos.error} onRetry={() => void videos.refetch()} />
      ) : !videos.items.length ? (
        <EmptyState icon={<Clapperboard className="size-7" />} title={tr.t('watch.empty')} />
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.items.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
          <div ref={sentinel} aria-hidden />
          {videos.isFetchingNextPage && <CardSkeletons count={4} className="mt-6 sm:grid-cols-2 lg:grid-cols-4" />}
        </>
      )}
    </div>
  );
}
