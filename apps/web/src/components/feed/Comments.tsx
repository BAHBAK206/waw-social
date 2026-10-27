import type { CommentDto, PostDto } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, GraduationCap, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ReadAloud } from '@/components/common/ReadAloud';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { LoadMore, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { usePaged } from '@/lib/infinite';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { celebrate, toastError } from '@/lib/ui';

/**
 * Comments on a discussion, or answers to a question. Answers show the best answer first, a "teacher" badge,
 * "helpful" votes, and let the asker (or a teacher/moderator) pick the best answer.
 */
export function CommentsSection({
  post,
  onCountChange,
  onAccepted,
}: {
  post: PostDto;
  onCountChange: (delta: number) => void;
  onAccepted?: (commentId: string | null) => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const isQuestion = post.kind === 'question';
  const key = qk.comments(post.id);
  const list = usePaged<CommentDto>(key, (cursor) => api.posts.comments(post.id, { cursor, limit: 20 }));
  const [added, setAdded] = useState<CommentDto[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [patches, setPatches] = useState<Record<string, Partial<CommentDto>>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = [...list.items, ...added.filter((a) => !list.items.some((i) => i.id === a.id))]
    .filter((c) => !removed.has(c.id))
    .map((c) => ({ ...c, ...patches[c.id] }));

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const c = await api.posts.comment(post.id, t);
      setAdded((a) => [...a, c]);
      setText('');
      onCountChange(1);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (c: CommentDto) => {
    const on = !c.myVote;
    setPatches((p) => ({ ...p, [c.id]: { myVote: on, votes: c.votes + (on ? 1 : -1) } }));
    try {
      const r = await api.posts.voteComment(post.id, c.id, on);
      setPatches((p) => ({ ...p, [c.id]: { myVote: r.myVote, votes: r.votes } }));
    } catch (e) {
      setPatches((p) => ({ ...p, [c.id]: { myVote: c.myVote, votes: c.votes } }));
      toastError(e);
    }
  };

  const accept = async (c: CommentDto) => {
    const next = post.acceptedCommentId === c.id ? null : c.id;
    try {
      const r = await api.posts.accept(post.id, next);
      onAccepted?.(r.acceptedCommentId);
      if (r.acceptedCommentId && c.author.id !== me?.id) celebrate({});
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <section className="mt-3 border-t border-line pt-3" aria-label={isQuestion ? tr.t('feed.answers') : tr.t('feed.comments')}>
      {list.isPending ? (
        <Spinner className="py-4" />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const best = isQuestion && post.acceptedCommentId === c.id;
            const teacher = c.author.accountType === 'teacher';
            return (
              <li key={c.id} className="flex gap-2">
                <Avatar name={c.author.displayName} url={c.author.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div
                    className={cx('rounded-2xl px-3 py-2', best ? 'border-2 border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]' : 'bg-bg-3')}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <UserName user={c.author} className="text-sm" />
                      {teacher && (
                        <span className="badge badge-primary !py-0 text-[0.7rem]">
                          <GraduationCap className="size-3" aria-hidden /> {tr.t('feed.teacher')}
                        </span>
                      )}
                      {best && (
                        <span className="badge badge-ok !py-0 text-[0.7rem]">
                          <Award className="size-3" aria-hidden /> {tr.t('feed.bestAnswer')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm" dir="auto" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      {c.text}
                    </p>
                  </div>
                  <div className="muted mt-0.5 flex flex-wrap items-center gap-3 px-2 text-xs">
                    {relativeTime(c.createdAt, tr)}
                    {c.author.id !== me?.id ? (
                      <button
                        type="button"
                        className={cx('inline-flex items-center gap-1 font-bold hover:underline', c.myVote && 'text-ink')}
                        aria-pressed={c.myVote}
                        onClick={() => void vote(c)}
                      >
                        <ThumbsUp className={cx('size-3.5', c.myVote && 'fill-current')} aria-hidden /> {tr.t('feed.helpful')}
                        {c.votes > 0 && <span className="tabular-nums">· {c.votes}</span>}
                      </button>
                    ) : (
                      c.votes > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="size-3.5" aria-hidden /> {c.votes}
                        </span>
                      )
                    )}
                    {isQuestion && post.canAccept && (
                      <button
                        type="button"
                        className={cx('inline-flex items-center gap-1 font-bold hover:underline', best && 'text-ok')}
                        onClick={() => void accept(c)}
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden /> {best ? tr.t('feed.unmarkBest') : tr.t('feed.markBest')}
                      </button>
                    )}
                    <ReadAloud text={c.text} compact />
                    {c.canDelete && (
                      <IconButton
                        label={tr.t('common.delete')}
                        size="sm"
                        className="!size-6"
                        onClick={async () => {
                          try {
                            await api.posts.deleteComment(post.id, c.id);
                            setRemoved((r) => new Set(r).add(c.id));
                            onCountChange(-1);
                            if (best) onAccepted?.(null);
                          } catch (e) {
                            toastError(e);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {!items.length && <li className="muted text-sm">{isQuestion ? tr.t('feed.noAnswers') : tr.t('feed.noComments')}</li>}
        </ul>
      )}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      {me && (
        <form
          className="mt-3 flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
          {isQuestion ? (
            <textarea
              className="input min-h-20 flex-1"
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tr.t('feed.writeAnswer')}
              maxLength={1000}
              aria-label={tr.t('feed.writeAnswer')}
            />
          ) : (
            <input
              className="input flex-1 rounded-full"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tr.t('feed.writeComment')}
              maxLength={1000}
              aria-label={tr.t('feed.writeComment')}
            />
          )}
          <IconButton type="submit" label={tr.t('common.send')} disabled={busy || !text.trim()} className="bg-soft text-ink">
            <Send className="size-4 flip-rtl" />
          </IconButton>
        </form>
      )}
      {isQuestion && me?.id !== post.author.id && <p className="muted mt-2 text-xs">{tr.t('feed.bestAnswerXp')}</p>}
    </section>
  );
}
