import type { CommentDto, PostDto } from '@qubedu/shared';
import { Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar, UserName } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { LoadMore, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { usePaged } from '@/lib/infinite';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';

export function CommentsSection({ post, onCountChange }: { post: PostDto; onCountChange: (delta: number) => void }) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const list = usePaged<CommentDto>(qk.comments(post.id), (cursor) => api.posts.comments(post.id, { cursor, limit: 20 }));
  const [added, setAdded] = useState<CommentDto[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = [...list.items, ...added.filter((a) => !list.items.some((i) => i.id === a.id))].filter((c) => !removed.has(c.id));

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

  return (
    <section className="mt-3 border-t border-line pt-3" aria-label={tr.t('feed.comments')}>
      {list.isPending ? (
        <Spinner className="py-4" />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar name={c.author.displayName} url={c.author.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl bg-bg-3 px-3 py-2">
                  <UserName user={c.author} className="text-sm" />
                  <p className="text-sm" dir="auto" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {c.text}
                  </p>
                </div>
                <div className="muted mt-0.5 flex items-center gap-3 px-2 text-xs">
                  {relativeTime(c.createdAt, tr)}
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
          ))}
          {!items.length && <li className="muted text-sm">{tr.t('feed.noComments')}</li>}
        </ul>
      )}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      {me && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
          <input
            className="input flex-1 rounded-full"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr.t('feed.writeComment')}
            maxLength={1000}
            aria-label={tr.t('feed.writeComment')}
          />
          <IconButton type="submit" label={tr.t('common.send')} disabled={busy || !text.trim()} className="bg-soft text-ink">
            <Send className="size-4 flip-rtl" />
          </IconButton>
        </form>
      )}
    </section>
  );
}
