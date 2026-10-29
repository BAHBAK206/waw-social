import type { ExamDto, FlashcardDto, MasteryDto, StudySessionDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, Download, Layers, Pencil, Play, Plus, Target, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FlashcardReviewer } from '@/components/overlays/Flashcards';
import { PomodoroPanel } from '@/components/overlays/Pomodoro';
import { FocusPanel } from '@/components/study/focus';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { ColumnChart, ProgressBar } from '@/components/ui/Charts';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api, downloadResponse } from '@/lib/api';
import { cx } from '@/lib/cx';
import { daysUntil, formatDate, todayKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { confirmDialog, toast, toastError } from '@/lib/ui';

const TABS = ['today', 'plan', 'sessions', 'exams', 'cards', 'mastery', 'focus'] as const;

function Today() {
  const tr = useT();
  const q = useQuery({ queryKey: qk.dashboard, queryFn: () => api.academic.dashboard() });
  const log = useQuery({ queryKey: ['study-log'], queryFn: () => api.academic.studyLog(30) });
  return (
    <QueryState query={q}>
      {(d) => (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-black">
              <Target className="size-5 text-ink" /> {tr.t('home.inbox')}
            </h2>
            {!d.inbox.length ? (
              <p className="muted">{tr.t('home.inboxEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.inbox.map((it, i) => (
                  <li key={i}>
                    <Link to={it.link} className="flex min-h-12 items-center gap-3 py-2">
                      <span className="badge badge-primary">{tr.tDyn(`academic.inboxKinds.${it.kind}`, undefined, it.kind)}</span>
                      <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                        {it.title}
                        {it.count ? ` (${it.count})` : ''}
                      </span>
                      {it.dueAt && <span className="muted text-xs">{formatDate(it.dueAt, tr, { month: 'short', day: 'numeric' })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <ColumnChart
              title={tr.t('home.weekActivity')}
              unit="min"
              data={d.weeklyMinutes.map((w) => ({
                label: formatDate(w.day, tr, { weekday: 'short' }).slice(0, 3),
                title: formatDate(w.day, tr),
                value: w.minutes,
              }))}
              height={170}
            />
          </section>
          {log.data && log.data.items.length > 0 && (
            <section className="card p-4 lg:col-span-2">
              <ColumnChart
                title={`${tr.t('academic.tabs.focus')} · 30`}
                unit="min"
                data={log.data.items.slice(-30).map((l) => ({ label: l.day.slice(8), title: formatDate(l.day, tr), value: l.minutes }))}
                height={140}
              />
            </section>
          )}
        </div>
      )}
    </QueryState>
  );
}

const blockLink = (b: { kind: string; refId?: string }) =>
  b.kind === 'exam'
    ? '/academic?tab=exams'
    : b.kind === 'assignment' && b.refId
      ? `/school/assignments/${b.refId}`
      : b.kind === 'task'
        ? '/organizer?tab=tasks'
        : b.kind === 'review'
          ? '/academic?tab=cards'
          : '/academic?tab=sessions';

const KIND_STYLE: Record<string, string> = { exam: 'badge-err', assignment: 'badge-warn', task: 'badge-primary', review: 'badge-ok', session: '' };

function Plan() {
  const tr = useT();
  const [budget, setBudget] = useState(90);
  const q = useQuery({ queryKey: ['weekly-plan', budget], queryFn: () => api.academic.weeklyPlan({ budget, days: 7 }) });
  const qc = useQueryClient();
  const schedule = useMutation({
    mutationFn: () => api.study.schedule({ budget, days: 7 }),
    onSuccess: (r) => {
      toast(tr.t('academic.plan.scheduled', { count: r.created }));
      void qc.invalidateQueries({ queryKey: ['weekly-plan'] });
      void qc.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: toastError,
  });
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-4 p-3">
        <label className="flex items-center gap-3 text-sm font-bold">
          {tr.t('academic.plan.budget')}
          <input
            type="range"
            min={30}
            max={360}
            step={15}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-40 accent-[var(--primary)]"
          />
          <span className="tabular-nums">{budget}</span>
        </label>
        <Button variant="soft" size="sm" loading={schedule.isPending} title={tr.t('academic.plan.scheduleHint')} onClick={() => schedule.mutate()}>
          {tr.t('academic.plan.schedule')}
        </Button>
      </div>
      <QueryState query={q}>
        {(plan) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {plan.days.map((d) => (
              <section key={d.day} className={cx('card p-3', d.day === todayKey() && 'ring-2 ring-[var(--primary)]')}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-black">{formatDate(d.day, tr, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                  <span className="muted text-xs tabular-nums">
                    {d.minutes}/{plan.budget}
                  </span>
                </div>
                <ProgressBar value={d.minutes} max={plan.budget} className="mb-3 !h-1.5" label={d.day} />
                {!d.blocks.length ? (
                  <p className="muted text-sm">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.blocks.map((b, i) => (
                      <li key={i}>
                        <Link to={blockLink(b)} className="flex items-center gap-2 rounded-lg bg-bg-2 px-2 py-1.5 text-sm hover:bg-bg-3">
                          <span className={cx('badge', KIND_STYLE[b.kind])}>{tr.tDyn(`academic.plan.kinds.${b.kind}`, undefined, b.kind)}</span>
                          <span className="min-w-0 flex-1 truncate" dir="auto">
                            {b.title}
                          </span>
                          <span className="muted tabular-nums">{b.minutes}′</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            {!plan.days.some((d) => d.blocks.length) && (
              <div className="md:col-span-2 xl:col-span-4">
                <EmptyState title={tr.t('academic.plan.empty')} />
              </div>
            )}
            {plan.overflow.length > 0 && (
              <section className="card p-3 md:col-span-2 xl:col-span-4">
                <h3 className="mb-2 font-black text-warn">{tr.t('academic.plan.overflow')}</h3>
                <ul className="flex flex-wrap gap-2">
                  {plan.overflow.map((b, i) => (
                    <li key={i} className="badge">
                      {b.title} · {b.minutes}′
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function SessionForm({ item, onClose }: { item?: StudySessionDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: item?.title ?? '',
    subject: item?.subject ?? '',
    day: item?.day ?? todayKey(),
    startTime: item?.startTime ?? '',
    minutes: item?.minutes ?? 45,
    notes: item?.notes ?? '',
  });
  const m = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title.trim(),
        subject: f.subject.trim() || null,
        day: f.day,
        startTime: f.startTime || null,
        minutes: f.minutes,
        notes: f.notes.trim() || null,
        completed: item?.completed ?? false,
      };
      return item ? api.sessions.update(item.id, body) : api.sessions.create(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sessions });
      void qc.invalidateQueries({ queryKey: ['weekly-plan'] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('academic.addSession')}
      footer={
        <Button loading={m.isPending} disabled={!f.title.trim()} onClick={() => m.mutate()}>
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('academic.sessionTitle')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={tr.t('academic.subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <Input
            type="number"
            min={5}
            max={600}
            label={tr.t('academic.length')}
            value={f.minutes}
            onChange={(e) => setF({ ...f, minutes: Math.max(5, Number(e.target.value) || 45) })}
          />
          <Input type="date" label={tr.t('common.date')} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          <Input type="time" label={tr.t('academic.startTime')} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </div>
        <Textarea label={tr.t('common.description')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  );
}

function Sessions() {
  const tr = useT();
  const qc = useQueryClient();
  const from = todayKey(new Date(Date.now() - 7 * 86_400_000));
  const q = useQuery({ queryKey: qk.sessions, queryFn: () => api.sessions.list({ from }) });
  const [editing, setEditing] = useState<StudySessionDto | 'new' | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.sessions });
    void qc.invalidateQueries({ queryKey: ['weekly-plan'] });
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {tr.t('academic.addSession')}
        </Button>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title={tr.t('common.empty')} />}>
        {(d) => (
          <ul className="space-y-2">
            {d.items.map((s) => (
              <li key={s.id} className={cx('card flex items-center gap-3 p-3', s.completed && 'opacity-60')}>
                <button
                  type="button"
                  aria-label={tr.t('academic.markDone')}
                  aria-pressed={s.completed}
                  className={cx(
                    'grid size-8 shrink-0 place-items-center rounded-full border-2',
                    s.completed ? 'border-ok bg-ok-fill text-white' : 'border-line',
                  )}
                  onClick={async () => {
                    try {
                      await api.sessions.update(s.id, { completed: !s.completed });
                      refresh();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  {s.completed && <Check className="size-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cx('truncate font-bold', s.completed && 'line-through')} dir="auto">
                    {s.title}
                  </p>
                  <p className="muted text-sm">
                    {formatDate(s.day, tr, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {s.startTime ? ` · ${s.startTime}` : ''} · {tr.t('common.minutes', { count: s.minutes })}
                    {s.subject ? ` · ${s.subject}` : ''}
                  </p>
                </div>
                <IconButton label={tr.t('common.edit')} size="sm" onClick={() => setEditing(s)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={tr.t('common.delete')}
                  size="sm"
                  onClick={async () => {
                    if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                    try {
                      await api.sessions.remove(s.id);
                      refresh();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Trash2 className="size-4 text-err" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {editing && <SessionForm item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExamForm({ item, onClose }: { item?: ExamDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    subject: item?.subject ?? '',
    day: item?.day ?? todayKey(new Date(Date.now() + 7 * 86_400_000)),
    time: item?.time ?? '',
    place: item?.place ?? '',
    notes: item?.notes ?? '',
  });
  const m = useMutation({
    mutationFn: () => {
      const body = { subject: f.subject.trim(), day: f.day, time: f.time || null, place: f.place.trim() || null, notes: f.notes.trim() || null };
      return item ? api.exams.update(item.id, body) : api.exams.create(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.exams });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ['weekly-plan'] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('academic.addExam')}
      footer={
        <Button loading={m.isPending} disabled={!f.subject.trim()} onClick={() => m.mutate()}>
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('academic.subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={120} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="date" label={tr.t('common.date')} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          <Input type="time" label={tr.t('common.time')} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </div>
        <Input label={tr.t('common.place')} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  );
}

function Exams() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.exams, queryFn: () => api.exams.list() });
  const [editing, setEditing] = useState<ExamDto | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          icon={<Download className="size-4" />}
          onClick={async () => downloadResponse(await api.exams.ics(), 'exams.ics').catch(toastError)}
        >
          {tr.t('academic.exportIcs')}
        </Button>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {tr.t('academic.addExam')}
        </Button>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Calendar className="size-7" />} title={tr.t('home.noExams')} />}>
        {(d) => (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((e) => {
              const n = daysUntil(e.day);
              return (
                <li key={e.id} className={cx('card flex gap-3 p-3', n < 0 && 'opacity-60')}>
                  <span
                    className={cx(
                      'grid size-14 shrink-0 place-items-center rounded-xl text-center font-black',
                      n < 0 ? 'bg-bg-3' : n <= 3 ? 'bg-err-fill text-white' : 'bg-soft text-ink',
                    )}
                  >
                    <span className="text-xl tabular-nums">{n < 0 ? '✓' : n}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black" dir="auto">
                      {e.subject}
                    </p>
                    <p className="muted text-sm">
                      {formatDate(e.day, tr)}
                      {e.time ? ` · ${e.time}` : ''}
                    </p>
                    <p className="text-sm font-bold">
                      {n < 0 ? tr.t('academic.passed') : n === 0 ? tr.t('academic.examToday') : tr.t('academic.countdown', { count: n })}
                    </p>
                    {e.place && <p className="muted truncate text-xs">{e.place}</p>}
                  </div>
                  <div className="flex flex-col">
                    <IconButton label={tr.t('common.edit')} size="sm" onClick={() => setEditing(e)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={tr.t('common.delete')}
                      size="sm"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                        try {
                          await api.exams.remove(e.id);
                          void qc.invalidateQueries({ queryKey: qk.exams });
                          void qc.invalidateQueries({ queryKey: qk.dashboard });
                        } catch (er) {
                          toastError(er);
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-err" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {editing && <ExamForm item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Cards() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.flashcards, queryFn: () => api.flashcards.list() });
  const [deck, setDeck] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deckName, setDeckName] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: qk.flashcards });
  const decks = q.data?.decks ?? [];
  const shown = (q.data?.items ?? []).filter((c: FlashcardDto) => !deck || c.deck === deck);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Play className="size-4" />} disabled={!q.data?.dueCount} onClick={() => setReviewing(true)}>
          {tr.t('academic.cards.review')}
          {q.data?.dueCount ? ` (${tr.t('academic.cards.due', { count: q.data.dueCount })})` : ''}
        </Button>
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          {tr.t('academic.cards.add')}
        </Button>
        <Select
          aria-label={tr.t('academic.cards.deck')}
          wrapperClassName="ms-auto w-48"
          value={deck}
          placeholder={tr.t('academic.cards.decks')}
          onChange={(e) => setDeck(e.target.value)}
          options={decks.map((d) => ({ value: d.name, label: `${d.name} (${d.count})` }))}
        />
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Layers className="size-7" />} title={tr.t('academic.cards.noneDue')} />}>
        {() => (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <li key={c.id} className="card flex flex-col p-3">
                <span className="badge mb-2 self-start">{c.deck}</span>
                <p className="line-clamp-3 font-bold" dir="auto">
                  {c.front}
                </p>
                <p className="muted line-clamp-2 mt-1 text-sm" dir="auto">
                  {c.back}
                </p>
                <div className="mt-auto flex items-center pt-2">
                  <span className="muted text-xs">
                    {c.dueAt <= Date.now() ? tr.t('common.today') : formatDate(c.dueAt, tr, { month: 'short', day: 'numeric' })}
                  </span>
                  <IconButton
                    label={tr.t('common.delete')}
                    size="sm"
                    className="ms-auto"
                    onClick={async () => {
                      try {
                        await api.flashcards.remove(c.id);
                        await refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Modal
        open={reviewing}
        onClose={() => {
          setReviewing(false);
          void refresh();
        }}
        title={tr.t('academic.cards.title')}
        size="lg"
      >
        <FlashcardReviewer
          deck={deck || undefined}
          onDone={() => {
            setReviewing(false);
            void refresh();
          }}
        />
      </Modal>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={tr.t('academic.cards.add')}
        footer={
          <Button
            disabled={bulk ? !bulkText.trim() : !front.trim() || !back.trim()}
            onClick={async () => {
              try {
                const dn = deckName.trim() || deck || 'General';
                const cards = bulk
                  ? bulkText
                      .split('\n')
                      .map((l) => l.split('|'))
                      .filter((p) => p.length >= 2 && p[0]!.trim() && p[1]!.trim())
                      .map((p) => ({ front: p[0]!.trim(), back: p.slice(1).join('|').trim(), deck: dn }))
                  : [{ front: front.trim(), back: back.trim(), deck: dn }];
                if (!cards.length) return;
                await api.flashcards.create(cards);
                setFront('');
                setBack('');
                setBulkText('');
                setAdding(false);
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('common.save')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label={tr.t('academic.cards.deck')}
            value={deckName}
            placeholder={deck || 'General'}
            onChange={(e) => setDeckName(e.target.value)}
            list="deck-names"
          />
          <datalist id="deck-names">
            {decks.map((d) => (
              <option key={d.name} value={d.name} />
            ))}
          </datalist>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={bulk} onChange={(e) => setBulk(e.target.checked)} />{' '}
            {tr.t('academic.cards.bulk')}
          </label>
          {bulk ? (
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="min-h-40"
              placeholder="front | back"
              aria-label={tr.t('academic.cards.bulk')}
            />
          ) : (
            <>
              <Textarea label={tr.t('academic.cards.front')} value={front} onChange={(e) => setFront(e.target.value)} />
              <Textarea label={tr.t('academic.cards.back')} value={back} onChange={(e) => setBack(e.target.value)} />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

const LEVEL_STYLE = { needs_review: 'badge-err', developing: 'badge-warn', proficient: 'badge-primary', strong: 'badge-ok' } as const;

function Mastery() {
  const tr = useT();
  const q = useQuery({ queryKey: qk.mastery, queryFn: () => api.quizzes.mastery() });
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <QueryState
      query={q}
      isEmpty={(d) => !d.items.length}
      empty={
        <EmptyState
          icon={<Target className="size-7" />}
          title={tr.t('academic.mastery.empty')}
          action={<ButtonLink to="/quiz">{tr.t('home.practice')}</ButtonLink>}
        />
      }
    >
      {(d) => (
        <ul className="grid gap-3 md:grid-cols-2">
          {d.items.map((m: MasteryDto) => (
            <li key={m.key} className="card p-4">
              <div className="mb-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-black" dir="auto">
                  {m.topic}
                </p>
                <span className={cx('badge', LEVEL_STYLE[m.level])}>{tr.t(`academic.mastery.levels.${m.level}`)}</span>
              </div>
              <ProgressBar value={m.mastery} label={m.topic} />
              <p className="muted mt-1 flex flex-wrap gap-x-3 text-xs">
                <span className="tabular-nums">{Math.round(m.mastery)}%</span>
                <span>{tr.t(`academic.mastery.trend.${m.trend}`)}</span>
                <span>{tr.t('academic.mastery.evidence', { count: m.evidenceQuestions })}</span>
              </p>
              <Button
                size="sm"
                variant="soft"
                className="mt-3"
                loading={busy === m.key}
                onClick={async () => {
                  setBusy(m.key);
                  try {
                    const a = await api.quizzes.adaptive({ topic: m.topic, courseId: m.courseId, count: 8 });
                    location.assign(`/quiz/attempt/${a.attemptId}`);
                  } catch (e) {
                    toastError(e);
                    setBusy(null);
                  }
                }}
              >
                {tr.t('academic.mastery.practice')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

export default function AcademicPage() {
  const tr = useT();
  const [tab, setTab] = useTabParam(TABS, 'today');
  return (
    <div className="page">
      <PageHeader title={tr.t('academic.title')} icon={<Timer className="size-6" />} />
      <Tabs className="mb-5" active={tab} onChange={setTab} tabs={TABS.map((k) => ({ key: k, label: tr.t(`academic.tabs.${k}`) }))} />
      {tab === 'today' && <Today />}
      {tab === 'plan' && <Plan />}
      {tab === 'sessions' && <Sessions />}
      {tab === 'exams' && <Exams />}
      {tab === 'cards' && <Cards />}
      {tab === 'mastery' && <Mastery />}
      {tab === 'focus' && (
        <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
          <div className="card p-6">
            <PomodoroPanel />
          </div>
          <FocusPanel />
        </div>
      )}
    </div>
  );
}
