import type { MeetingSlotDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

function SlotRow({ s, onCancel }: { s: MeetingSlotDto; onCancel?: () => void }) {
  const tr = useT();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="font-bold tabular-nums">{formatDateTime(s.startsAt, tr)}</span>
      <span className={cx('badge', s.status === 'booked' ? 'badge-primary' : s.status === 'cancelled' ? 'badge-err' : 'badge-ok')}>
        {s.status === 'open'
          ? tr.t('parentComms.meetings.open')
          : s.status === 'booked'
            ? tr.t('parentComms.meetings.booked', { parent: s.booking?.parent.displayName ?? '', student: s.booking?.student.displayName ?? '' })
            : tr.t('parentComms.meetings.cancelled')}
      </span>
      {s.booking?.note && (
        <span className="muted min-w-0 flex-1 truncate text-xs" dir="auto">
          {s.booking.note}
        </span>
      )}
      <span className="flex-1" />
      {onCancel && s.status !== 'cancelled' && (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {tr.t('parentComms.meetings.cancel')}
        </Button>
      )}
    </li>
  );
}

function TeacherView() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meetings', 'mine'], queryFn: () => api.parentComms.myMeetings() });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [len, setLen] = useState(15);
  const a = fromLocalInput(from);
  const b = fromLocalInput(to);
  const publish = useMutation({
    mutationFn: () => api.parentComms.publishSlots({ startsAt: a!, endsAt: b!, slotMinutes: len }),
    onSuccess: (r) => {
      toast(tr.t('parentComms.meetings.created', { count: r.created }));
      void qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: toastError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.parentComms.cancelSlot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
    onError: toastError,
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <section className="card p-4">
        <h2 className="mb-2 font-black">{tr.t('parentComms.meetings.mine')}</h2>
        <QueryState query={q}>
          {(d) =>
            !d.items.length ? (
              <p className="muted text-sm">{tr.t('parentComms.meetings.none')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.items.map((s) => (
                  <SlotRow key={s.id} s={s} onCancel={() => cancel.mutate(s.id)} />
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
      <section className="card space-y-3 self-start p-4">
        <h2 className="font-black">{tr.t('parentComms.meetings.publish')}</h2>
        <Input type="datetime-local" label={tr.t('parentComms.meetings.from')} value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <Input type="datetime-local" label={tr.t('parentComms.meetings.to')} value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <Input
          type="number"
          min={10}
          max={60}
          step={5}
          label={tr.t('parentComms.meetings.length')}
          value={len}
          onChange={(e) => setLen(Number(e.target.value))}
          dir="ltr"
        />
        <Button loading={publish.isPending} disabled={!a || !b || b <= a || a < Date.now()} onClick={() => publish.mutate()}>
          {tr.t('parentComms.meetings.create')}
        </Button>
      </section>
    </div>
  );
}

function ParentView() {
  const tr = useT();
  const qc = useQueryClient();
  const teachers = useQuery({ queryKey: ['meetings', 'teachers'], queryFn: () => api.parentComms.meetingTeachers() });
  const mine = useQuery({ queryKey: ['meetings', 'mine'], queryFn: () => api.parentComms.myMeetings() });
  const [picking, setPicking] = useState<{ slot: MeetingSlotDto; children: { id: string; displayName: string }[] } | null>(null);
  const [child, setChild] = useState('');
  const [note, setNote] = useState('');
  const book = useMutation({
    mutationFn: () => api.parentComms.bookSlot(picking!.slot.id, child || picking!.children[0]!.id, note),
    onSuccess: () => {
      toast(tr.t('parentComms.meetings.booked_ok'));
      setPicking(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (e) => {
      toastError(e);
      void qc.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.parentComms.cancelSlot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
    onError: toastError,
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3">
        <h2 className="font-black">{tr.t('parentComms.meetings.teachers')}</h2>
        <QueryState query={teachers}>
          {(d) =>
            !d.items.length ? (
              <EmptyState icon={<CalendarCheck className="size-7" />} title={tr.t('parentComms.meetings.noTeachers')} />
            ) : (
              d.items.map((t) => (
                <article key={t.teacher.id} className="card space-y-2 p-4">
                  <p className="font-black" dir="auto">
                    {t.teacher.displayName}
                  </p>
                  <p className="muted text-xs" dir="auto">
                    {tr.t('parentComms.meetings.teaches', { courses: t.courses.join(', '), children: t.children.map((c) => c.displayName).join(', ') })}
                  </p>
                  {!t.slots.length ? (
                    <p className="muted text-sm">{tr.t('parentComms.meetings.noSlots')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {t.slots.slice(0, 24).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="chip"
                          onClick={() => {
                            setPicking({ slot: s, children: t.children });
                            setChild(t.children[0]!.id);
                          }}
                        >
                          {formatDateTime(s.startsAt, tr)}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )
          }
        </QueryState>
      </section>
      <section className="card self-start p-4">
        <h2 className="mb-2 font-black">{tr.t('parentComms.meetings.mine')}</h2>
        <QueryState query={mine}>
          {(d) =>
            !d.items.length ? (
              <p className="muted text-sm">{tr.t('parentComms.meetings.none')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.items.map((s) => (
                  <SlotRow key={s.id} s={s} onCancel={() => cancel.mutate(s.id)} />
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
      {picking && (
        <Modal open size="sm" onClose={() => setPicking(null)} title={tr.t('parentComms.meetings.booking')}>
          <div className="space-y-3">
            <p className="font-bold">{formatDateTime(picking.slot.startsAt, tr)}</p>
            <Select
              label={tr.t('parentComms.meetings.child')}
              value={child}
              onChange={(e) => setChild(e.target.value)}
              options={picking.children.map((c) => ({ value: c.id, label: c.displayName }))}
            />
            <Textarea label={tr.t('parentComms.meetings.note')} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" />
            <Button block loading={book.isPending} onClick={() => book.mutate()}>
              {tr.t('parentComms.meetings.book')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function MeetingsPage() {
  const tr = useT();
  const teacher = useSession((s) => s.me?.accountType === 'teacher');
  return (
    <div className="page mx-auto max-w-5xl">
      <PageHeader title={tr.t('parentComms.meetings.title')} subtitle={tr.t('parentComms.meetings.subtitle')} icon={<CalendarCheck className="size-6" />} />
      {teacher ? <TeacherView /> : <ParentView />}
    </div>
  );
}
