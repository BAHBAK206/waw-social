import type { AssistantMessageDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, MessageSquarePlus, Send, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { confirmDialog, toastError } from '@/lib/ui';
import { ReadAloud } from '@/components/common/ReadAloud';

function Bubble({ m }: { m: AssistantMessageDto }) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [rating, setRating] = useState(m.rating);
  const mine = m.role === 'user';
  return (
    <div className={cx('flex gap-3', mine && 'flex-row-reverse')}>
      {mine ? (
        <Avatar name={me?.displayName ?? '?'} url={me?.avatarUrl} size="sm" />
      ) : (
        <span className="surface-gradient grid size-8 shrink-0 place-items-center rounded-full">
          <Bot className="size-4" />
        </span>
      )}
      <div className={cx('max-w-[85%] space-y-2', mine && 'items-end text-end')}>
        <div className={cx('rounded-2xl px-4 py-2.5', mine ? 'bg-primary text-on-primary' : 'card')}>
          <p className="whitespace-pre-wrap" dir="auto" style={{ overflowWrap: 'anywhere' }}>
            {m.content}
          </p>
        </div>
        {!mine && <ReadAloud text={m.content} compact className="muted px-2 text-xs" />}
        {!mine && m.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {m.actions.map((a) =>
              /^https?:\/\//i.test(a.link) ? (
                <a key={a.link} href={a.link} target="_blank" rel="noopener noreferrer nofollow" className="chip">
                  {a.label}
                </a>
              ) : a.link.startsWith('/') && !a.link.startsWith('//') ? (
                <Link key={a.link} to={a.link} className="chip">
                  {a.label}
                </Link>
              ) : null,
            )}
          </div>
        )}
        {!mine && m.sources.length > 0 && (
          <ul className="muted space-y-0.5 text-xs">
            {m.sources.map((s, i) => (
              <li key={i}>
                📄 {s.title}
                {s.page ? ` · ${tr.t('ai.page', { page: s.page })}` : ''}
              </li>
            ))}
          </ul>
        )}
        {!mine && (
          <div className="flex gap-1">
            {(['up', 'down'] as const).map((r) => (
              <IconButton
                key={r}
                size="sm"
                label={r === 'up' ? tr.t('assistant.helpful') : tr.t('assistant.notHelpful')}
                active={rating === r}
                onClick={async () => {
                  try {
                    await api.assistant.feedback(m.id, r);
                    setRating(r);
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {r === 'up' ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
              </IconButton>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const tr = useT();
  const qc = useQueryClient();
  const language = useSession((s) => s.me?.appearance.language);
  const threads = useQuery({ queryKey: qk.assistantThreads, queryFn: () => api.assistant.threads() });
  const [threadId, setThreadId] = useState<string | null>(null);
  const thread = useQuery({ queryKey: ['assistant', 'thread', threadId], queryFn: () => api.assistant.thread(threadId!), enabled: !!threadId });
  const [pending, setPending] = useState<AssistantMessageDto[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = [...(thread.data?.messages ?? []), ...pending];

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const send = async (content: string) => {
    const t = content.trim();
    if (!t || busy) return;
    setText('');
    setBusy(true);
    const optimistic: AssistantMessageDto = {
      id: `tmp-${Date.now()}`,
      threadId: threadId ?? '',
      role: 'user',
      content: t,
      sources: [],
      actions: [],
      rating: null,
      createdAt: Date.now(),
    };
    setPending((p) => [...p, optimistic]);
    try {
      const res = await api.assistant.send({ threadId, text: t, language });
      setPending([]);
      if (!threadId) setThreadId(res.threadId);
      await qc.invalidateQueries({ queryKey: ['assistant', 'thread', res.threadId] });
      void qc.invalidateQueries({ queryKey: qk.assistantThreads });
      if (!threadId)
        qc.setQueryData(['assistant', 'thread', res.threadId], {
          thread: { id: res.threadId, title: t.slice(0, 60), updatedAt: Date.now() },
          messages: [res.userMessage, res.message],
        });
    } catch (e) {
      setPending([]);
      setText(t);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page grid h-[calc(100dvh-8rem)] gap-4 !py-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="card hidden flex-col overflow-hidden lg:flex" aria-label={tr.t('assistant.threads')}>
        <div className="border-b border-line p-3">
          <Button
            block
            variant="soft"
            icon={<MessageSquarePlus className="size-4" />}
            onClick={() => {
              setThreadId(null);
              setPending([]);
            }}
          >
            {tr.t('assistant.newChat')}
          </Button>
        </div>
        <ul className="scroll-thin flex-1 overflow-y-auto p-2">
          {threads.data?.items.map((t) => (
            <li key={t.id} className="group flex items-center">
              <button
                type="button"
                className={cx(
                  'min-h-11 flex-1 truncate rounded-[var(--radius-control)] px-3 text-start text-sm font-bold',
                  t.id === threadId ? 'bg-soft text-ink' : 'hover:bg-bg-3',
                )}
                onClick={() => {
                  setThreadId(t.id);
                  setPending([]);
                }}
              >
                {t.title}
              </button>
              <IconButton
                label={tr.t('assistant.deleteThread')}
                size="sm"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={async () => {
                  if (!(await confirmDialog({ title: tr.t('assistant.deleteThread'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                  try {
                    await api.assistant.deleteThread(t.id);
                    if (t.id === threadId) setThreadId(null);
                    await qc.invalidateQueries({ queryKey: qk.assistantThreads });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </aside>
      <section className="card flex min-h-0 flex-col overflow-hidden" aria-label={tr.t('assistant.title')}>
        <header className="flex items-center gap-3 border-b border-line p-3">
          <span className="surface-gradient grid size-10 place-items-center rounded-full">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-black">{tr.t('assistant.title')}</h1>
            <p className="muted truncate text-xs">{tr.t('assistant.subtitle')}</p>
          </div>
        </header>
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-live="polite">
          {thread.isFetching && !messages.length && <Spinner />}
          {!messages.length && !thread.isFetching && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="mb-4 text-xl font-black">{tr.t('assistant.empty')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {tr.dict.assistant.suggestions.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {busy && (
            <div className="flex gap-3" aria-label={tr.t('common.loading')}>
              <span className="surface-gradient grid size-8 place-items-center rounded-full">
                <Bot className="size-4" />
              </span>
              <div className="card flex items-center gap-1 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-bounce rounded-full bg-fg-3" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            className="input max-h-40 min-h-11 flex-1 resize-none rounded-2xl py-2.5"
            rows={1}
            value={text}
            placeholder={tr.t('assistant.placeholder')}
            aria-label={tr.t('assistant.placeholder')}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <Button type="submit" className="!size-11 !rounded-full !p-0" disabled={!text.trim() || busy} aria-label={tr.t('common.send')}>
            <Send className="size-5 flip-rtl" />
          </Button>
        </form>
      </section>
    </div>
  );
}
