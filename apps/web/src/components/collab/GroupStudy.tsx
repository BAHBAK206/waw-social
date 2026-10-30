import type { GroupDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { UserChip } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { CardSkeletons, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

function Sessions({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['group', g.id, 'sessions'], queryFn: () => api.events.list({ scope: 'upcoming', groupId: g.id, limit: 10 }) });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const at = fromLocalInput(when);
  const create = useMutation({
    mutationFn: () => api.events.create({ title: title.trim(), startsAt: at!, groupId: g.id, location: '' }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setWhen('');
      void qc.invalidateQueries({ queryKey: ['group', g.id, 'sessions'] });
    },
    onError: toastError,
  });
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black">{tr.t('collab.sessions')}</h3>
        <Button size="sm" variant="soft" icon={<CalendarPlus className="size-4" />} onClick={() => setOpen((v) => !v)}>
          {tr.t('collab.scheduleSession')}
        </Button>
      </div>
      {open && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && at) create.mutate();
          }}
        >
          <Input label={tr.t('collab.sessionTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} dir="auto" />
          <Input type="datetime-local" label={tr.t('collab.sessionWhen')} value={when} onChange={(e) => setWhen(e.target.value)} dir="ltr" />
          <Button type="submit" loading={create.isPending} disabled={!title.trim() || !at || at < Date.now()}>
            {tr.t('common.create')}
          </Button>
        </form>
      )}
      {!q.data?.items.length ? (
        <p className="muted text-sm">{tr.t('collab.noSessions')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold" dir="auto">
                  {e.title}
                </span>
                <span className="muted text-xs">{formatDateTime(e.startsAt, tr)}</span>
              </span>
              <Link to={`/events/${e.id}`} className="btn btn-soft btn-sm">
                {tr.t('collab.join')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GroupStudy({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['group', g.id, 'study'], queryFn: () => api.collab.groupStudy(g.id) });
  const [title, setTitle] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['group', g.id, 'study'] });
  const add = useMutation({
    mutationFn: () => api.collab.addTask(g.id, title.trim()),
    onSuccess: () => {
      setTitle('');
      void refresh();
    },
    onError: toastError,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => api.collab.setTask(g.id, v.id, v.done),
    onSuccess: refresh,
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.collab.removeTask(g.id, id), onSuccess: refresh, onError: toastError });
  if (q.isPending) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('collab.tasks')}</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) add.mutate();
            }}
          >
            <Input
              aria-label={tr.t('collab.taskPlaceholder')}
              placeholder={tr.t('collab.taskPlaceholder')}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              dir="auto"
              wrapperClassName="flex-1"
            />
            <Button type="submit" aria-label={tr.t('common.create')} loading={add.isPending} disabled={!title.trim()}>
              <Plus className="size-5" />
            </Button>
          </form>
          {!d.tasks.length ? (
            <p className="muted text-sm">{tr.t('collab.noTasks')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={t.done}
                    aria-label={t.title}
                    onClick={() => toggle.mutate({ id: t.id, done: !t.done })}
                    className={`grid size-6 shrink-0 place-items-center rounded-md border ${t.done ? 'border-ok bg-ok text-white' : 'border-line'}`}
                  >
                    {t.done && <Check className="size-4" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className={`block ${t.done ? 'muted line-through' : 'font-bold'}`} dir="auto">
                      {t.title}
                    </span>
                    {t.done && t.doneByName && <span className="muted text-xs">{tr.t('collab.doneBy', { name: t.doneByName })}</span>}
                  </span>
                  <IconButton label={tr.t('common.delete')} size="sm" onClick={() => remove.mutate(t.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Sessions g={g} />
      </div>
      <section className="card space-y-3 self-start p-4">
        <h3 className="font-black">{tr.t('collab.board')}</h3>
        <p className="muted text-sm">{tr.t('collab.groupTotal', { minutes: d.totalMinutes })}</p>
        <ol className="space-y-2">
          {d.board.map((b) => (
            <li key={b.user.id} className="flex items-center gap-3">
              <span className="w-6 text-center font-black tabular-nums">{b.rank}</span>
              <UserChip user={b.user} className="flex-1" />
              <span className="font-black tabular-nums">{tr.t('collab.minutes', { count: b.minutes })}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
