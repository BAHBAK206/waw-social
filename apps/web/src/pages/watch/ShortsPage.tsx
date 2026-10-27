import type { VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Flag, MessageCircle, Share2, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { reportContent } from '@/components/common/ReportDialog';
import { SubscribeButton } from '@/components/video/SubscribeButton';
import { VideoComments } from '@/components/video/VideoComments';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { compactNumber } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

function RailButton({
  label,
  count,
  active,
  onClick,
  children,
}: {
  label: string;
  count?: string | number;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className="flex flex-col items-center gap-1 text-white">
      <span
        className={cx(
          'grid size-12 place-items-center rounded-full bg-black/45 backdrop-blur transition-transform active:scale-90',
          active && 'bg-white/90 text-black',
        )}
      >
        {children}
      </span>
      {count !== undefined && <span className="text-xs font-bold tabular-nums drop-shadow">{count}</span>}
    </button>
  );
}

function Short({
  video,
  active,
  muted,
  onMuted,
  onPatch,
  onComments,
}: {
  video: VideoDto;
  active: boolean;
  muted: boolean;
  onMuted: (m: boolean) => void;
  onPatch: (fn: (v: VideoDto) => VideoDto) => void;
  onComments: () => void;
}) {
  const tr = useT();
  const gate = useAuthGate();
  const react = gate(async (value: 1 | -1) => {
    const next = video.myReaction === value ? 0 : value;
    const prev = video;
    onPatch((v) => ({
      ...v,
      myReaction: next,
      likes: v.likes + (next === 1 ? 1 : 0) - (v.myReaction === 1 ? 1 : 0),
      dislikes: v.dislikes + (next === -1 ? 1 : 0) - (v.myReaction === -1 ? 1 : 0),
    }));
    try {
      const res = await api.videos.react(video.id, next);
      onPatch((v) => ({ ...v, likes: res.likes, dislikes: res.dislikes, myReaction: res.myReaction }));
    } catch (e) {
      onPatch(() => prev);
      toastError(e);
    }
  });
  const share = async () => {
    const url = `${location.origin}/shorts/${video.id}`;
    if (navigator.share) await navigator.share({ title: video.title, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast(tr.t('watch.linkCopied'));
    }
  };
  return (
    <section data-short={video.id} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black" aria-label={video.title}>
      <VideoPlayer video={video} vertical active={active} autoPlay muted={muted} onMutedChange={onMuted} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 pb-6 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={`/channel/${video.owner.id}`} className="flex min-w-0 items-center gap-2">
              <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size="sm" />
              <span className="truncate font-bold drop-shadow">{video.owner.displayName}</span>
            </Link>
            <SubscribeButton userId={video.owner.id} subscribed={video.subscribed} onChange={(s) => onPatch((v) => ({ ...v, subscribed: s }))} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm drop-shadow" dir="auto">
            {video.title}
          </p>
          {video.tags.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-2 text-sm font-bold">
              {video.tags.slice(0, 4).map((t) => (
                <Link key={t} to={`/explore/tag/${encodeURIComponent(t)}`} className="drop-shadow">
                  #{t}
                </Link>
              ))}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-4">
          <RailButton label={tr.t('watch.like')} count={compactNumber(video.likes, tr)} active={video.myReaction === 1} onClick={() => void react(1)}>
            <ThumbsUp className={cx('size-6', video.myReaction === 1 && 'fill-current')} />
          </RailButton>
          <RailButton label={tr.t('watch.dislike')} active={video.myReaction === -1} onClick={() => void react(-1)}>
            <ThumbsDown className={cx('size-6', video.myReaction === -1 && 'fill-current')} />
          </RailButton>
          <RailButton label={tr.t('watch.comments', { count: video.commentCount })} count={compactNumber(video.commentCount, tr)} onClick={onComments}>
            <MessageCircle className="size-6" />
          </RailButton>
          <RailButton label={tr.t('watch.share')} onClick={() => void share()}>
            <Share2 className="size-6" />
          </RailButton>
          <RailButton label={muted ? tr.t('watch.unmute') : tr.t('watch.mute')} onClick={() => onMuted(!muted)}>
            {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
          </RailButton>
          {!video.canEdit && (
            <RailButton label={tr.t('watch.reportVideo')} onClick={gate(() => reportContent({ targetType: 'video', targetId: video.id }))}>
              <Flag className="size-5" />
            </RailButton>
          )}
        </div>
      </div>
    </section>
  );
}

export default function ShortsPage() {
  const { id: startId } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<VideoDto[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(startId ?? null);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const first = useQuery({ queryKey: ['shorts', 'start', startId], queryFn: () => (startId ? api.videos.get(startId) : Promise.resolve(null)) });

  const loadMore = useCallback(async () => {
    if (loading || cursor === null) return;
    setLoading(true);
    try {
      const page = await api.videos.list({ feed: 'home', kind: 'short', cursor: cursor ?? undefined, limit: 8 });
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor);
    } catch (e) {
      toastError(e);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  useEffect(() => {
    if (first.isPending) return;
    if (first.data?.kind === 'short') setItems([first.data]);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first.isPending]);

  // Track which short is centered; load more near the end.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const id = (e.target as HTMLElement).dataset.short ?? null;
            setActiveId(id);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('[data-short]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  useEffect(() => {
    const idx = items.findIndex((i) => i.id === activeId);
    if (idx >= 0 && idx >= items.length - 3) void loadMore();
    if (activeId && activeId !== startId) window.history.replaceState(null, '', `/shorts/${activeId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const step = useCallback((dir: 1 | -1) => {
    const root = scroller.current;
    if (root) root.scrollBy({ top: dir * root.clientHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (commentsFor || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Escape') navigate('/watch');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, navigate, commentsFor]);

  const patch = (id: string) => (fn: (v: VideoDto) => VideoDto) => {
    setItems((prev) => prev.map((v) => (v.id === id ? fn(v) : v)));
    void qc.invalidateQueries({ queryKey: ['video', id] });
  };
  const commentVideo = items.find((i) => i.id === commentsFor);

  if (first.isPending || (loading && !items.length)) return <Spinner className="min-h-[70dvh]" />;
  if (!items.length) return <EmptyState className="py-24" title={tr.t('watch.empty')} />;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-4rem)] max-w-[480px] items-center justify-center md:h-[calc(100dvh-4rem)] md:py-3 lg:gap-4">
      <div className="relative h-full w-full overflow-hidden bg-black md:rounded-2xl">
        <div ref={scroller} className="scroll-thin h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none]">
          {items.map((v) => (
            <div key={v.id} className="h-full w-full">
              <Short video={v} active={v.id === activeId} muted={muted} onMuted={setMuted} onPatch={patch(v.id)} onComments={() => setCommentsFor(v.id)} />
            </div>
          ))}
          {loading && (
            <div className="grid h-24 place-items-center text-white">
              <Spinner />
            </div>
          )}
        </div>
        <div className="absolute start-3 top-3 hidden flex-col gap-2 md:flex">
          <button
            type="button"
            className="icon-btn bg-black/45 text-white hover:bg-black/70 hover:text-white"
            aria-label={tr.t('common.previous')}
            onClick={() => step(-1)}
          >
            <ChevronUp className="size-5" />
          </button>
          <button
            type="button"
            className="icon-btn bg-black/45 text-white hover:bg-black/70 hover:text-white"
            aria-label={tr.t('common.next')}
            onClick={() => step(1)}
          >
            <ChevronDown className="size-5" />
          </button>
        </div>
      </div>
      {commentVideo && (
        <Modal open onClose={() => setCommentsFor(null)} title={tr.t('watch.comments', { count: commentVideo.commentCount })} size="md">
          <VideoComments video={commentVideo} onCount={(d) => patch(commentVideo.id)((v) => ({ ...v, commentCount: v.commentCount + d }))} />
        </Modal>
      )}
    </div>
  );
}
