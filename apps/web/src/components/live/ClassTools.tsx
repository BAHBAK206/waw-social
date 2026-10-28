import type { LiveRoomDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, LogIn, Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Teacher: split the students in the room into groups, visit a group, message every group, bring everyone back. */
export function BreakoutPanel({ room, people, onVisit }: { room: LiveRoomDto; people: { id: string; name: string }[]; onVisit: (roomId: string) => void }) {
  const tr = useT();
  const [groups, setGroups] = useState(Math.max(2, Math.min(6, Math.ceil(people.length / 4))));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '…';
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4 p-3 text-sm">
      {!room.breakouts.length ? (
        <>
          <p className="muted">{tr.t('liveTools.breakoutHint')}</p>
          <Input
            type="number"
            min={2}
            max={20}
            label={tr.t('liveTools.groups')}
            value={groups}
            onChange={(e) => setGroups(Math.max(2, Math.min(20, Number(e.target.value) || 2)))}
          />
          <Button
            block
            loading={busy === 'open'}
            disabled={people.length < 2}
            onClick={() =>
              void run('open', () =>
                api.live.breakouts(room.id, {
                  groups,
                  participants: people.map((p) => p.id),
                }),
              )
            }
          >
            {tr.t('liveTools.openGroups', { count: people.length })}
          </Button>
          {people.length < 2 && <p className="muted text-xs">{tr.t('liveTools.needPeople')}</p>}
        </>
      ) : (
        <>
          <ul className="space-y-2">
            {room.breakouts.map((b) => (
              <li key={b.id} className="rounded-[var(--radius-control)] border border-line p-2">
                <div className="flex items-center gap-2">
                  <b className="flex-1">{tr.t('liveTools.group', { name: b.name })}</b>
                  <Button size="sm" variant="soft" icon={<LogIn className="size-4" />} onClick={() => onVisit(b.id)}>
                    {tr.t('liveTools.visit')}
                  </Button>
                </div>
                <p className="muted mt-1">{b.members.map(nameOf).join('، ')}</p>
              </li>
            ))}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!msg.trim()) return;
              void run('msg', async () => {
                await api.live.broadcast(room.id, msg.trim());
                setMsg('');
                toast(tr.t('liveTools.sent'));
              });
            }}
          >
            <Input label={tr.t('liveTools.broadcast')} value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} />
            <Button type="submit" size="sm" variant="outline" icon={<Megaphone className="size-4" />} loading={busy === 'msg'} disabled={!msg.trim()}>
              {tr.t('liveTools.sendAll')}
            </Button>
          </form>
          <Button block variant="danger" loading={busy === 'close'} onClick={() => void run('close', () => api.live.closeBreakouts(room.id))}>
            {tr.t('liveTools.closeGroups')}
          </Button>
        </>
      )}
    </div>
  );
}

/** Polls and quick quiz questions: the teacher asks, everyone answers, results appear live. */
export function PollPanel({ roomId, moderator }: { roomId: string; moderator: boolean }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['live-polls', roomId], queryFn: () => api.live.polls(roomId) });
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [correct, setCorrect] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const opts = options
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 6);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4 p-3 text-sm">
      {moderator && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('create', async () => {
              await api.live.createPoll(roomId, { question: question.trim(), options: opts, correct: correct === '' ? null : Number(correct) });
              setQuestion('');
              setOptions('');
              setCorrect('');
            });
          }}
        >
          <Input label={tr.t('liveTools.question')} value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
          <Textarea
            label={tr.t('liveTools.options')}
            hint={tr.t('liveTools.optionsHint')}
            rows={3}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
          <Select
            label={tr.t('liveTools.correct')}
            value={correct}
            onChange={(e) => setCorrect(e.target.value)}
            options={[{ value: '', label: tr.t('liveTools.justPoll') }, ...opts.map((o, i) => ({ value: String(i), label: o }))]}
          />
          <Button type="submit" size="sm" loading={busy === 'create'} disabled={!question.trim() || opts.length < 2}>
            {tr.t('liveTools.ask')}
          </Button>
        </form>
      )}
      {(q.data?.items ?? []).map((p) => {
        const max = Math.max(1, ...(p.counts ?? [1]));
        return (
          <section key={p.id} className="space-y-2 rounded-[var(--radius-control)] border border-line p-3" aria-label={p.question}>
            <div className="flex items-start gap-2">
              <p className="flex-1 font-bold" dir="auto">
                {p.question}
              </p>
              <span className={cx('badge', p.status === 'open' ? 'badge-primary' : '')}>
                {p.status === 'open' ? tr.t('liveTools.open') : tr.t('liveTools.closed')}
              </span>
            </div>
            <ul className="space-y-1.5">
              {p.options.map((o, i) => {
                const chosen = p.myChoice === i;
                const right = p.correct === i;
                const canVote = !moderator && p.status === 'open' && p.myChoice === null;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!canVote || busy === p.id}
                      onClick={() => void run(p.id, () => api.live.vote(p.id, i))}
                      className={cx(
                        'relative w-full overflow-hidden rounded-[var(--radius-control)] border px-3 py-2 text-start',
                        chosen ? 'border-primary' : 'border-line',
                        canVote && 'hover:border-primary',
                      )}
                    >
                      {p.counts && <span className="absolute inset-y-0 start-0 bg-soft" style={{ width: `${(p.counts[i]! / max) * 100}%` }} aria-hidden />}
                      <span className="relative flex items-center gap-2">
                        <span className="flex-1" dir="auto">
                          {o}
                        </span>
                        {right && <Check className="size-4 text-ok" aria-label={tr.t('liveTools.right')} />}
                        {chosen && p.correct !== null && !right && <X className="size-4 text-err" aria-hidden />}
                        {p.counts && <span className="tabular-nums">{p.counts[i]}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="muted text-xs">
              {tr.t('liveTools.answers', { count: p.total })}
              {!moderator && p.myChoice !== null && p.status === 'open' ? ` · ${tr.t('liveTools.answerSent')}` : ''}
            </p>
            {moderator && p.status === 'open' && (
              <Button size="sm" variant="outline" loading={busy === `c${p.id}`} onClick={() => void run(`c${p.id}`, () => api.live.closePoll(p.id))}>
                {tr.t('liveTools.showResults')}
              </Button>
            )}
          </section>
        );
      })}
      {!q.data?.items.length && !moderator && <p className="muted">{tr.t('liveTools.noPolls')}</p>}
    </div>
  );
}

/** Teacher: who is here and for how long (filled into the class register when the lesson ends). */
export function AttendancePanel({ roomId }: { roomId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['live-attendance', roomId], queryFn: () => api.live.attendance(roomId), refetchInterval: 30_000 });
  return (
    <div className="space-y-2 p-3 text-sm">
      <p className="muted">{tr.t('liveTools.attendanceHint')}</p>
      <ul className="divide-y divide-line">
        {(q.data?.items ?? []).map((a) => (
          <li key={a.user.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 font-bold" dir="auto">
              {a.user.displayName}
            </span>
            <span className="tabular-nums">{tr.t('liveTools.minutes', { count: a.minutes })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
