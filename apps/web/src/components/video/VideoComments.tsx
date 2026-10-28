import type { VideoCommentDto, VideoDto } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Flag, Pin, PinOff, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { reportContent } from '@/components/common/ReportDialog';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { LoadMore, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { useSession } from '@/lib/session';
import { confirmDialog, toastError } from '@/lib/ui';
import { MathText } from '@/components/common/Math';

type Sort = 'top' | 'new';

function CommentBox({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(!!autoFocus);
  if (!me) return null;
  return (
    <form
      className="flex gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setBusy(true);
        try {
          await onSubmit(t);
          setText('');
          onCancel?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <input
          className="input rounded-none border-0 border-b border-line bg-transparent px-0 focus:shadow-none"
          value={text}
          autoFocus={autoFocus}
          maxLength={1000}
          placeholder={placeholder}
          aria-label={placeholder}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
        />
        {(focused || text) && (
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setText('');
                setFocused(false);
                onCancel?.();
              }}
            >
              {tr.t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
              {submitLabel}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

function Replies({ video, parent }: { video: VideoDto; parent: VideoCommentDto }) {
  const tr = useT();
  const key = ['video-replies', parent.id];
  const list = usePaged<VideoCommentDto>(key, (cursor) => api.videos.comments(video.id, { parentId: parent.id, cursor, limit: 10 }));
  if (list.isPending) return <Spinner className="py-2" />;
  return (
    <div className="mt-2 space-y-3">
      {list.items.map((r) => (
        <CommentItem key={r.id} video={video} comment={r} isReply onChanged={() => void list.refetch()} />
      ))}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      {!list.items.length && <p className="muted text-sm">{tr.t('feed.noComments')}</p>}
    </div>
  );
}

function CommentItem({ video, comment, isReply, onChanged }: { video: VideoDto; comment: VideoCommentDto; isReply?: boolean; onChanged: () => void }) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [c, setC] = useState(comment);
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const owner = me?.id === video.owner.id;
  const mine = me?.id === c.author.id;

  const like = async () => {
    if (!me) return;
    const next = !c.liked;
    setC({ ...c, liked: next, likes: c.likes + (next ? 1 : -1) });
    try {
      const res = await api.videos.likeComment(video.id, c.id, next);
      setC((x) => ({ ...x, liked: res.liked, likes: res.likes }));
    } catch (e) {
      setC(c);
      toastError(e);
    }
  };

  return (
    <div className="flex gap-3">
      <Link to={`/u/${c.author.id}`} className="shrink-0">
        <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={isReply ? 'xs' : 'sm'} />
      </Link>
      <div className="min-w-0 flex-1">
        {c.pinned && (
          <p className="muted mb-0.5 flex items-center gap-1 text-xs">
            <Pin className="size-3" /> {tr.t('watch.pinned')}
          </p>
        )}
        <div className="flex items-baseline gap-2 text-sm">
          <UserName user={c.author} className={cx(c.author.id === video.owner.id && 'rounded-full bg-soft px-2 text-ink')} />
          <span className="muted text-xs">{relativeTime(c.createdAt, tr)}</span>
        </div>
        <p className="mt-0.5 text-sm" dir="auto" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          <MathText text={c.text} />
        </p>
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            className={cx('btn btn-ghost btn-sm !min-h-8 !px-2', c.liked && 'text-ink')}
            aria-pressed={c.liked}
            onClick={() => void like()}
            disabled={!me}
          >
            <ThumbsUp className={cx('size-4', c.liked && 'fill-current')} aria-hidden />
            <span className="tabular-nums">{c.likes || ''}</span>
            <span className="sr-only">{tr.t('watch.like')}</span>
          </button>
          {me && (
            <button type="button" className="btn btn-ghost btn-sm !min-h-8 !px-2" onClick={() => setReplying((r) => !r)}>
              {tr.t('watch.reply')}
            </button>
          )}
          <Menu
            items={[
              ...(owner && !isReply
                ? [
                    {
                      label: c.pinned ? tr.t('watch.unpin') : tr.t('watch.pin'),
                      icon: c.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />,
                      onSelect: async () => {
                        try {
                          await api.videos.pinComment(video.id, c.id, !c.pinned);
                          onChanged();
                        } catch (e) {
                          toastError(e);
                        }
                      },
                    },
                  ]
                : []),
              {
                label: tr.t('common.report'),
                icon: <Flag className="size-4" />,
                hidden: mine || !me,
                onSelect: () => reportContent({ targetType: 'video_comment', targetId: c.id }),
              },
              {
                label: tr.t('common.delete'),
                icon: <Trash2 className="size-4" />,
                danger: true,
                hidden: !c.canDelete,
                onSelect: async () => {
                  if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                  try {
                    await api.videos.deleteComment(video.id, c.id);
                    onChanged();
                  } catch (e) {
                    toastError(e);
                  }
                },
              },
            ]}
          />
        </div>
        {replying && (
          <div className="mt-2">
            <CommentBox
              autoFocus
              placeholder={tr.t('watch.reply')}
              submitLabel={tr.t('watch.reply')}
              onCancel={() => setReplying(false)}
              onSubmit={async (text) => {
                try {
                  await api.videos.comment(video.id, text, c.parentId ?? c.id);
                  setC((x) => ({ ...x, replyCount: x.replyCount + 1 }));
                  setShowReplies(true);
                  onChanged();
                } catch (e) {
                  toastError(e);
                  throw e;
                }
              }}
            />
          </div>
        )}
        {!isReply && c.replyCount > 0 && (
          <>
            <button
              type="button"
              className="link mt-1 inline-flex items-center gap-1 text-sm"
              aria-expanded={showReplies}
              onClick={() => setShowReplies((s) => !s)}
            >
              {showReplies ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {showReplies ? tr.t('watch.hideReplies') : tr.t('watch.replies', { count: c.replyCount })}
            </button>
            {showReplies && <Replies video={video} parent={c} />}
          </>
        )}
      </div>
    </div>
  );
}

export function VideoComments({ video, onCount }: { video: VideoDto; onCount: (delta: number) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const [sort, setSort] = useState<Sort>('top');
  const key = ['video-comments', video.id, sort];
  const list = usePaged<VideoCommentDto>(key, (cursor) => api.videos.comments(video.id, { sort, cursor, limit: 20 }));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['video-comments', video.id] });
    void qc.invalidateQueries({ queryKey: ['video-replies'] });
    void qc.invalidateQueries({ queryKey: ['video', video.id] });
  };

  if (!video.allowComments) return <p className="muted py-4">{tr.t('watch.commentsOff')}</p>;
  return (
    <section aria-label={tr.t('watch.comments', { count: video.commentCount })} className="mt-6">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-lg font-black">{tr.t('watch.comments', { count: video.commentCount })}</h2>
        <div className="tabs ms-auto" role="tablist">
          {(['top', 'new'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={sort === s} className="tab !min-h-9 !px-3 text-sm" onClick={() => setSort(s)}>
              {tr.t(s === 'top' ? 'watch.sortTop' : 'watch.sortNew')}
            </button>
          ))}
        </div>
      </div>
      {me ? (
        <CommentBox
          placeholder={tr.t('watch.addComment')}
          submitLabel={tr.t('feed.comment')}
          onSubmit={async (text) => {
            try {
              await api.videos.comment(video.id, text);
              onCount(1);
              refresh();
            } catch (e) {
              toastError(e);
              throw e;
            }
          }}
        />
      ) : (
        <p className="muted text-sm">
          <Link to={`/login?next=${encodeURIComponent(`/watch/${video.id}`)}`} className="link">
            {tr.t('watch.signInToComment')}
          </Link>
        </p>
      )}
      <div className="mt-6 space-y-5">
        {list.isPending && <Spinner />}
        {list.items.map((c) => (
          <CommentItem
            key={c.id}
            video={video}
            comment={c}
            onChanged={() => {
              refresh();
              void list.refetch();
            }}
          />
        ))}
        {!list.isPending && !list.items.length && <p className="muted">{tr.t('feed.noComments')}</p>}
        <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      </div>
    </section>
  );
}
