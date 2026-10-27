import { parseChapters, type VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Flag, ListPlus, Pencil, Share2, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { RichText } from '@/components/common/RichText';
import { reportContent } from '@/components/common/ReportDialog';
import { LessonChapters, LessonNotes, QuizCheckpoint } from '@/components/video/LessonTools';
import { SaveToPlaylist } from '@/components/video/SaveToPlaylist';
import { SubscribeButton } from '@/components/video/SubscribeButton';
import { VideoComments } from '@/components/video/VideoComments';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { VideoRow } from '@/components/video/VideoCard';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { ErrorState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { compactNumber, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { confirmDialog, toast, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

export default function VideoPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const listId = params.get('list');
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gate = useAuthGate();
  const q = useQuery({ queryKey: ['video', id], queryFn: () => api.videos.get(id) });
  const related = useQuery({ queryKey: ['video-related', id], queryFn: () => api.videos.related(id), enabled: !!q.data });
  const playlist = useQuery({ queryKey: ['playlist', listId], queryFn: () => api.playlists.get(listId!), enabled: !!listId });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [autoplay, setAutoplay] = useState(() => localStorage.getItem('qubedu:autoplay') !== 'off');
  const player = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [ended, setEnded] = useState(false);
  // Arriving from the study inbox ("take the checkpoint quiz") jumps straight to the quiz card.
  const wantsCheckpoint = params.get('checkpoint') === '1';
  useEffect(() => {
    if (!wantsCheckpoint || !q.data?.quiz) return;
    const t = setTimeout(() => document.getElementById('lesson-checkpoint')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
  }, [wantsCheckpoint, q.data?.quiz]);
  const chapters = useMemo(() => (q.data ? parseChapters(q.data.description, q.data.durationSec) : []), [q.data]);
  useEffect(() => {
    setEnded(false);
    setTime(0);
  }, [id]);

  const patch = (fn: (v: VideoDto) => VideoDto) => qc.setQueryData<VideoDto>(['video', id], (v) => (v ? fn(v) : v));
  useEffect(() => {
    if (q.data) document.title = `${q.data.title} · Qubedu`;
    return () => {
      document.title = 'Qubedu';
    };
  }, [q.data]);

  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error('unavailable')} onRetry={() => void q.refetch()} />;
  const video = q.data;

  const nextInList = (() => {
    const vids = playlist.data?.videos;
    const i = vids?.findIndex((v) => v.id === id) ?? -1;
    return vids && i >= 0 ? vids[i + 1] : undefined;
  })();
  const upNext = nextInList ?? related.data?.items[0];

  const react = gate(async (value: 1 | -1) => {
    const next = video.myReaction === value ? 0 : value;
    const prev = video;
    patch((v) => ({
      ...v,
      myReaction: next,
      likes: v.likes + (next === 1 ? 1 : 0) - (v.myReaction === 1 ? 1 : 0),
      dislikes: v.dislikes + (next === -1 ? 1 : 0) - (v.myReaction === -1 ? 1 : 0),
    }));
    try {
      const res = await api.videos.react(video.id, next);
      patch((v) => ({ ...v, likes: res.likes, dislikes: res.dislikes, myReaction: res.myReaction }));
    } catch (e) {
      patch(() => prev);
      toastError(e);
    }
  });

  const share = async () => {
    const url = `${location.origin}/watch/${video.id}`;
    if (navigator.share) await navigator.share({ title: video.title, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast(tr.t('watch.linkCopied'));
    }
  };

  const toggleLater = gate(async () => {
    try {
      const res = await api.videos.watchLater(video.id, !video.watchLater);
      patch((v) => ({ ...v, watchLater: res.watchLater }));
      void qc.invalidateQueries({ queryKey: ['watch-later'] });
    } catch (e) {
      toastError(e);
    }
  });

  const seek = (sec: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = sec;
    setTime(sec);
    void el.play().catch(() => undefined);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const pill = 'btn btn-sm btn-ghost !rounded-none';
  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-0 py-0 md:px-6 md:py-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0">
        <VideoPlayer
          video={video}
          autoPlay={!wantsCheckpoint}
          className="md:rounded-[var(--radius-card)] rounded-none"
          playerRef={player}
          onTime={setTime}
          onEnded={() => {
            // A lesson with a checkpoint quiz stops here so the learner can test what they just watched.
            if (video.quiz) {
              setEnded(true);
              document.getElementById('lesson-checkpoint')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
            }
            if (autoplay && upNext) navigate(`/watch/${upNext.id}${listId ? `?list=${listId}` : ''}`);
          }}
        />
        <div className="px-4 md:px-0">
          <h1 className="mt-3 text-xl font-black md:text-2xl" dir="auto">
            {video.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link to={`/channel/${video.owner.id}`} className="flex min-w-0 items-center gap-3">
              <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size="lg" />
              <div className="min-w-0">
                <UserName user={video.owner} link={false} />
                <p className="muted text-xs">{tr.t('watch.subscribers', { count: compactNumber(video.subscribers, tr) })}</p>
              </div>
            </Link>
            <SubscribeButton
              userId={video.owner.id}
              subscribed={video.subscribed}
              onChange={(s) => patch((v) => ({ ...v, subscribed: s, subscribers: v.subscribers + (s ? 1 : -1) }))}
            />
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-line bg-card">
                <button
                  type="button"
                  className={cx(pill, video.myReaction === 1 && 'text-ink')}
                  aria-pressed={video.myReaction === 1}
                  onClick={() => void react(1)}
                >
                  <ThumbsUp className={cx('size-4', video.myReaction === 1 && 'fill-current')} aria-hidden />{' '}
                  <span className="tabular-nums">{compactNumber(video.likes, tr)}</span>
                  <span className="sr-only">{tr.t('watch.like')}</span>
                </button>
                <span className="my-2 w-px bg-line" aria-hidden />
                <button
                  type="button"
                  className={cx(pill, video.myReaction === -1 && 'text-ink')}
                  aria-pressed={video.myReaction === -1}
                  onClick={() => void react(-1)}
                  aria-label={tr.t('watch.dislike')}
                >
                  <ThumbsDown className={cx('size-4', video.myReaction === -1 && 'fill-current')} aria-hidden />
                </button>
              </div>
              <Button variant="outline" size="sm" className="!rounded-full" icon={<Share2 className="size-4" />} onClick={() => void share()}>
                {tr.t('watch.share')}
              </Button>
              <Button variant="outline" size="sm" className="!rounded-full" icon={<ListPlus className="size-4" />} onClick={gate(() => setSaving(true))}>
                {tr.t('watch.save')}
              </Button>
              <Button
                variant={video.watchLater ? 'soft' : 'outline'}
                size="sm"
                className="!rounded-full"
                icon={<Clock className="size-4" />}
                aria-pressed={video.watchLater}
                onClick={() => void toggleLater()}
              >
                <span className="hidden sm:inline">{video.watchLater ? tr.t('watch.removeWatchLater') : tr.t('watch.watchLater')}</span>
              </Button>
              <Menu
                items={[
                  {
                    label: tr.t('common.edit'),
                    icon: <Pencil className="size-4" />,
                    hidden: !video.canEdit,
                    onSelect: () => navigate(`/studio?edit=${video.id}`),
                  },
                  {
                    label: tr.t('watch.reportVideo'),
                    icon: <Flag className="size-4" />,
                    hidden: video.canEdit,
                    onSelect: gate(() => reportContent({ targetType: 'video', targetId: video.id })),
                  },
                  {
                    label: tr.t('common.delete'),
                    icon: <Trash2 className="size-4" />,
                    danger: true,
                    hidden: !video.canEdit,
                    onSelect: async () => {
                      if (!(await confirmDialog({ title: tr.t('studio.deleteConfirm'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                      try {
                        await api.videos.remove(video.id);
                        navigate('/watch', { replace: true });
                      } catch (e) {
                        toastError(e);
                      }
                    },
                  },
                ]}
              />
            </div>
          </div>

          <div
            className="card mt-4 cursor-pointer p-3 text-sm"
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((x) => !x)}
          >
            <p className="font-bold">
              {tr.t('watch.views', { count: video.views.toLocaleString(tr.intl) })} · {formatDate(video.createdAt, tr)}
              {video.tags.map((t) => (
                <span key={t} className="ms-2 text-ink">
                  #{t}
                </span>
              ))}
            </p>
            <div className={cx('mt-1', !expanded && 'line-clamp-2')}>
              <RichText text={video.description || ' '} />
            </div>
            {(video.section || video.material) && (
              <p className="mt-2 flex flex-wrap gap-2">
                {video.section && <span className="badge badge-primary">{video.section.name}</span>}
                {video.material && <span className="badge">{video.material.name}</span>}
              </p>
            )}
            <span className="link mt-1 inline-block">{expanded ? tr.t('common.showLess') : tr.t('common.showMore')}</span>
          </div>

          <LessonChapters chapters={chapters} time={time} onSeek={seek} />
          {video.quiz && <QuizCheckpoint quiz={video.quiz} highlight={ended || wantsCheckpoint} />}
          <LessonNotes videoId={video.id} time={time} onSeek={seek} />

          <VideoComments video={video} onCount={(d) => patch((v) => ({ ...v, commentCount: v.commentCount + d }))} />
        </div>
      </div>

      <aside className="space-y-2 px-4 md:px-0" aria-label={tr.t('watch.upNext')}>
        {playlist.data && (
          <div className="card mb-3 overflow-hidden">
            <div className="border-b border-line bg-bg-2 p-3">
              <p className="font-black">{playlist.data.playlist.title}</p>
              <p className="muted text-xs">{tr.t('watch.playlistVideos', { count: playlist.data.videos.length })}</p>
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {playlist.data.videos.map((v) => (
                <VideoRow key={v.id} video={v} active={v.id === id} onClick={undefined} />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h2 className="font-black">{tr.t('watch.upNext')}</h2>
          <label className="flex items-center gap-2 text-sm">
            {tr.t('watch.autoplay')}
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={autoplay}
              onChange={(e) => {
                setAutoplay(e.target.checked);
                localStorage.setItem('qubedu:autoplay', e.target.checked ? 'on' : 'off');
              }}
            />
          </label>
        </div>
        {related.isPending && <Spinner className="py-6" />}
        {related.data?.items.map((v) => (
          <VideoRow key={v.id} video={v} />
        ))}
      </aside>
      {saving && <SaveToPlaylist videoId={video.id} onClose={() => setSaving(false)} />}
    </div>
  );
}
