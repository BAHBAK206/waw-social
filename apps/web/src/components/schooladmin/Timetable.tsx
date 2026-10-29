import type { SchoolDto, SchoolSlotDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** The whole school's timetable, with double-booking warnings; administrators add lessons and hand classes to teachers. */
export function SchoolTimetable({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const admin = school.myRole === 'admin';
  const q = useQuery({ queryKey: ['school', school.id, 'timetable'], queryFn: () => api.schoolAdmin.timetable(school.id) });
  const classes = useQuery({ queryKey: ['school', school.id, 'classes'], queryFn: () => api.schools.classes(school.id), enabled: admin });
  const teachers = useQuery({
    queryKey: ['school', school.id, 'teachers'],
    queryFn: () => api.schools.members(school.id, { role: 'teacher' }),
    enabled: admin,
  });
  const [section, setSection] = useState('');
  const [f, setF] = useState({ courseId: '', day: 0, start: '08:00', end: '08:45', room: '' });
  const [handover, setHandover] = useState({ courseId: '', teacherId: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['school', school.id, 'timetable'] });
  const add = useMutation({ mutationFn: () => api.schoolAdmin.addSlot(school.id, f), onSuccess: refresh, onError: toastError });
  const remove = useMutation({ mutationFn: (id: string) => api.schoolAdmin.removeSlot(school.id, id), onSuccess: refresh, onError: toastError });
  const assign = useMutation({
    mutationFn: () => api.schoolAdmin.assignTeacher(school.id, handover.courseId, handover.teacherId),
    onSuccess: () => {
      toast(tr.t('schoolAdmin.timetable.assigned'));
      void qc.invalidateQueries({ queryKey: ['school', school.id] });
    },
    onError: toastError,
  });
  const dayName = (d: number) => new Intl.DateTimeFormat(tr.locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + d)));
  return (
    <QueryState query={q}>
      {(d) => {
        const shown = d.items.filter((i) => !section || i.section === section);
        const byId = new Map(d.items.map((i) => [i.id, i]));
        const label = (id: string) => byId.get(id)?.courseTitle ?? '';
        const clashing = new Set(d.conflicts.flatMap((c) => [c.a, c.b]));
        return (
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <Select
                label={tr.t('schoolAdmin.timetable.section')}
                value={section}
                onChange={(e) => setSection(e.target.value)}
                options={[{ value: '', label: tr.t('schoolAdmin.timetable.all') }, ...d.sections.map((s) => ({ value: s, label: s }))]}
              />
              {d.conflicts.length > 0 && (
                <section className="card space-y-1 border-err p-3" role="alert">
                  <h3 className="flex items-center gap-2 font-black text-err">
                    <TriangleAlert className="size-5" aria-hidden /> {tr.t('schoolAdmin.timetable.conflicts')}
                  </h3>
                  <ul className="list-disc ps-5 text-sm">
                    {d.conflicts.map((c, i) => (
                      <li key={i}>
                        {tr.t(`schoolAdmin.timetable.conflict${c.kind[0]!.toUpperCase()}${c.kind.slice(1)}` as 'schoolAdmin.timetable.conflictRoom', {
                          a: label(c.a),
                          b: label(c.b),
                        })}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!shown.length ? (
                <p className="muted">{tr.t('schoolAdmin.timetable.empty')}</p>
              ) : (
                DAYS.map((day) => {
                  const rows = shown.filter((i) => i.day === day);
                  if (!rows.length) return null;
                  return (
                    <section key={day} className="card p-3">
                      <h3 className="mb-1 font-black">{dayName(day)}</h3>
                      <ul className="divide-y divide-line">
                        {rows.map((i: SchoolSlotDto) => (
                          <li key={i.id} className={`flex items-center gap-3 py-2 ${clashing.has(i.id) ? 'text-err' : ''}`}>
                            <span className="w-24 shrink-0 text-sm font-bold tabular-nums" dir="ltr">
                              {i.start}–{i.end}
                            </span>
                            <span className="min-w-0 flex-1" dir="auto">
                              <span className="block font-bold">{i.courseTitle}</span>
                              <span className="muted text-xs">{[i.section, i.teacher.displayName, i.room].filter(Boolean).join(' · ')}</span>
                            </span>
                            {admin && (
                              <IconButton label={tr.t('schoolAdmin.timetable.remove')} size="sm" onClick={() => remove.mutate(i.id)}>
                                <Trash2 className="size-4" />
                              </IconButton>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}
            </div>
            {admin && (
              <div className="space-y-4 self-start">
                <section className="card space-y-3 p-4">
                  <h3 className="font-black">{tr.t('schoolAdmin.timetable.add')}</h3>
                  <Select
                    label={tr.t('schoolAdmin.timetable.class')}
                    value={f.courseId}
                    onChange={(e) => setF({ ...f, courseId: e.target.value })}
                    options={[
                      { value: '', label: '—' },
                      ...(classes.data?.items ?? []).map((c) => ({ value: c.id, label: [c.title, c.section].filter(Boolean).join(' · ') })),
                    ]}
                  />
                  <Select
                    label={tr.t('schoolAdmin.timetable.day')}
                    value={String(f.day)}
                    onChange={(e) => setF({ ...f, day: Number(e.target.value) })}
                    options={DAYS.map((x) => ({ value: String(x), label: dayName(x) }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="time"
                      label={tr.t('schoolAdmin.timetable.start')}
                      value={f.start}
                      onChange={(e) => setF({ ...f, start: e.target.value })}
                      dir="ltr"
                    />
                    <Input
                      type="time"
                      label={tr.t('schoolAdmin.timetable.end')}
                      value={f.end}
                      onChange={(e) => setF({ ...f, end: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <Input
                    label={tr.t('schoolAdmin.timetable.room')}
                    value={f.room}
                    maxLength={40}
                    onChange={(e) => setF({ ...f, room: e.target.value })}
                    dir="auto"
                  />
                  <Button loading={add.isPending} disabled={!f.courseId || f.end <= f.start} onClick={() => add.mutate()}>
                    {tr.t('schoolAdmin.timetable.save')}
                  </Button>
                </section>
                <section className="card space-y-3 p-4">
                  <h3 className="font-black">{tr.t('schoolAdmin.timetable.teacherFor')}</h3>
                  <Select
                    label={tr.t('schoolAdmin.timetable.class')}
                    value={handover.courseId}
                    onChange={(e) => setHandover({ ...handover, courseId: e.target.value })}
                    options={[
                      { value: '', label: '—' },
                      ...(classes.data?.items ?? []).map((c) => ({
                        value: c.id,
                        label: [c.title, c.section].filter(Boolean).join(' · ') + ` (${c.teacher.displayName})`,
                      })),
                    ]}
                  />
                  <Select
                    label={tr.t('schoolAdmin.timetable.assign')}
                    value={handover.teacherId}
                    onChange={(e) => setHandover({ ...handover, teacherId: e.target.value })}
                    options={[
                      { value: '', label: '—' },
                      ...(teachers.data?.items ?? []).filter((m) => m.status === 'active').map((m) => ({ value: m.user.id, label: m.user.displayName })),
                    ]}
                  />
                  <Button variant="soft" loading={assign.isPending} disabled={!handover.courseId || !handover.teacherId} onClick={() => assign.mutate()}>
                    {tr.t('schoolAdmin.timetable.assign')}
                  </Button>
                </section>
              </div>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
