import { MESSAGE_EMOJI, type Attachment, type MessageDto } from '@qubedu/shared';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { CheckCheck, FileText, Mic, Paperclip, Pencil, Reply, Send, Smile, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/States';
import { useUpload } from '@/components/ui/Upload';
import { ch } from '@/app/channels';
import { api, fileUrl, realtime } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes, formatDate, formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confirmDialog, toastError, useUi } from '@/lib/ui';
import { qk } from '@/lib/query';
import { useRealtimeChannel } from '@/lib/useRealtime';

type MsgPage = { items: MessageDto[]; nextCursor: string | null; peerLastReadAt: number | null };
type MsgData = InfiniteData<MsgPage, string | undefined>;

const keyOf = (id: string) => ['chat', 'messages', id] as const;

function kindOf(mime: string): Attachment['kind'] {
  return mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file';
}

function AttachmentView({ a }: { a: Attachment }) {
  const url = fileUrl(a.url);
  if (a.kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={a.name} loading="lazy" className="max-h-64 rounded-xl object-cover" />
      </a>
    );
  }
  if (a.kind === 'audio') return <audio controls preload="none" src={url} className="max-w-full" />;
  if (a.kind === 'video') return <video controls preload="metadata" src={url} className="max-h-64 rounded-xl" />;
  return (
    <a
      href={url}
      download={a.name}
      className="flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-sm font-bold"
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileText className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{a.name}</span>
      <span className="text-xs font-normal opacity-70">{formatBytes(a.size)}</span>
    </a>
  );
}

function Bubble({
  m,
  mine,
  showSender,
  seen,
  onReply,
  onEdit,
}: {
  m: MessageDto;
  mine: boolean;
  showSender: boolean;
  seen: boolean;
  onReply: () => void;
  onEdit: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const react = async (emoji: string) => {
    try {
      const next = await api.chat.react(m.id, emoji);
      patchMessage(qc, m.conversationId, next);
    } catch (e) {
      toastError(e);
    }
  };
  const reactions = Object.entries(m.reactions).filter(([, users]) => users.length);
  return (
    <li id={`m-${m.id}`} className={cx('group flex items-end gap-2', mine && 'flex-row-reverse')}>
      {!mine && showSender ? <Avatar name={m.sender.displayName} url={m.sender.avatarUrl} size="sm" /> : !mine ? <span className="size-8 shrink-0" /> : null}
      <div className={cx('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {showSender && !mine && <span className="muted mb-0.5 ps-2 text-xs font-bold">{m.sender.displayName}</span>}
        <div className={cx('rounded-2xl px-3 py-2 text-[0.95rem]', mine ? 'bg-primary text-on-primary rounded-ee-md' : 'bg-bg-3 rounded-es-md')}>
          {m.replyTo && (
            <a href={`#m-${m.replyTo.id}`} className="mb-1 block rounded-lg border-s-2 border-current/50 bg-black/10 px-2 py-1 text-xs opacity-90">
              <b>{m.replyTo.senderName}</b>
              <span className="line-clamp-2" dir="auto">
                {m.replyTo.text}
              </span>
            </a>
          )}
          {m.deleted ? (
            <em className="opacity-70">{tr.t('chat.deleted')}</em>
          ) : (
            <>
              {m.attachment && <AttachmentView a={m.attachment} />}
              {m.text && (
                <p className="whitespace-pre-wrap" dir="auto" style={{ overflowWrap: 'anywhere' }}>
                  {m.text}
                </p>
              )}
            </>
          )}
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[0.68rem] opacity-70">
            {m.editedAt && !m.deleted && <span>{tr.t('chat.edited')}</span>}
            {formatTime(m.createdAt, tr)}
            {mine && !m.deleted && (
              <CheckCheck className={cx('size-3.5', seen && 'text-sky-300')} aria-label={seen ? tr.t('chat.seen') : tr.t('chat.delivered')} />
            )}
          </span>
        </div>
        {reactions.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-1 px-1">
            {reactions.map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                aria-pressed={!!me && users.includes(me.id)}
                onClick={() => void react(emoji)}
                className={cx('chip !min-h-6 !px-1.5 text-xs', me && users.includes(me.id) && 'is-active')}
              >
                {emoji} {users.length}
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.deleted && !m.id.startsWith('tmp-') && (
        <div
          className={cx(
            'flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100',
            mine && 'flex-row-reverse',
          )}
        >
          <Menu
            label={tr.t('common.more')}
            trigger={<Smile className="size-4" />}
            align={mine ? 'start' : 'end'}
            items={MESSAGE_EMOJI.map((e) => ({ label: e, onSelect: () => void react(e) }))}
          />
          <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.reply')} onClick={onReply}>
            <Reply className="size-4 flip-rtl" />
          </button>
          {mine && (
            <>
              {!m.attachment && (
                <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('chat.editMessage')} onClick={onEdit}>
                  <Pencil className="size-4" />
                </button>
              )}
              <button
                type="button"
                className="icon-btn icon-btn-sm text-err"
                aria-label={tr.t('common.delete')}
                onClick={async () => {
                  if (!(await confirmDialog({ title: tr.t('chat.deleteConfirm'), danger: true }))) return;
                  try {
                    await api.chat.remove(m.id);
                    patchMessage(qc, m.conversationId, { ...m, deleted: true, text: '', attachment: null });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function patchMessage(qc: ReturnType<typeof useQueryClient>, conversationId: string, next: MessageDto) {
  qc.setQueryData<MsgData>(keyOf(conversationId), (old) => {
    if (!old) return old;
    let found = false;
    const pages = old.pages.map((p) => ({
      ...p,
      items: p.items.map((i) => {
        if (i.id === next.id || (next.clientId && i.clientId === next.clientId)) {
          found = true;
          return next;
        }
        return i;
      }),
    }));
    if (!found && pages[0]) pages[0] = { ...pages[0], items: [next, ...pages[0].items] };
    return { ...old, pages };
  });
}

/** One conversation: history, live updates, typing, read receipts, replies, edits, reactions, files and voice notes. */
export function ChatThread({
  conversationId,
  group,
  readOnly,
  className,
}: {
  conversationId: string;
  group?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const key = keyOf(conversationId);
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.chat.messages(conversationId, { cursor: pageParam, limit: 40 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [peerRead, setPeerRead] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [editing, setEditing] = useState<MessageDto | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const { upload, busy: uploading } = useUpload();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const messages = useMemo(() => [...(q.data?.pages.flatMap((p) => p.items) ?? [])].reverse(), [q.data]);
  const firstRead = q.data?.pages[0]?.peerLastReadAt ?? null;
  useEffect(() => {
    setPeerRead(firstRead);
  }, [firstRead]);

  const markRead = useCallback(() => {
    void api.chat
      .read(conversationId)
      .then(() => qc.invalidateQueries({ queryKey: qk.conversations }))
      .catch(() => undefined);
  }, [conversationId, qc]);
  useEffect(() => {
    markRead();
  }, [markRead]);
  useEffect(() => {
    useUi.getState().set({ activeConversationId: conversationId });
    return () => useUi.getState().set({ activeConversationId: null });
  }, [conversationId]);

  useRealtimeChannel(ch.conv(conversationId), (f) => {
    if (f.type !== 'event') return;
    const d = f.data as MessageDto & { userId?: string; at?: number };
    if (f.event === 'message:new' || f.event === 'message:updated') {
      patchMessage(qc, conversationId, d);
      if (f.event === 'message:new' && d.sender.id !== me.id) {
        setTyping((t) => {
          const { [d.sender.id]: _gone, ...rest } = t;
          return rest;
        });
        if (document.visibilityState === 'visible') markRead();
      }
    } else if (f.event === 'conversation:read' && d.userId !== me.id) setPeerRead(d.at ?? Date.now());
    else if (f.event === 'typing' && f.from && f.from.uid !== me.id) setTyping((t) => ({ ...t, [f.from!.uid]: { name: f.from!.name, at: Date.now() } }));
    else if (f.event === 'stop-typing' && f.from)
      setTyping((t) => {
        const { [f.from!.uid]: _gone, ...rest } = t;
        return rest;
      });
  });
  // Typing indicators expire if the "stop" event is lost.
  useEffect(() => {
    const id = setInterval(() => setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => Date.now() - v.at < 5000))), 2000);
    return () => clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, Object.keys(typing).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && q.hasNextPage && !q.isFetchingNextPage) {
      const before = el.scrollHeight;
      void q.fetchNextPage().then(() => requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - before)));
    }
  };

  const sendMessage = async (body: { text: string; attachment?: Attachment }) => {
    const clientId = crypto.randomUUID();
    const optimistic: MessageDto = {
      id: `tmp-${clientId}`,
      conversationId,
      sender: me,
      text: body.text,
      attachment: body.attachment ?? null,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderName: replyTo.sender.displayName } : null,
      reactions: {},
      createdAt: Date.now(),
      editedAt: null,
      deleted: false,
      clientId,
    };
    stick.current = true;
    patchMessage(qc, conversationId, optimistic);
    const reply = replyTo;
    setReplyTo(null);
    try {
      const saved = await api.chat.send(conversationId, { ...body, replyToId: reply?.id ?? null, clientId });
      patchMessage(qc, conversationId, saved);
      void qc.invalidateQueries({ queryKey: qk.conversations });
    } catch (e) {
      qc.setQueryData<MsgData>(key, (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.clientId !== clientId) })) });
      toastError(e);
      if (!body.attachment) setText(body.text);
    }
  };

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      try {
        const next = await api.chat.edit(editing.id, value);
        patchMessage(qc, conversationId, next);
        setEditing(null);
        setText('');
      } catch (e) {
        toastError(e);
      }
      return;
    }
    setText('');
    realtime.publish(ch.conv(conversationId), 'stop-typing');
    lastTyping.current = 0;
    await sendMessage({ text: value });
  };

  const attach = async (file: File) => {
    const r = await upload(file, 'chat');
    if (r) await sendMessage({ text: '', attachment: { url: r.url, name: file.name || 'voice', mime: r.mime, size: r.size, kind: kindOf(r.mime) } });
  };

  const toggleRecord = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const type = rec.mimeType || 'audio/webm';
        if (chunks.length)
          void attach(
            new File(chunks, `voice-${Date.now()}.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { type: type.split(';')[0] }),
          );
      };
      rec.start();
      setRecording(rec);
    } catch {
      toastError(new Error('permission'));
    }
  };

  const typingNames = Object.values(typing).map((t) => t.name);
  let lastDay = '';
  return (
    <div className={cx('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4"
        role="log"
        aria-live="polite"
        aria-label={tr.t('chat.title')}
      >
        {q.isFetchingNextPage && <Spinner className="py-2" />}
        {q.isPending ? (
          <Spinner className="py-16" />
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const day = formatDate(m.createdAt, tr, { dateStyle: 'medium' });
              const sep = day !== lastDay;
              lastDay = day;
              const prev = messages[i - 1];
              const showSender = !!group && (sep || prev?.sender.id !== m.sender.id);
              return (
                <li key={m.clientId ?? m.id} className="list-none">
                  {sep && (
                    <div className="my-3 text-center">
                      <span className="chip !min-h-6 text-xs">{day}</span>
                    </div>
                  )}
                  <ul>
                    <Bubble
                      m={m}
                      mine={m.sender.id === me.id}
                      showSender={showSender || (!group && m.sender.id !== me.id && (sep || prev?.sender.id !== m.sender.id))}
                      seen={!!peerRead && m.createdAt <= peerRead}
                      onReply={() => setReplyTo(m)}
                      onEdit={() => {
                        setEditing(m);
                        setText(m.text);
                      }}
                    />
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="h-5 px-4 text-xs font-bold text-primary" aria-live="polite">
        {typingNames.length > 0 && tr.t('chat.typing', { name: typingNames.join(', ') })}
      </div>
      {!readOnly && (
        <div className="border-t border-line bg-card p-2">
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-soft px-3 py-1.5 text-sm">
              {editing ? <Pencil className="size-4" /> : <Reply className="size-4 flip-rtl" />}
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {editing ? tr.t('chat.editMessage') : tr.t('chat.replyTo', { name: replyTo!.sender.displayName })}
                {!editing && `: ${replyTo!.text}`}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label={tr.t('common.cancel')}
                onClick={() => {
                  setReplyTo(null);
                  setEditing(null);
                  setText('');
                }}
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void attach(f);
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={tr.t('chat.attach')}
              disabled={uploading || !!editing}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? <Spinner /> : <Paperclip className="size-5" />}
            </button>
            <textarea
              rows={1}
              className="input max-h-32 min-h-10 flex-1 resize-none py-2"
              dir="auto"
              value={text}
              maxLength={4000}
              placeholder={recording ? tr.t('chat.recording') : tr.t('chat.placeholder')}
              aria-label={tr.t('chat.placeholder')}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                if (Date.now() - lastTyping.current > 2500 && e.target.value) {
                  lastTyping.current = Date.now();
                  realtime.publish(ch.conv(conversationId), 'typing');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
                if (e.key === 'Escape') {
                  setReplyTo(null);
                  setEditing(null);
                }
              }}
            />
            {text.trim() ? (
              <Button type="submit" className="!size-10 !rounded-full !p-0" aria-label={tr.t('common.send')}>
                <Send className="size-5 flip-rtl" />
              </Button>
            ) : (
              <button
                type="button"
                className={cx('icon-btn', recording && 'bg-err-fill text-white')}
                aria-label={tr.t('chat.record')}
                aria-pressed={!!recording}
                onClick={() => void toggleRecord()}
              >
                {recording ? <Square className="size-5" /> : <Mic className="size-5" />}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
