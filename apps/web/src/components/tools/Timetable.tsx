import { overlaps, sortSlots, todaySlots, type TimetableEntryDto, type TimetableEntryInput, type Weekday } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

export const WEEK: Weekday[] = [6, 0, 1, 2, 3, 4, 5];
export const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04'];

export function useTimetable(studentId?: string) {
  return useQuery({ queryKey: ['timetable', studentId ?? 'me'], queryFn: () => api.me.timetable(studentId) });
}

/** Re-renders every minute so "now" and "next" stay right. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function SlotRow({ e, badge, onClick }: { e: TimetableEntryDto; badge?: string; onClick?: () => void }) {
  const tr = useT();
  const body = (
    <>
      <span className="w-1.5 self-stretch rounded-full" style={{ background: e.color ?? 'var(--primary)' }} aria-hidden />
      <span className="w-24 shrink-0 text-sm font-bold tabular-nums" dir="ltr">
        {e.start}–{e.end}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold" dir="auto">
          {e.title}
        </span>
        <span className="muted flex flex-wrap items-center gap-x-2 text-xs">
          {e.room && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" aria-hidden /> {e.room}
            </span>
          )}
          {e.courseId && <span>{e.courseTitle ?? tr.t('timetable.fromTeacher')}</span>}
        </span>
      </span>
      {badge && <span className="badge badge-primary shrink-0">{badge}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[var(--radius-control)] p-2 text-start hover:bg-bg-3">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 p-2">{body}</div>
  );
}

/** Home page card: today's classes with what is on now and next. */
export function TodayClasses() {
  const tr = useT();
  const now = useNow();
  const q = useTimetable();
  if (!q.data?.items.length) return null;
  const t = todaySlots(q.data.items, now);
  return (
    <section className="card p-4" aria-labelledby="today-classes">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="today-classes" className="flex items-center gap-2 font-black">
          <CalendarRange className="size-5 text-ink" aria-hidden /> {tr.t('timetable.today')}
        </h2>
        <Link to="/timetable" className="link text-sm">
          {tr.t('nav.timetable')}
        </Link>
      </div>
      {!t.items.length ? (
        <p className="muted text-sm">{tr.t('timetable.noneToday')}</p>
      ) : (
        <ul>
          {t.items.map((e) => (
            <li key={e.id}>
              <SlotRow e={e} badge={e.id === t.current?.id ? tr.t('timetable.now') : e.id === t.next?.id && !t.current ? tr.t('timetable.next') : undefined} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Draft = Omit<TimetableEntryInput, 'color' | 'courseId'> & { id?: string; color: string; courseId: string };

export function emptyDraft(day: Weekday = new Date().getDay() as Weekday): Draft {
  return { day, start: '08:00', end: '08:45', title: '', room: '', color: COLORS[0]!, courseId: '' };
}

export function draftOf(e: TimetableEntryDto): Draft {
  return { id: e.id, day: e.day, start: e.start, end: e.end, title: e.title, room: e.room, color: e.color ?? COLORS[0]!, courseId: e.courseId ?? '' };
}

/** Add or edit one weekly class. Teachers can attach it to one of their classes so all its students see it. */
export function SlotDialog({ draft, all, onClose }: { draft: Draft; all: TimetableEntryDto[]; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState(draft);
  const [busy, setBusy] = useState(false);
  const courses = useQuery({ queryKey: ['school', 'courses'], queryFn: () => api.school.courses() });
  const teaching = (courses.data?.items ?? []).filter((c) => c.myRole === 'teacher' || c.myRole === 'assistant');
  const clash = all.find((x) => x.id !== f.id && overlaps(x, f));
  const valid = f.title.trim().length > 0 && f.end > f.start;
  const save = async () => {
    setBusy(true);
    try {
      const body: TimetableEntryInput = { ...f, title: f.title.trim(), room: (f.room ?? '').trim(), courseId: f.courseId || null };
      if (f.id) await api.me.updateTimetable(f.id, body);
      else await api.me.addTimetable(body);
      toast(tr.t('timetable.saved'));
      await qc.invalidateQueries({ queryKey: ['timetable'] });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? tr.t('timetable.edit') : tr.t('timetable.add')}
      footer={
        <div className="flex w-full flex-wrap justify-between gap-2">
          {f.id ? (
            <Button
              variant="ghost"
              className="text-err"
              onClick={async () => {
                try {
                  await api.me.removeTimetable(f.id!);
                  await qc.invalidateQueries({ queryKey: ['timetable'] });
                  onClose();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('common.delete')}
            </Button>
          ) : (
            <span />
          )}
          <Button loading={busy} disabled={!valid} onClick={() => void save()}>
            {tr.t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label={tr.t('timetable.name')} value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label={tr.t('timetable.day')}
            value={String(f.day)}
            onChange={(e) => setF({ ...f, day: Number(e.target.value) as Weekday })}
            options={WEEK.map((d) => ({ value: String(d), label: tr.t(`timetable.days.${d}`) }))}
          />
          <Input type="time" label={tr.t('timetable.start')} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Input type="time" label={tr.t('timetable.end')} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
        <Input label={tr.t('timetable.room')} value={f.room ?? ''} maxLength={60} onChange={(e) => setF({ ...f, room: e.target.value })} />
        <fieldset>
          <legend className="mb-1 text-sm font-bold">{tr.t('timetable.color')}</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={f.color === c}
                onClick={() => setF({ ...f, color: c })}
                className={cx('size-8 rounded-full border-2', f.color === c ? 'border-fg' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        {teaching.length > 0 && (
          <Select
            label={tr.t('timetable.course')}
            hint={tr.t('timetable.courseHint')}
            value={f.courseId}
            onChange={(e) => setF({ ...f, courseId: e.target.value })}
            options={[{ value: '', label: tr.t('timetable.personal') }, ...teaching.map((c) => ({ value: c.id, label: c.title }))]}
          />
        )}
        {clash && <p className="text-sm font-bold text-warn">{tr.t('timetable.overlap', { title: clash.title })}</p>}
      </div>
    </Modal>
  );
}

/** The whole week, Saturday first, one column per day on wide screens. */
export function WeekGrid({ items, onEdit, onAdd }: { items: TimetableEntryDto[]; onEdit?: (e: TimetableEntryDto) => void; onAdd?: (day: Weekday) => void }) {
  const tr = useT();
  const today = new Date().getDay();
  const sorted = sortSlots(items);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {WEEK.map((d) => {
        const list = sorted.filter((s) => s.day === d);
        if (!list.length && !onAdd) return null;
        return (
          <section key={d} className={cx('card p-3', d === today && 'ring-2 ring-primary')} aria-labelledby={`day-${d}`}>
            <div className="mb-1 flex items-center justify-between">
              <h2 id={`day-${d}`} className="font-black">
                {tr.t(`timetable.days.${d}`)}
              </h2>
              {onAdd && (
                <button type="button" className="link text-sm" onClick={() => onAdd(d)}>
                  + {tr.t('timetable.add')}
                </button>
              )}
            </div>
            <ul>
              {list.map((e) => (
                <li key={e.id}>
                  <SlotRow e={e} onClick={onEdit && e.mine ? () => onEdit(e) : undefined} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
