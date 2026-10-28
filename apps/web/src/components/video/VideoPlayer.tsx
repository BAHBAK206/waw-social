import { toVtt, type CaptionTrackDto, type VideoDto } from '@qubedu/shared';
import { LOCALE_NAMES } from '@qubedu/i18n';
import type Hls from 'hls.js';
import { Gauge, Play, RotateCcw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/ui';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Props {
  video: VideoDto;
  autoPlay?: boolean;
  /** Called when playback ends (autoplay next / playlist). */
  onEnded?: () => void;
  className?: string;
  /** Shorts mode: fills a vertical frame, loops, no resume prompt. */
  vertical?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  active?: boolean;
  /** Receives the underlying <video> element so the page can seek (chapters, notes). */
  playerRef?: { current: HTMLVideoElement | null };
  /** Whole-second playback position, reported when it changes. */
  onTime?: (sec: number) => void;
  /** Caption tracks (shown with the player's CC button); `captionLanguage` is on by default. */
  captions?: CaptionTrackDto[];
  captionLanguage?: string;
}

/**
 * Video element with: resume prompt, keyboard shortcuts (space/k, j/l ±10s, ←/→ ±5s, f, m, </> speed),
 * a counted view after a few seconds of real playback, and periodic progress sync for watch history.
 */
export function VideoPlayer({
  video,
  autoPlay,
  onEnded,
  className,
  vertical,
  muted,
  onMutedChange,
  active = true,
  playerRef,
  onTime,
  captions,
  captionLanguage,
}: Props) {
  const tr = useT();
  const authed = useSession((s) => s.status === 'authed');
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [resumeAt, setResumeAt] = useState(!vertical && video.progressSec > 5 ? video.progressSec : 0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const counted = useRef(false);
  const playedSec = useRef(0);
  const lastSync = useRef(0);
  const lastWhole = useRef(-1);
  const stream = useAdaptiveStream(ref, video);
  const trackUrls = useCaptionUrls(captions);
  const [qualityOpen, setQualityOpen] = useState(false);

  useEffect(() => {
    counted.current = false;
    playedSec.current = 0;
    lastSync.current = 0;
    setResumeAt(!vertical && video.progressSec > 5 ? video.progressSec : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  const sync = useCallback(
    (completed = false) => {
      const el = ref.current;
      if (!authed || !el || !el.currentTime) return;
      void api.videos
        .progress(video.id, el.currentTime, completed || el.currentTime >= video.durationSec - 3)
        .then((r) => {
          if (r.xpEarned > 0) toast(tr.t('watch.lessonXp', { xp: r.xpEarned }));
        })
        .catch(() => undefined);
    },
    [authed, video.id, video.durationSec, tr],
  );

  // Pause + report when leaving the page or the tab.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && sync();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      sync();
    };
  }, [sync]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) el.pause();
    else if (autoPlay) void el.play().catch(() => undefined);
  }, [active, autoPlay, video.id]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const seek = (delta: number) => {
    const el = ref.current;
    if (el) el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    switch (e.key.toLowerCase()) {
      case ' ':
      case 'k':
        if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === ' ') return;
        e.preventDefault();
        toggle();
        break;
      case 'j':
        seek(-10);
        break;
      case 'l':
        seek(10);
        break;
      case 'arrowleft':
        e.preventDefault();
        seek(-5);
        break;
      case 'arrowright':
        e.preventDefault();
        seek(5);
        break;
      case 'f':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void wrap.current?.requestFullscreen?.();
        break;
      case 'm':
        el.muted = !el.muted;
        onMutedChange?.(el.muted);
        break;
      case '>':
      case '.':
        changeSpeed(Math.min(2, SPEEDS[SPEEDS.indexOf(speed) + 1] ?? 2));
        break;
      case '<':
      case ',':
        changeSpeed(Math.max(0.5, SPEEDS[SPEEDS.indexOf(speed) - 1] ?? 0.5));
        break;
      case '0':
        el.currentTime = 0;
        break;
    }
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (ref.current) ref.current.playbackRate = s;
  };

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKey}
      className={cx(
        'group relative overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        vertical ? 'h-full w-full' : 'aspect-video w-full rounded-[var(--radius-card)]',
        className,
      )}
      aria-label={video.title}
    >
      <video
        ref={(el) => {
          ref.current = el;
          if (playerRef) playerRef.current = el;
        }}
        key={video.id}
        src={video.streamUrl ? undefined : fileUrl(video.videoUrl)}
        poster={fileUrl(video.thumbnailUrl)}
        className={cx('size-full', vertical ? 'object-cover' : 'object-contain')}
        controls={!vertical}
        playsInline
        preload="metadata"
        loop={vertical}
        muted={muted}
        onClick={vertical ? toggle : undefined}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
        }}
        onPlay={() => setResumeAt(0)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (onTime) {
            const whole = Math.floor(el.currentTime);
            if (whole !== lastWhole.current) {
              lastWhole.current = whole;
              onTime(whole);
            }
          }
          if (!el.paused) playedSec.current = Math.max(playedSec.current, el.currentTime);
          // A view counts after 5 s of actual playback (or half of a very short clip).
          if (!counted.current && playedSec.current >= Math.min(5, video.durationSec / 2)) {
            counted.current = true;
            void api.videos.view(video.id).catch(() => undefined);
          }
          if (authed && !vertical && el.currentTime - lastSync.current >= 15) {
            lastSync.current = el.currentTime;
            sync();
          }
        }}
        onPause={() => sync()}
        onEnded={() => {
          sync(true);
          onEnded?.();
        }}
      >
        {trackUrls.map((t) => (
          <track
            key={`${t.language}-${t.url}`}
            kind="subtitles"
            srcLang={t.language}
            label={LOCALE_NAMES[t.language]}
            src={t.url}
            default={t.language === captionLanguage}
          />
        ))}
      </video>
      {resumeAt > 0 && (
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/75 p-2 text-sm text-white backdrop-blur">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              if (ref.current) {
                ref.current.currentTime = resumeAt;
                void ref.current.play();
              }
              setResumeAt(0);
            }}
          >
            <Play className="size-4" /> {tr.t('watch.resume', { time: formatClock(resumeAt) })}
          </button>
          <button type="button" className="btn btn-sm btn-ghost text-white hover:text-white" onClick={() => setResumeAt(0)}>
            <RotateCcw className="size-4" /> {tr.t('watch.startOver')}
          </button>
        </div>
      )}
      {!vertical && (
        <div className="absolute end-3 top-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <div className="relative">
            <button
              type="button"
              className="btn btn-sm bg-black/70 text-white hover:bg-black/90"
              aria-haspopup="menu"
              aria-expanded={speedOpen}
              onClick={() => setSpeedOpen((o) => !o)}
            >
              <Gauge className="size-4" /> {speed}×
            </button>
            {stream.levels.length > 1 && (
              <button
                type="button"
                className="btn btn-sm ms-1 bg-black/70 text-white hover:bg-black/90"
                aria-haspopup="menu"
                aria-expanded={qualityOpen}
                aria-label={tr.t('watch.quality')}
                onClick={() => {
                  setSpeedOpen(false);
                  setQualityOpen((o) => !o);
                }}
              >
                <Settings2 className="size-4" /> {stream.level < 0 ? tr.t('watch.qualityAuto') : `${stream.levels[stream.level]}p`}
              </button>
            )}
            {qualityOpen && (
              <div role="menu" className="card absolute end-0 z-10 mt-1 w-28 overflow-hidden bg-[var(--card-solid)] py-1">
                {[-1, ...stream.levels.map((_, i) => i)].map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitemradio"
                    aria-checked={i === stream.level}
                    className={cx('flex min-h-9 w-full items-center justify-center text-sm font-bold hover:bg-bg-3', i === stream.level && 'text-ink')}
                    onClick={() => {
                      stream.setLevel(i);
                      setQualityOpen(false);
                    }}
                  >
                    {i < 0 ? tr.t('watch.qualityAuto') : `${stream.levels[i]}p`}
                  </button>
                ))}
              </div>
            )}
            {speedOpen && (
              <div role="menu" className="card absolute end-0 z-10 mt-1 w-24 overflow-hidden bg-[var(--card-solid)] py-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s === speed}
                    className={cx('flex min-h-9 w-full items-center justify-center text-sm font-bold hover:bg-bg-3', s === speed && 'text-ink')}
                    onClick={() => {
                      changeSpeed(s);
                      setSpeedOpen(false);
                    }}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Plays the adaptive stream (360p/720p/1080p, picked by connection speed) when the lesson has one: natively on Safari,
 * through hls.js elsewhere (loaded only when needed). Falls back to the original file on any fatal stream error.
 */
function useAdaptiveStream(ref: { current: HTMLVideoElement | null }, video: VideoDto) {
  const [levels, setLevels] = useState<number[]>([]);
  const [level, setLevelState] = useState(-1);
  const hls = useRef<Hls | null>(null);
  useEffect(() => {
    const el = ref.current;
    const src = fileUrl(video.streamUrl);
    setLevels([]);
    setLevelState(-1);
    if (!el || !src) return;
    const original = fileUrl(video.videoUrl)!;
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = src;
      return;
    }
    let cancelled = false;
    void import('hls.js')
      .then(({ default: HlsClass }) => {
        if (cancelled) return;
        if (!HlsClass.isSupported()) {
          el.src = original;
          return;
        }
        const h = new HlsClass({ capLevelToPlayerSize: true, startLevel: -1 });
        h.on(HlsClass.Events.MANIFEST_PARSED, (_e, d) => setLevels(d.levels.map((l) => l.height)));
        h.on(HlsClass.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          h.destroy();
          hls.current = null;
          setLevels([]);
          const at = el.currentTime;
          el.src = original;
          el.currentTime = at;
        });
        h.loadSource(src);
        h.attachMedia(el);
        hls.current = h;
      })
      .catch(() => {
        if (!cancelled) el.src = original;
      });
    return () => {
      cancelled = true;
      hls.current?.destroy();
      hls.current = null;
    };
  }, [ref, video.id, video.streamUrl, video.videoUrl]);
  const setLevel = (i: number) => {
    setLevelState(i);
    if (hls.current) hls.current.currentLevel = i;
  };
  return { levels, level, setLevel };
}

/** In-memory WebVTT files for <track> (works for private lessons too: no extra request with credentials). */
function useCaptionUrls(captions: CaptionTrackDto[] | undefined) {
  const urls = useMemo(
    () => (captions ?? []).map((c) => ({ language: c.language, url: URL.createObjectURL(new Blob([toVtt(c.cues)], { type: 'text/vtt' })) })),
    [captions],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u.url)), [urls]);
  return urls;
}
