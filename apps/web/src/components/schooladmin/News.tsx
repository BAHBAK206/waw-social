import type { SchoolDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate, relativeTime, todayKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const KINDS = ['holiday', 'exam', 'event', 'meeting'] as const;
const KIND_BADGE = { holiday: 'badge-ok', exam: 'badge-err', event: 'badge-primary', meeting: 'badge-warn' } as const;

/** Announcements and the school calendar, merged with the homework due in the viewer's classes. */
export function SchoolNews({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const admin = school.myRole === 'admin';
  const q = useQuery({ queryKey: ['school', school.id, 'news'], queryFn: () => api.schoolAdmin.news(school.id) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['school', school.id, 'news'] });
  const [a, setA] = useState({ title: '', body: '', audience: 'all', whatsapp: false });
  const [e, setE] = useState({ title: '', day: todayKey(), endDay: '', kind: 'event' as (typeof KINDS)[number] });
  const post = useMutation({
    mutationFn: () => api.schoolAdmin.announce(school.id, a),
    onSuccess: (r) => {
      toast(tr.t('schoolAdmin.news.sent', { count: r.notified }));
      setA({ title: '', body: '', audience: 'all', whatsapp: false });
      void refresh();
    },
    onError: toastError,
  });
  const addEvent = useMutation({
    mutationFn: () => api.schoolAdmin.addEvent(school.id, { title: e.title.trim(), day: e.day, endDay: e.endDay || null, kind: e.kind }),
    onSuccess: () => {
      setE({ ...e, title: '', endDay: '' });
      void refresh();
    },
    onError: toastError,
  });
  const removeAnn = useMutation({ mutationFn: (id: string) => api.schoolAdmin.removeAnnouncement(school.id, id), onSuccess: refresh, onError: toastError });
  const removeEv = useMutation({ mutationFn: (id: string) => api.schoolAdmin.removeEvent(school.id, id), onSuccess: refresh, onError: toastError });
  const audiences = ['all', 'students', 'teachers', 'parents'].map((v) => ({ value: v, label: tr.t(`schoolAdmin.news.${v}` as 'schoolAdmin.news.all') }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3">
        {admin && (
          <form
            className="card space-y-3 p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (a.title.trim().length >= 2) post.mutate();
            }}
          >
            <h3 className="flex items-center gap-2 font-black">
              <Megaphone className="size-5" aria-hidden /> {tr.t('schoolAdmin.news.post')}
            </h3>
            <Input
              label={tr.t('schoolAdmin.news.announcement')}
              value={a.title}
              maxLength={160}
              onChange={(ev) => setA({ ...a, title: ev.target.value })}
              dir="auto"
            />
            <Textarea label={tr.t('schoolAdmin.news.body')} value={a.body} rows={3} onChange={(ev) => setA({ ...a, body: ev.target.value })} dir="auto" />
            <Select
              label={tr.t('schoolAdmin.news.audience')}
              value={a.audience}
              onChange={(ev) => setA({ ...a, audience: ev.target.value })}
              options={audiences}
            />
            {(a.audience === 'all' || a.audience === 'parents') && (
              <Switch checked={a.whatsapp} onChange={(v) => setA({ ...a, whatsapp: v })} label={tr.t('schoolAdmin.news.whatsapp')} />
            )}
            <Button type="submit" loading={post.isPending} disabled={a.title.trim().length < 2}>
              {tr.t('schoolAdmin.news.send')}
            </Button>
          </form>
        )}
        <QueryState query={q}>
          {(d) =>
            !d.announcements.length ? (
              <p className="muted">{tr.t('schoolAdmin.news.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {d.announcements.map((n) => (
                  <li key={n.id} className="card flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1" dir="auto">
                      <p className="font-black">{n.title}</p>
                      {n.body && <p className="mt-1 whitespace-pre-line text-sm">{n.body}</p>}
                      <p className="muted mt-1 text-xs">
                        {[relativeTime(n.createdAt, tr), n.audience !== 'all' ? tr.t(`schoolAdmin.news.${n.audience}` as 'schoolAdmin.news.all') : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {admin && (
                      <IconButton label={tr.t('common.delete')} size="sm" onClick={() => removeAnn.mutate(n.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
      <section className="space-y-3">
        {admin && (
          <form
            className="card space-y-3 p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (e.title.trim().length >= 2) addEvent.mutate();
            }}
          >
            <h3 className="font-black">{tr.t('schoolAdmin.news.addEvent')}</h3>
            <Input
              label={tr.t('schoolAdmin.news.eventTitle')}
              value={e.title}
              maxLength={160}
              onChange={(ev) => setE({ ...e, title: ev.target.value })}
              dir="auto"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="date" label={tr.t('schoolAdmin.news.eventDay')} value={e.day} onChange={(ev) => setE({ ...e, day: ev.target.value })} dir="ltr" />
              <Input
                type="date"
                label={tr.t('schoolAdmin.news.eventEnd')}
                value={e.endDay}
                onChange={(ev) => setE({ ...e, endDay: ev.target.value })}
                dir="ltr"
              />
              <Select
                label={tr.t('schoolAdmin.news.kind')}
                value={e.kind}
                onChange={(ev) => setE({ ...e, kind: ev.target.value as (typeof KINDS)[number] })}
                options={KINDS.map((k) => ({ value: k, label: tr.t(`schoolAdmin.news.${k}`) }))}
              />
            </div>
            <Button type="submit" loading={addEvent.isPending} disabled={e.title.trim().length < 2 || !e.day}>
              {tr.t('schoolAdmin.news.addEvent')}
            </Button>
          </form>
        )}
        <QueryState query={q}>
          {(d) => (
            <div className="card space-y-3 p-4">
              <h3 className="font-black">{tr.t('schoolAdmin.news.calendar')}</h3>
              {!d.events.length ? (
                <p className="muted text-sm">{tr.t('schoolAdmin.news.noEvents')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.events.map((ev) => (
                    <li key={ev.id} className="flex items-center gap-3 py-2">
                      <span className={`badge ${KIND_BADGE[ev.kind]}`}>{tr.t(`schoolAdmin.news.${ev.kind}`)}</span>
                      <span className="min-w-0 flex-1" dir="auto">
                        <span className="block font-bold">{ev.title}</span>
                        <span className="muted text-xs">
                          {ev.endDay && ev.endDay !== ev.day ? `${formatDate(ev.day, tr)} → ${formatDate(ev.endDay, tr)}` : formatDate(ev.day, tr)}
                        </span>
                      </span>
                      {admin && (
                        <IconButton label={tr.t('common.delete')} size="sm" onClick={() => removeEv.mutate(ev.id)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="font-black">{tr.t('schoolAdmin.news.agenda')}</h3>
              {!d.agenda.length ? (
                <p className="muted text-sm">{tr.t('schoolAdmin.news.noAgenda')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.agenda.map((g, i) => (
                    <li key={i} className="flex items-center gap-3 py-2" dir="auto">
                      <span className="badge">{formatDate(g.day, tr, { month: 'short', day: 'numeric' })}</span>
                      <span className="min-w-0 flex-1 truncate font-bold">{g.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}
