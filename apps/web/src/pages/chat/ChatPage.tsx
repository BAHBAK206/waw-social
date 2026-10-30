import type { ConversationDto, UserSummary } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, MessageSquarePlus, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChatThread } from '@/components/chat/ChatThread';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';

function NewChatDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);
  const list = useQuery({ queryKey: ['users', 'search', debounced], queryFn: () => api.users.list({ q: debounced, limit: 20 }) });
  const open = async (u: UserSummary) => {
    try {
      const c = await api.chat.direct(u.id);
      onClose();
      navigate(`/chat/${c.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={tr.t('chat.newChat')} size="sm">
      <Input
        autoFocus
        type="search"
        aria-label={tr.t('people.searchPlaceholder')}
        placeholder={tr.t('people.searchPlaceholder')}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {list.isPending && <Spinner className="py-6" />}
        {list.data?.items.map((u) => (
          <li key={u.id}>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl p-2 text-start hover:bg-soft" onClick={() => void open(u)}>
              <Avatar name={u.displayName} url={u.avatarUrl} online={u.online} />
              <span className="min-w-0">
                <span className="block truncate font-bold" dir="auto">
                  {u.displayName}
                </span>
                {u.username && <span className="muted block text-xs">@{u.username}</span>}
              </span>
            </button>
          </li>
        ))}
        {list.data && !list.data.items.length && <li className="muted p-4 text-center">{tr.t('people.empty')}</li>}
      </ul>
    </Modal>
  );
}

function ConversationRow({ c, active }: { c: ConversationDto; active: boolean }) {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const preview = c.lastMessage ? `${c.lastMessage.senderId === me.id ? tr.t('chat.you') : ''}${c.lastMessage.text || '📎'}` : '';
  return (
    <Link
      to={`/chat/${c.id}`}
      aria-current={active ? 'page' : undefined}
      className={cx('flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-soft', active && 'bg-soft')}
    >
      {c.kind === 'direct' || c.avatarUrl ? (
        <Avatar name={c.title} url={c.avatarUrl} online={c.peer?.online} />
      ) : (
        <span className="surface-gradient grid size-10 shrink-0 place-items-center rounded-full">
          <Users className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cx('min-w-0 flex-1 truncate', c.unread ? 'font-black' : 'font-bold')} dir="auto">
            {c.title}
          </span>
          {c.lastMessage && <span className="muted shrink-0 text-xs">{relativeTime(c.lastMessage.createdAt, tr)}</span>}
        </div>
        <div className="flex items-center gap-1">
          <span className={cx('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-bold' : 'muted')} dir="auto">
            {preview}
          </span>
          {c.muted && <BellOff className="muted size-3.5 shrink-0" aria-label={tr.t('chat.muted')} />}
          {c.unread > 0 && <span className="badge badge-primary tabular-nums">{c.unread > 99 ? '99+' : c.unread}</span>}
        </div>
      </div>
    </Link>
  );
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: qk.conversations, queryFn: () => api.chat.conversations({ limit: 100 }), refetchInterval: 60_000 });
  const active = useQuery({ queryKey: qk.conversation(conversationId ?? ''), queryFn: () => api.chat.get(conversationId!), enabled: !!conversationId });

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? items.filter((c) => c.title.toLowerCase().includes(t)) : items;
  }, [items, term]);

  // Keep the badge in the app shell in sync with what the list says.
  const unreadTotal = items.reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);
  useEffect(() => {
    if (list.data && me.unreadMessages !== unreadTotal) useSession.getState().patchMe({ unreadMessages: unreadTotal });
  }, [list.data, unreadTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const conv = active.data ?? items.find((c) => c.id === conversationId);
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-4rem)] max-w-6xl overflow-hidden md:h-[calc(100dvh-4rem)] md:p-4">
      <div className="card flex min-h-0 w-full overflow-hidden md:rounded-2xl">
        <aside className={cx('flex min-h-0 w-full shrink-0 flex-col border-line md:w-80 md:border-e', conversationId && 'max-md:hidden')}>
          <div className="flex items-center gap-2 p-3">
            <h1 className="flex-1 text-xl font-black">{tr.t('chat.title')}</h1>
            <button type="button" className="icon-btn" aria-label={tr.t('chat.newChat')} onClick={() => setCreating(true)}>
              <MessageSquarePlus className="size-5" />
            </button>
          </div>
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <input
                type="search"
                className="input ps-9"
                placeholder={tr.t('chat.searchConversations')}
                aria-label={tr.t('chat.searchConversations')}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          </div>
          <nav className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label={tr.t('chat.title')}>
            {list.isPending ? (
              <CardSkeletons count={5} />
            ) : list.error ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            ) : !filtered.length ? (
              <EmptyState title={tr.t('chat.empty')} action={<Button onClick={() => setCreating(true)}>{tr.t('chat.newChat')}</Button>} />
            ) : (
              filtered.map((c) => <ConversationRow key={c.id} c={c} active={c.id === conversationId} />)
            )}
          </nav>
        </aside>
        <section className={cx('flex min-h-0 min-w-0 flex-1 flex-col', !conversationId && 'max-md:hidden')}>
          {!conversationId ? (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div>
                <MessageSquarePlus className="muted mx-auto mb-3 size-12" />
                <p className="muted">{tr.t('chat.select')}</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-line p-3">
                <Link to="/chat" className="icon-btn md:hidden" aria-label={tr.t('common.back')}>
                  <ArrowLeft className="size-5 flip-rtl" />
                </Link>
                {conv && (
                  <>
                    {conv.kind === 'direct' && conv.peer ? (
                      <Link to={`/u/${conv.peer.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={conv.title} url={conv.avatarUrl} online={conv.peer.online} />
                        <span className="min-w-0">
                          <span className="block truncate font-black" dir="auto">
                            {conv.title}
                          </span>
                          <span className="muted block text-xs">
                            {conv.peer.online ? tr.t('chat.online') : conv.peer.username ? `@${conv.peer.username}` : ''}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={conv.title} url={conv.avatarUrl} />
                        <span className="truncate font-black" dir="auto">
                          {conv.title}
                        </span>
                        {conv.groupId && (
                          <Link className="link text-sm" to={`/groups/${conv.groupId}`}>
                            {tr.t('chat.group')}
                          </Link>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className={cx('icon-btn', conv.muted && 'text-primary')}
                      aria-pressed={conv.muted}
                      aria-label={conv.muted ? tr.t('common.unmute') : tr.t('common.mute')}
                      onClick={async () => {
                        try {
                          await api.chat.update(conv.id, { muted: !conv.muted });
                          await Promise.all([
                            qc.invalidateQueries({ queryKey: qk.conversations }),
                            qc.invalidateQueries({ queryKey: qk.conversation(conv.id) }),
                          ]);
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <BellOff className="size-5" />
                    </button>
                  </>
                )}
              </header>
              {active.error ? (
                <ErrorState error={active.error} />
              ) : (
                <ChatThread key={conversationId} conversationId={conversationId} group={conv?.kind !== 'direct'} />
              )}
            </>
          )}
        </section>
      </div>
      {creating && <NewChatDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
