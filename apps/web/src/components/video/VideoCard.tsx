import type { VideoDto } from '@qubedu/shared';
import { Lock, EyeOff, Play } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { compactNumber, formatClock, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

export function Thumb({
  video,
  className,
  ratio = 'aspect-video',
}: {
  video: Pick<VideoDto, 'thumbnailUrl' | 'durationSec' | 'progressSec' | 'title'>;
  className?: string;
  ratio?: string;
}) {
  const watched = video.progressSec > 0 ? Math.min(100, (video.progressSec / video.durationSec) * 100) : 0;
  return (
    <div className={cx('relative overflow-hidden rounded-[var(--radius-control)] bg-bg-3', ratio, className)}>
      {video.thumbnailUrl ? (
        <img
          src={fileUrl(video.thumbnailUrl)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="surface-gradient grid size-full place-items-center opacity-80">
          <Play className="size-10" aria-hidden />
        </div>
      )}
      <span className="absolute end-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums" dir="ltr">
        {formatClock(video.durationSec)}
      </span>
      {watched > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40" aria-hidden>
          <span className="block h-full bg-err-fill" style={{ width: `${watched}%` }} />
        </span>
      )}
    </div>
  );
}

export function VideoMeta({ video }: { video: VideoDto }) {
  const tr = useT();
  return (
    <>
      {tr.t('watch.views', { count: compactNumber(video.views, tr) })} · {relativeTime(video.createdAt, tr)}
    </>
  );
}

/** Grid card (home, search, channel). */
export function VideoCard({ video, onClick }: { video: VideoDto; onClick?: () => void }) {
  const tr = useT();
  return (
    <article className="group min-w-0">
      <Link to={`/watch/${video.id}`} onClick={onClick} className="block" aria-label={video.title}>
        <Thumb video={video} />
      </Link>
      <div className="mt-2.5 flex gap-3">
        <Link to={`/channel/${video.owner.id}`} className="shrink-0" aria-label={video.owner.displayName}>
          <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/watch/${video.id}`} className="line-clamp-2 leading-snug font-bold" dir="auto">
            {video.title}
          </Link>
          <Link to={`/channel/${video.owner.id}`} className="muted mt-0.5 block truncate text-sm hover:text-fg">
            {video.owner.displayName}
          </Link>
          <p className="muted flex items-center gap-1 text-sm">
            <VideoMeta video={video} />
            {video.visibility === 'private' && <Lock className="size-3" aria-label={tr.t('watch.privateBadge')} />}
            {video.visibility === 'unlisted' && <EyeOff className="size-3" aria-label={tr.t('watch.unlistedBadge')} />}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Compact row (related videos, playlists, history). */
export function VideoRow({ video, active, trailing, onClick }: { video: VideoDto; active?: boolean; trailing?: React.ReactNode; onClick?: () => void }) {
  return (
    <article className={cx('group flex gap-3 rounded-[var(--radius-control)] p-1.5', active && 'bg-soft')}>
      <Link to={`/watch/${video.id}`} onClick={onClick} className="w-40 shrink-0 sm:w-44" aria-label={video.title}>
        <Thumb video={video} />
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link to={`/watch/${video.id}`} onClick={onClick} className="line-clamp-2 text-sm leading-snug font-bold" dir="auto">
          {video.title}
        </Link>
        <Link to={`/channel/${video.owner.id}`} className="muted block truncate text-xs hover:text-fg">
          {video.owner.displayName}
        </Link>
        <p className="muted text-xs">
          <VideoMeta video={video} />
        </p>
      </div>
      {trailing}
    </article>
  );
}

export function ShortCard({ video }: { video: VideoDto }) {
  const tr = useT();
  return (
    <Link to={`/shorts/${video.id}`} className="group block min-w-0" aria-label={video.title}>
      <Thumb video={video} ratio="aspect-[9/16]" />
      <p className="mt-1.5 line-clamp-2 text-sm leading-snug font-bold" dir="auto">
        {video.title}
      </p>
      <p className="muted text-xs">{tr.t('watch.views', { count: compactNumber(video.views, tr) })}</p>
    </Link>
  );
}
