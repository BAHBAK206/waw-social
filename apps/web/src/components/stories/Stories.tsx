import { LIMITS, type StoryDto, type StoryGroupDto, type StoryViewerDto, STORY_REACTIONS } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Flag, Image as ImageIcon, Plus, Trash2, Type, Video, X } from 'lucide-react';
import { reportContent } from '@/components/common/ReportDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useFeatureOn } from '@/lib/features';
import { confirmDialog, toast, toastError } from '@/lib/ui';

const TRAY_KEY = ['stories', 'tray'] as const;
const EMOJIS = STORY_REACTIONS;
const BACKGROUNDS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#2d3436', '#e84393', '#fdcb6e'];

function useTray() {
  const me = useSession((s) => s.me);
  return useQuery({ queryKey: TRAY_KEY, queryFn: () => api.stories.tray(), enabled: !!me, staleTime: 60_000, refetchInterval: 5 * 60_000 });
}

export function StoriesTray() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const enabled = useFeatureOn('stories');
  const tray = useTray();
  const [open, setOpen] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  if (!me || !enabled) return null;
  const groups = tray.data?.items ?? [];
  const mine = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);

  return (
    <section aria-label={tr.t('stories.title')} className="card p-3">
      <ul className="scroll-thin flex gap-3 overflow-x-auto pb-1">
        <li className="shrink-0">
          <div className="flex w-[72px] flex-col items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => (mine ? setOpen(groups.indexOf(mine)) : setComposing(true))}
                className={cx('rounded-full p-[3px]', mine ? 'bg-[linear-gradient(135deg,var(--grad-from),var(--grad-to))]' : 'bg-bg-3')}
                aria-label={mine ? tr.t('stories.yourStory') : tr.t('stories.add')}
              >
                <span className="block rounded-full bg-[var(--card-solid)] p-[2px]">
                  <Avatar name={me.displayName} url={me.avatarUrl} size="lg" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="surface-gradient absolute -end-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full ring-2 ring-[var(--card-solid)]"
                aria-label={tr.t('stories.add')}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <span className="max-w-full truncate text-xs font-bold">{tr.t('stories.yourStory')}</span>
          </div>
        </li>
        {others.map((g) => (
          <li key={g.author.id} className="shrink-0">
            <button type="button" className="flex w-[72px] flex-col items-center gap-1.5" onClick={() => setOpen(groups.indexOf(g))}>
              <span className={cx('rounded-full p-[3px]', g.allViewed ? 'bg-line' : 'bg-[linear-gradient(135deg,var(--grad-from),var(--grad-to))]')}>
                <span className="block rounded-full bg-[var(--card-solid)] p-[2px]">
                  <Avatar name={g.author.displayName} url={g.author.avatarUrl} size="lg" />
                </span>
              </span>
              <span className={cx('max-w-full truncate text-xs', g.allViewed ? 'text-fg-3' : 'font-bold')}>{g.author.displayName}</span>
            </button>
          </li>
        ))}
        {!others.length && !tray.isPending && <li className="muted flex items-center px-2 text-sm">{tr.t('stories.empty')}</li>}
      </ul>
      {open !== null && groups.length > 0 && <StoryViewer groups={groups} start={open} onClose={() => setOpen(null)} />}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
    </section>
  );
}

function StoryComposer({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'text' | 'image' | 'video'>('text');
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[0]!);
  const [media, setMedia] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [duration, setDuration] = useState(6);
  const [busy, setBusy] = useState(false);

  const ready = tab === 'text' ? text.trim().length > 0 : !!media && media.kind === tab;
  const publish = async () => {
    setBusy(true);
    try {
      await api.stories.create(
        tab === 'text'
          ? { mediaKind: 'text', text: text.trim(), bgColor: bg, durationSec: 6 }
          : { mediaKind: tab, mediaUrl: media!.url, text: text.trim(), durationSec: tab === 'video' ? duration : 6 },
      );
      toast(tr.t('stories.shared'));
      await qc.invalidateQueries({ queryKey: TRAY_KEY });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { key: 'text' as const, label: tr.t('stories.textTab'), icon: Type },
    { key: 'image' as const, label: tr.t('stories.photoTab'), icon: ImageIcon },
    { key: 'video' as const, label: tr.t('stories.videoTab'), icon: Video },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('stories.create')}
      size="sm"
      footer={
        <Button disabled={!ready} loading={busy} onClick={() => void publish()}>
          {tr.t('stories.share')}
        </Button>
      }
    >
      <div className="tabs mb-4" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className="tab" onClick={() => setTab(t.key)}>
            <t.icon className="size-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <div className="mx-auto aspect-[9/16] max-h-[55vh] overflow-hidden rounded-2xl" style={{ background: tab === 'text' ? bg : 'var(--bg-3)' }}>
        {tab === 'text' ? (
          <textarea
            className="size-full resize-none bg-transparent p-6 text-center text-2xl font-black text-white outline-none placeholder:text-white/70"
            placeholder={tr.t('stories.textPlaceholder')}
            value={text}
            maxLength={LIMITS.storyTextMax}
            onChange={(e) => setText(e.target.value)}
            dir="auto"
            aria-label={tr.t('stories.textPlaceholder')}
          />
        ) : media && media.kind === tab ? (
          media.kind === 'image' ? (
            <img src={fileUrl(media.url)} alt="" className="size-full object-cover" />
          ) : (
            <video
              src={fileUrl(media.url)}
              className="size-full object-cover"
              muted
              playsInline
              controls
              onLoadedMetadata={(e) => {
                const d = Math.ceil(e.currentTarget.duration);
                if (d > 30) {
                  toast(tr.t('stories.videoTooLong'), 'err');
                  setMedia(null);
                } else setDuration(Math.max(1, d));
              }}
            />
          )
        ) : (
          <div className="grid size-full place-items-center p-4 text-center">
            <UploadButton
              purpose="story"
              imageOnly={tab === 'image'}
              accept={tab === 'image' ? 'image/*' : 'video/mp4,video/webm,video/quicktime'}
              variant="soft"
              onUploaded={(r) => setMedia({ url: r.url, kind: r.kind === 'video' ? 'video' : 'image' })}
            >
              {tr.t('stories.pickMedia')}
            </UploadButton>
          </div>
        )}
      </div>
      {tab === 'text' ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2" role="radiogroup" aria-label={tr.t('stories.background')}>
          {BACKGROUNDS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={bg === c}
              aria-label={c}
              onClick={() => setBg(c)}
              className={cx('size-8 rounded-full ring-offset-2 ring-offset-[var(--card-solid)]', bg === c && 'ring-2 ring-[var(--primary)]')}
              style={{ background: c }}
            />
          ))}
        </div>
      ) : (
        media && (
          <input
            className="input mt-3"
            placeholder={tr.t('stories.textPlaceholder')}
            value={text}
            maxLength={LIMITS.storyTextMax}
            onChange={(e) => setText(e.target.value)}
            aria-label={tr.t('stories.textPlaceholder')}
          />
        )
      )}
    </Modal>
  );
}

function ViewersList({ story }: { story: StoryDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['stories', 'viewers', story.id], queryFn: () => api.stories.viewers(story.id) });
  const items: StoryViewerDto[] = q.data?.items ?? [];
  return (
    <div className="max-h-60 overflow-y-auto rounded-t-2xl bg-[var(--card-solid)] p-3 text-fg">
      <p className="mb-2 font-black">{tr.t('stories.viewers', { count: items.length })}</p>
      {!items.length && !q.isPending && <p className="muted text-sm">{tr.t('stories.noViewers')}</p>}
      <ul className="space-y-2">
        {items.map((v) => (
          <li key={v.user.id} className="flex items-center gap-2">
            <Avatar name={v.user.displayName} url={v.user.avatarUrl} size="sm" />
            <span className="flex-1 truncate text-sm font-bold">{v.user.displayName}</span>
            <span className="muted text-xs">{relativeTime(v.viewedAt, tr)}</span>
            {v.reaction && <span aria-hidden>{v.reaction}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoryViewer({ groups, start, onClose }: { groups: StoryGroupDto[]; start: number; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [gi, setGi] = useState(start);
  const group = groups[gi]!;
  const firstUnseen = Math.max(
    0,
    group.stories.findIndex((s) => !s.viewed),
  );
  const [si, setSi] = useState(group.isMine ? 0 : firstUnseen);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const story = group.stories[si] ?? group.stories[0]!;
  const dur = Math.max(1, story.durationSec) * 1000;

  const goNext = useCallback(() => {
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      const g = groups[gi + 1]!;
      setSi(
        g.isMine
          ? 0
          : Math.max(
              0,
              g.stories.findIndex((s) => !s.viewed),
            ),
      );
    } else onClose();
  }, [si, gi, group.stories.length, groups, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(groups[gi - 1]!.stories.length - 1);
    }
  }, [si, gi, groups]);

  // Mark as viewed once per story and reset the progress bar.
  useEffect(() => {
    setProgress(0);
    setShowViewers(false);
    setReaction(story.myReaction);
    if (!group.isMine && !story.viewed) {
      void api.stories.view(story.id).catch(() => undefined);
      story.viewed = true;
    }
  }, [story.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      void qc.invalidateQueries({ queryKey: TRAY_KEY });
    },
    [qc],
  );

  // Progress timer (videos follow their own playback clock).
  useEffect(() => {
    if (paused || showViewers) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const next = story.mediaKind === 'video' && video.current && video.current.duration ? video.current.currentTime / video.current.duration : p + dt / dur;
        return Math.min(1, next);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, showViewers, dur, story.id, story.mediaKind]);

  useEffect(() => {
    if (progress >= 1) goNext();
  }, [progress, goNext]);

  useEffect(() => {
    if (video.current) {
      if (paused || showViewers) video.current.pause();
      else void video.current.play().catch(() => undefined);
    }
  }, [paused, showViewers, story.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'Escape') onClose();
      else if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) goNext();
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) goPrev();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [goNext, goPrev, onClose]);

  const react = async (emoji: string) => {
    const next = reaction === emoji ? null : emoji;
    setReaction(next);
    try {
      await api.stories.react(story.id, next);
      story.myReaction = next;
    } catch (e) {
      setReaction(story.myReaction);
      toastError(e);
    }
  };

  const remove = async () => {
    setPaused(true);
    if (!(await confirmDialog({ title: tr.t('stories.deleteConfirm'), danger: true, confirmLabel: tr.t('common.delete') }))) {
      setPaused(false);
      return;
    }
    try {
      await api.stories.remove(story.id);
      await qc.invalidateQueries({ queryKey: TRAY_KEY });
      onClose();
    } catch (e) {
      toastError(e);
      setPaused(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={tr.t('stories.title')}>
      <div className="relative h-full w-full max-w-[480px] overflow-hidden bg-neutral-900 text-white md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-2xl">
        {/* media */}
        <div className="absolute inset-0" style={{ background: story.mediaKind === 'text' ? story.bgColor : '#111' }}>
          {story.mediaKind === 'image' && story.mediaUrl && <img src={fileUrl(story.mediaUrl)} alt="" className="size-full object-contain" />}
          {story.mediaKind === 'video' && story.mediaUrl && (
            <video key={story.id} ref={video} src={fileUrl(story.mediaUrl)} className="size-full object-contain" playsInline autoPlay />
          )}
          {story.mediaKind === 'text' && (
            <p className="grid size-full place-items-center p-8 text-center text-3xl leading-snug font-black" dir="auto" style={{ overflowWrap: 'anywhere' }}>
              {story.text}
            </p>
          )}
          {story.mediaKind !== 'text' && story.text && (
            <p className="absolute inset-x-4 bottom-28 rounded-xl bg-black/50 p-3 text-center text-lg font-bold" dir="auto">
              {story.text}
            </p>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />

        {/* tap zones: start side = previous, end side = next, hold to pause */}
        <div
          className="absolute inset-0 flex"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          <button type="button" className="h-full w-1/3 cursor-w-resize" aria-label={tr.t('common.previous')} onClick={goPrev} />
          <span className="h-full flex-1" />
          <button type="button" className="h-full w-1/3 cursor-e-resize" aria-label={tr.t('common.next')} onClick={goNext} />
        </div>

        {/* header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
          <div className="flex gap-1" aria-hidden>
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/35">
                <div className="h-full bg-white" style={{ width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <Avatar name={group.author.displayName} url={group.author.avatarUrl} size="sm" />
            <span className="font-bold">{group.isMine ? tr.t('stories.yourStory') : group.author.displayName}</span>
            <span className="text-xs text-white/75">{relativeTime(story.createdAt, tr)}</span>
            <span className="flex-1" />
            {group.isMine && (
              <button
                type="button"
                className="icon-btn icon-btn-sm text-white hover:bg-white/20 hover:text-white"
                aria-label={tr.t('stories.delete')}
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
              </button>
            )}
            {!group.isMine && (
              <button
                type="button"
                className="icon-btn icon-btn-sm text-white hover:bg-white/20 hover:text-white"
                aria-label={tr.t('common.report')}
                onClick={() => {
                  onClose();
                  reportContent({ targetType: 'story', targetId: story.id });
                }}
              >
                <Flag className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="icon-btn icon-btn-sm text-white hover:bg-white/20 hover:text-white"
              aria-label={tr.t('common.close')}
              onClick={onClose}
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* footer */}
        <div className="absolute inset-x-0 bottom-0">
          {showViewers && group.isMine ? (
            <ViewersList story={story} />
          ) : (
            <div className="bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
              {group.isMine ? (
                <button
                  type="button"
                  className="mx-auto flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur"
                  onClick={() => setShowViewers(true)}
                >
                  <Eye className="size-4" /> {tr.t('stories.viewers', { count: story.viewCount })}
                </button>
              ) : (
                <div className="flex justify-center gap-1.5" role="group" aria-label={tr.t('stories.react')}>
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => void react(e)}
                      aria-pressed={reaction === e}
                      aria-label={e}
                      className={cx(
                        'grid size-11 place-items-center rounded-full text-2xl transition-transform hover:scale-110',
                        reaction === e ? 'bg-white/30' : 'bg-white/10',
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {showViewers && (
            <button
              type="button"
              className="absolute end-3 top-2 icon-btn icon-btn-sm bg-black/30 text-white"
              aria-label={tr.t('common.close')}
              onClick={() => setShowViewers(false)}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
