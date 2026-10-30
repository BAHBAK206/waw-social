import { LIMITS, type NoteDto, type TaskDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListTodo, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, fromLocalInput, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { confirmDialog, toastError } from '@/lib/ui';

const TABS = ['tasks', 'notes'] as const;
const PRIORITY = { low: 'badge', medium: 'badge-warn', high: 'badge-err' } as const;
const NOTE_COLORS: Record<NoteDto['color'], string> = {
  default: 'var(--card)',
  yellow: 'color-mix(in srgb, #fdcb6e 28%, var(--card))',
  green: 'color-mix(in srgb, #55efc4 25%, var(--card))',
  blue: 'color-mix(in srgb, #74b9ff 25%, var(--card))',
  pink: 'color-mix(in srgb, #fd79a8 25%, var(--card))',
  purple: 'color-mix(in srgb, #a29bfe 28%, var(--card))',
};

function TaskForm({ task, onClose }: { task?: TaskDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    dueAt: toLocalInput(task?.dueAt),
    priority: task?.priority ?? ('medium' as TaskDto['priority']),
    tags: task?.tags.join(', ') ?? '',
    subtasks: task?.subtasks ?? [],
  });
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={task ? tr.t('common.edit') : tr.t('organizer.addTask')}
      footer={
        <Button
          loading={busy}
          disabled={!f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const body = {
                title: f.title.trim(),
                notes: f.notes,
                dueAt: fromLocalInput(f.dueAt),
                priority: f.priority,
                tags: f.tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 10),
                subtasks: f.subtasks,
              };
              if (task) await api.tasks.update(task.id, body);
              else await api.tasks.create(body);
              void qc.invalidateQueries({ queryKey: qk.tasks });
              void qc.invalidateQueries({ queryKey: qk.dashboard });
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('organizer.taskTitle')} value={f.title} maxLength={LIMITS.taskTitle} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="datetime-local" label={tr.t('organizer.due')} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          <Select
            label={tr.t('organizer.priority')}
            value={f.priority}
            onChange={(e) => setF({ ...f, priority: e.target.value as TaskDto['priority'] })}
            options={(['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: tr.t(`organizer.priorities.${p}`) }))}
          />
        </div>
        <Input label={tr.t('organizer.tags')} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <div>
          <p className="field-label">{tr.t('organizer.subtasks')}</p>
          <ul className="mb-2 space-y-1">
            {f.subtasks.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={s.done}
                  aria-label={s.title}
                  onChange={(e) => setF({ ...f, subtasks: f.subtasks.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)) })}
                />
                <span className="flex-1" dir="auto">
                  {s.title}
                </span>
                <IconButton label={tr.t('common.remove')} size="sm" onClick={() => setF({ ...f, subtasks: f.subtasks.filter((_, k) => k !== i) })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sub.trim()) {
                setF({ ...f, subtasks: [...f.subtasks, { title: sub.trim(), done: false }].slice(0, 30) });
                setSub('');
              }
            }}
          >
            <input
              className="input"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder={tr.t('organizer.addSubtask')}
              aria-label={tr.t('organizer.addSubtask')}
            />
            <Button type="submit" variant="soft" icon={<Plus className="size-4" />} aria-label={tr.t('organizer.addSubtask')} />
          </form>
        </div>
      </div>
    </Modal>
  );
}

function Tasks() {
  const tr = useT();
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<TaskDto | 'new' | null>(null);
  const q = useQuery({ queryKey: [...qk.tasks, showDone], queryFn: () => api.tasks.list(showDone ? undefined : 'open') });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.tasks });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };
  const cycle = async (t: TaskDto) => {
    const next = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
    try {
      await api.tasks.update(t.id, { status: next });
      refresh();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {tr.t('organizer.addTask')}
        </Button>
        <label className="ms-auto flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />{' '}
          {tr.t('organizer.showDone')}
        </label>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<ListTodo className="size-7" />} title={tr.t('organizer.noTasks')} />}>
        {(d) => (
          <ul className="space-y-2">
            {d.items.map((t) => {
              const overdue = t.dueAt && t.status !== 'done' && t.dueAt < Date.now();
              return (
                <li key={t.id} className={cx('card flex items-start gap-3 p-3', t.status === 'done' && 'opacity-60')}>
                  <button
                    type="button"
                    aria-label={tr.t(`organizer.statuses.${t.status}`)}
                    title={tr.t(`organizer.statuses.${t.status}`)}
                    onClick={() => void cycle(t)}
                    className={cx(
                      'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2',
                      t.status === 'done' ? 'border-ok bg-ok-fill text-white' : t.status === 'doing' ? 'border-primary bg-soft' : 'border-line',
                    )}
                  >
                    {t.status === 'done' && <Check className="size-4" />}
                    {t.status === 'doing' && <span className="size-2 rounded-full bg-primary" />}
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(t)}>
                    <p className={cx('font-bold', t.status === 'done' && 'line-through')} dir="auto">
                      {t.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={cx('badge', PRIORITY[t.priority])}>{tr.t(`organizer.priorities.${t.priority}`)}</span>
                      {t.dueAt && (
                        <span className={cx('badge', overdue && 'badge-err')}>
                          {overdue ? `${tr.t('organizer.overdue')} · ` : ''}
                          {formatDate(t.dueAt, tr, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {t.tags.map((tag) => (
                        <span key={tag} className="badge badge-primary">
                          #{tag}
                        </span>
                      ))}
                      {t.subtasks.length > 0 && (
                        <span className="muted">
                          {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                        </span>
                      )}
                    </p>
                  </button>
                  <IconButton
                    label={tr.t('common.delete')}
                    size="sm"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                      try {
                        await api.tasks.remove(t.id);
                        refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-err" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {editing && <TaskForm task={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function NoteEditor({ note, onClose }: { note?: NoteDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: note?.title ?? '',
    body: note?.body ?? '',
    color: note?.color ?? ('default' as NoteDto['color']),
    pinned: note?.pinned ?? false,
  });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={note ? tr.t('common.edit') : tr.t('organizer.addNote')}
      footer={
        <Button
          loading={busy}
          disabled={!f.title.trim() && !f.body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const body = { ...f, title: f.title.trim() || tr.t('common.untitled'), tags: note?.tags ?? [] };
              if (note) await api.notes.update(note.id, body);
              else await api.notes.create(body);
              void qc.invalidateQueries({ queryKey: qk.notes });
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3 rounded-[var(--radius-control)] p-3" style={{ background: NOTE_COLORS[f.color] }}>
        <input
          className="input bg-transparent text-lg font-black"
          value={f.title}
          maxLength={200}
          placeholder={tr.t('organizer.noteTitle')}
          aria-label={tr.t('organizer.noteTitle')}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          dir="auto"
        />
        <textarea
          className="input min-h-56 bg-transparent"
          value={f.body}
          maxLength={LIMITS.noteBody}
          placeholder={tr.t('organizer.noteBody')}
          aria-label={tr.t('organizer.noteBody')}
          onChange={(e) => setF({ ...f, body: e.target.value })}
          dir="auto"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={tr.t('organizer.colors')}>
        {(Object.keys(NOTE_COLORS) as NoteDto['color'][]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={f.color === c}
            aria-label={c}
            onClick={() => setF({ ...f, color: c })}
            className={cx(
              'size-8 rounded-full border border-line',
              f.color === c && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card-solid)]',
            )}
            style={{ background: NOTE_COLORS[c] }}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          icon={f.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          onClick={() => setF({ ...f, pinned: !f.pinned })}
        >
          {f.pinned ? tr.t('common.unpin') : tr.t('common.pin')}
        </Button>
      </div>
    </Modal>
  );
}

function Notes() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.notes, queryFn: () => api.notes.list() });
  const [editing, setEditing] = useState<NoteDto | 'new' | null>(null);
  const [term, setTerm] = useState('');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-sm"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={tr.t('organizer.searchNotes')}
          aria-label={tr.t('organizer.searchNotes')}
        />
        <Button className="ms-auto" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {tr.t('organizer.addNote')}
        </Button>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<StickyNote className="size-7" />} title={tr.t('organizer.noNotes')} />}>
        {(d) => {
          const list = d.items.filter((n) => !term.trim() || `${n.title} ${n.body}`.toLowerCase().includes(term.trim().toLowerCase()));
          return (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((n) => (
                <li key={n.id} className="card group relative p-4" style={{ background: NOTE_COLORS[n.color] }}>
                  <button type="button" className="block w-full text-start" onClick={() => setEditing(n)}>
                    <p className="flex items-center gap-1 font-black" dir="auto">
                      {n.pinned && <Pin className="size-3.5 shrink-0" aria-label={tr.t('common.pinned')} />}
                      <span className="truncate">{n.title}</span>
                    </p>
                    <p className="line-clamp-6 mt-1 whitespace-pre-wrap text-sm" dir="auto">
                      {n.body}
                    </p>
                  </button>
                  <IconButton
                    label={tr.t('common.delete')}
                    size="sm"
                    className="absolute end-1 top-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                      try {
                        await api.notes.remove(n.id);
                        void qc.invalidateQueries({ queryKey: qk.notes });
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
          );
        }}
      </QueryState>
      {editing && <NoteEditor note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function OrganizerPage() {
  const tr = useT();
  const [tab, setTab] = useTabParam(TABS, 'tasks');
  return (
    <div className="page-narrow !max-w-5xl">
      <PageHeader title={tr.t('organizer.title')} icon={<ListTodo className="size-6" />} />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'tasks', label: tr.t('organizer.tasks'), icon: <ListTodo className="size-4" /> },
          { key: 'notes', label: tr.t('organizer.notes'), icon: <StickyNote className="size-4" /> },
        ]}
      />
      {tab === 'tasks' ? <Tasks /> : <Notes />}
    </div>
  );
}
