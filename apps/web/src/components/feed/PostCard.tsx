import { REACTIONS, REACTION_EMOJI, type PostDto, type PollDto, type Reaction } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpenText,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  CircleHelp,
  Flag,
  Link2,
  MessageCircle,
  Pencil,
  Pin,
  Share2,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { RichText } from '@/components/common/RichText';
import { reportContent } from '@/components/common/ReportDialog';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeFuture, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { celebrate, confirmDialog, toast, toastError } from '@/lib/ui';
import { CommentsSection } from './Comments';
import { ReadAloud } from '@/components/common/ReadAloud';
import { MathText } from '@/components/common/Math';

type Patch = (fn: (p: PostDto) => PostDto) => void;

function PollView({ post, onChange }: { post: PostDto; onChange: (p: PostDto) => void }) {
  const tr = useT();
  const poll = post.poll as PollDto;
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const voted = poll.myVotes.length > 0;
  const showResults = voted || poll.closed;
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const submit = async () => {
    setBusy(true);
    try {
      onChange(await api.posts.vote(post.id, picked));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2" role="group" aria-label={tr.t('poll.votes', { count: poll.totalVotes })}>
      {poll.options.map((o) => {
        const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        const mine = poll.myVotes.includes(o.id);
        return showResults ? (
          <div key={o.id} className="relative overflow-hidden rounded-[var(--radius-control)] border border-line">
            <div
              className={cx('absolute inset-y-0 start-0', mine ? 'bg-[color-mix(in_srgb,var(--primary)_28%,transparent)]' : 'bg-bg-3')}
              style={{ width: `${(o.votes / max) * 100}%` }}
              aria-hidden
            />
            <div className="relative flex min-h-11 items-center gap-2 px-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-bold">{o.text}</span>
              {mine && <span className="badge badge-primary">{tr.t('poll.voted')}</span>}
              <span className="tabular-nums font-black">{pct}%</span>
            </div>
          </div>
        ) : (
          <label
            key={o.id}
            className={cx(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3',
              picked.includes(o.id) ? 'border-primary bg-soft' : 'border-line hover:border-primary',
            )}
          >
            <input
              type={poll.multiple ? 'checkbox' : 'radio'}
              name={`poll-${post.id}`}
              className="size-4 accent-[var(--primary)]"
              checked={picked.includes(o.id)}
              onChange={(e) => setPicked((p) => (poll.multiple ? (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)) : [o.id]))}
            />
            <span className="font-bold">{o.text}</span>
          </label>
        );
      })}
      <div className="flex items-center gap-3 text-sm">
        <span className="muted">
          {tr.t('poll.votes', { count: poll.totalVotes })}
          {poll.closed && ` · ${tr.t('poll.closed')}`}
          {!poll.closed && poll.endsAt && ` · ${tr.t('poll.endsIn', { when: relativeFuture(poll.endsAt, tr) })}`}
        </span>
        {!showResults && (
          <Button size="sm" className="ms-auto" loading={busy} disabled={!picked.length} onClick={() => void submit()}>
            {tr.t('poll.vote')}
          </Button>
        )}
      </div>
    </div>
  );
}

function SharedEmbed({ post }: { post: NonNullable<PostDto['shared']> }) {
  const tr = useT();
  if (!post.available)
    return <div className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line p-3 text-sm text-fg-3">{tr.t('feed.unavailable')}</div>;
  return (
    <Link to={`/post/${post.id}`} className="mt-3 block overflow-hidden rounded-[var(--radius-control)] border border-line hover:border-primary">
      {post.imageUrl && <img src={fileUrl(post.imageUrl)} alt="" loading="lazy" className="max-h-72 w-full object-cover" />}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} size="xs" />
          <span className="truncate text-sm font-bold">{post.author.displayName}</span>
          <span className="muted text-xs">{relativeTime(post.createdAt, tr)}</span>
        </div>
        {post.text && (
          <p className="line-clamp-4 mt-1.5 text-sm" dir="auto">
            <MathText text={post.text} />
          </p>
        )}
      </div>
    </Link>
  );
}

function ReactionPicker({ current, onPick }: { current: Reaction | null; onPick: (r: Reaction | null) => void }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    timer.current = setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className={cx('btn btn-ghost btn-sm', current && 'text-ink')}
        aria-pressed={!!current}
        aria-haspopup="true"
        onClick={() => onPick(current ? null : 'like')}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onFocus={show}
      >
        {current ? <span aria-hidden>{REACTION_EMOJI[current]}</span> : <ThumbsUp className="size-4" aria-hidden />}
        {current ? tr.t(`feed.reactions.${current}`) : tr.t('feed.react')}
      </button>
      {open && (
        <div
          className="card animate-pop absolute start-0 bottom-full z-20 mb-1 flex gap-1 bg-[var(--card-solid)] p-1.5 shadow-xl"
          role="menu"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              aria-label={tr.t(`feed.reactions.${r}`)}
              title={tr.t(`feed.reactions.${r}`)}
              className="grid size-10 place-items-center rounded-full text-2xl transition-transform hover:scale-125 hover:bg-bg-3"
              onClick={() => {
                setOpen(false);
                onPick(r === current ? null : r);
              }}
            >
              {REACTION_EMOJI[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareDialog({ post, onClose }: { post: PostDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const target = post.shared?.available ? post.shared : post;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={tr.t('feed.share')}
      footer={
        <>
          <Button
            variant="outline"
            icon={<Link2 className="size-4" />}
            onClick={() => void navigator.clipboard.writeText(`${location.origin}/post/${post.id}`).then(() => toast(tr.t('common.copied')))}
          >
            {tr.t('feed.copyLink')}
          </Button>
          <Button
            loading={busy}
            icon={<Share2 className="size-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api.posts.create({ text: text.trim(), sharedPostId: target.id });
                celebrate({ newAchievements: res.newAchievements });
                toast(tr.t('feed.sharedOk'));
                void qc.invalidateQueries({ queryKey: ['feed'] });
                onClose();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('feed.shareNow')}
          </Button>
        </>
      }
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tr.t('feed.shareComment')} maxLength={1000} />
      <div className="mt-3 rounded-[var(--radius-control)] border border-line p-3 text-sm">
        <p className="font-bold">{post.author.displayName}</p>
        <p className="line-clamp-3 muted" dir="auto">
          {post.text}
        </p>
      </div>
    </Modal>
  );
}

export function PostCard({ post, onPatch, onRemoved, detail }: { post: PostDto; onPatch: Patch; onRemoved: (id: string) => void; detail?: boolean }) {
  const tr = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [showComments, setShowComments] = useState(!!detail);
  const [sharing, setSharing] = useState(false);
  const total = Object.values(post.reactionCounts).reduce((a, b) => a + (b ?? 0), 0);
  const topReactions = (Object.entries(post.reactionCounts) as [Reaction, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const react = async (r: Reaction | null) => {
    const prev = { counts: post.reactionCounts, mine: post.myReaction };
    // Optimistic update; the server response replaces it.
    const counts = { ...post.reactionCounts };
    if (post.myReaction) counts[post.myReaction] = Math.max(0, (counts[post.myReaction] ?? 1) - 1);
    if (r) counts[r] = (counts[r] ?? 0) + 1;
    onPatch((p) => ({ ...p, reactionCounts: counts, myReaction: r }));
    try {
      const res = await api.posts.react(post.id, r);
      onPatch((p) => ({ ...p, reactionCounts: res.reactionCounts, myReaction: res.myReaction }));
    } catch (e) {
      onPatch((p) => ({ ...p, reactionCounts: prev.counts, myReaction: prev.mine }));
      toastError(e);
    }
  };

  const toggleSave = async () => {
    try {
      if (post.saved) await api.saved.removeByRef('post', post.id);
      else await api.saved.add({ itemType: 'post', refId: post.id, title: post.text.slice(0, 80) || tr.t('saved.types.post'), url: `/post/${post.id}` });
      onPatch((p) => ({ ...p, saved: !p.saved }));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <article className="card p-4" aria-label={post.author.displayName}>
      <header className="flex items-start gap-3">
        <Link to={`/u/${post.author.id}`} aria-hidden tabIndex={-1}>
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} online={post.author.online} />
        </Link>
        <div className="min-w-0 flex-1">
          <UserName user={post.author} />
          <div className="muted text-xs">
            <Link to={`/post/${post.id}`} className="hover:underline">
              {relativeTime(post.createdAt, tr)}
            </Link>
            {post.editedAt && ` · ${tr.t('feed.edited')}`}
            {post.pinned && (
              <>
                {' · '}
                <Pin className="inline size-3" aria-hidden /> {tr.t('common.pinned')}
              </>
            )}
          </div>
          {(post.kind !== 'discussion' || post.material) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {post.kind === 'question' && (
                <span className={cx('badge', post.solved ? 'badge-ok' : 'badge-warn')}>
                  {post.solved ? <CheckCircle2 className="size-3" aria-hidden /> : <CircleHelp className="size-3" aria-hidden />}
                  {tr.t('feed.kinds.question')} · {post.solved ? tr.t('feed.solved') : tr.t('feed.unanswered')}
                </span>
              )}
              {post.kind === 'note' && (
                <span className="badge badge-primary">
                  <BookOpenText className="size-3" aria-hidden /> {tr.t('feed.kinds.note')}
                </span>
              )}
              {post.material && (
                <Link to={`/feed?subject=${post.material.id}`} className="badge hover:underline">
                  {post.material.name}
                </Link>
              )}
            </div>
          )}
        </div>
        <Menu
          items={[
            {
              label: tr.t('feed.copyLink'),
              icon: <Link2 className="size-4" />,
              onSelect: () => void navigator.clipboard.writeText(`${location.origin}/post/${post.id}`).then(() => toast(tr.t('common.copied'))),
            },
            {
              label: tr.t('common.edit'),
              icon: <Pencil className="size-4" />,
              hidden: !post.canEdit,
              onSelect: () => {
                setDraft(post.text);
                setEditing(true);
              },
            },
            {
              label: tr.t('common.report'),
              icon: <Flag className="size-4" />,
              hidden: post.canEdit,
              onSelect: () => reportContent({ targetType: 'post', targetId: post.id }),
            },
            {
              label: tr.t('common.delete'),
              icon: <Trash2 className="size-4" />,
              danger: true,
              hidden: !post.canDelete,
              onSelect: async () => {
                if (!(await confirmDialog({ title: tr.t('feed.deleteConfirm'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                try {
                  await api.posts.remove(post.id);
                  onRemoved(post.id);
                } catch (e) {
                  toastError(e);
                }
              },
            },
          ]}
        />
      </header>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} aria-label={tr.t('common.edit')} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {tr.t('common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={async () => {
                try {
                  const updated = await api.posts.update(post.id, draft.trim());
                  onPatch(() => updated);
                  setEditing(false);
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        post.text && <RichText text={post.text} className="mt-3" />
      )}
      {post.imageUrl && (
        <img src={fileUrl(post.imageUrl)} alt="" loading="lazy" className="mt-3 max-h-[32rem] w-full rounded-[var(--radius-control)] object-cover" />
      )}
      {post.poll && <PollView post={post} onChange={(p) => onPatch(() => p)} />}
      {post.shared && <SharedEmbed post={post.shared} />}

      {(total > 0 || post.commentCount > 0 || post.shareCount > 0) && (
        <div className="muted mt-3 flex items-center gap-3 text-sm">
          {total > 0 && (
            <span className="flex items-center gap-1">
              <span aria-hidden className="flex -space-x-1">
                {topReactions.map(([r]) => (
                  <span key={r}>{REACTION_EMOJI[r]}</span>
                ))}
              </span>
              <span className="tabular-nums">{total}</span>
            </span>
          )}
          <span className="flex-1" />
          {post.commentCount > 0 && (
            <button type="button" className="hover:underline" onClick={() => setShowComments(true)}>
              {post.kind === 'question' ? tr.t('feed.answerCount', { count: post.commentCount }) : `${post.commentCount} ${tr.t('feed.comments')}`}
            </button>
          )}
          {post.shareCount > 0 && <span>{tr.t('feed.shares', { count: post.shareCount })}</span>}
        </div>
      )}

      <footer className="mt-2 flex items-center gap-1 border-t border-line pt-2">
        <ReactionPicker current={post.myReaction} onPick={(r) => void react(r)} />
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showComments} onClick={() => setShowComments((s) => !s)}>
          <MessageCircle className="size-4" aria-hidden /> {post.kind === 'question' ? tr.t('feed.answers') : tr.t('feed.comment')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharing(true)}>
          <Share2 className="size-4" aria-hidden /> {tr.t('feed.share')}
        </button>
        <span className="flex-1" />
        <ReadAloud text={post.text} className="!px-2" compact={false} />
        <button type="button" className={cx('btn btn-ghost btn-sm', post.saved && 'text-ink')} aria-pressed={post.saved} onClick={() => void toggleSave()}>
          {post.saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
          <span className="sr-only">{post.saved ? tr.t('feed.unsave') : tr.t('feed.save')}</span>
        </button>
      </footer>
      {showComments && (
        <CommentsSection
          post={post}
          onCountChange={(d) => onPatch((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
          onAccepted={(acceptedCommentId) => onPatch((p) => ({ ...p, acceptedCommentId, solved: !!acceptedCommentId }))}
        />
      )}
      {sharing && <ShareDialog post={post} onClose={() => setSharing(false)} />}
    </article>
  );
}
