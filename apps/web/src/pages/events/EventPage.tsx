import type { EventDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Check, MapPin, Pencil, Star, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { reportContent } from '@/components/common/ReportDialog';
import { RichText } from '@/components/common/RichText';
import { Avatar, UserChip } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { QueryState } from '@/components/ui/States';
import { api, downloadBlob, fileUrl } from '@/lib/api';
import { formatDateTime, relativeFuture } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { confirmDialog, toastError } from '@/lib/ui';
import { EventForm } from './EventsPage';

const icsEscape = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (m) => `\\${m}`);
const icsDate = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

function downloadIcs(e: EventDto) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qubedu//Events//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@qubedu`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt ?? e.startsAt + 3_600_000)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.onlineUrl ? [`URL:${e.onlineUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }), 'event.ics');
}

export default function EventPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['event', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.events.get(id) });
  const people = useQuery({ queryKey: ['event', id, 'attendees'], queryFn: () => api.events.attendees(id), enabled: !!q.data });
  const [editing, setEditing] = useState(false);

  const rsvp = async (status: 'going' | 'interested' | 'none') => {
    try {
      const res = await api.events.rsvp(id, status);
      qc.setQueryData<EventDto>(key, (e) => (e ? { ...e, ...res } : e));
      void qc.invalidateQueries({ queryKey: ['event', id, 'attendees'] });
      void qc.invalidateQueries({ queryKey: ['events'] });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="page-narrow">
      <Link to="/events" className="link mb-3 inline-flex items-center gap-1">
        <ArrowLeft className="size-4 flip-rtl" /> {tr.t('events.title')}
      </Link>
      <QueryState query={q}>
        {(e) => (
          <article className="card overflow-hidden">
            <div className="surface-gradient h-40 md:h-56">{e.coverUrl && <img src={fileUrl(e.coverUrl)} alt="" className="size-full object-cover" />}</div>
            <div className="space-y-5 p-5">
              <div>
                <p className="text-ink text-sm font-bold">
                  {formatDateTime(e.startsAt, tr)} · {relativeFuture(e.startsAt, tr)}
                </p>
                <h1 className="mt-1 text-3xl font-black" dir="auto">
                  {e.title}
                </h1>
                <div className="muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {e.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-4" /> {e.location}
                    </span>
                  )}
                  <UserChip user={e.host} size="sm" subtitle={tr.t('events.hostedBy', { name: e.host.displayName })} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={e.myStatus === 'going' ? 'primary' : 'outline'}
                  icon={<Check className="size-4" />}
                  aria-pressed={e.myStatus === 'going'}
                  onClick={() => void rsvp(e.myStatus === 'going' ? 'none' : 'going')}
                >
                  {tr.t('events.going')}
                </Button>
                <Button
                  variant={e.myStatus === 'interested' ? 'soft' : 'outline'}
                  icon={<Star className="size-4" />}
                  aria-pressed={e.myStatus === 'interested'}
                  onClick={() => void rsvp(e.myStatus === 'interested' ? 'none' : 'interested')}
                >
                  {tr.t('events.interested')}
                </Button>
                <Button variant="outline" icon={<CalendarPlus className="size-4" />} onClick={() => downloadIcs(e)}>
                  {tr.t('events.addToCalendar')}
                </Button>
                {e.onlineUrl && /^https?:/.test(e.onlineUrl) && (
                  <a className="btn btn-soft" href={e.onlineUrl} target="_blank" rel="noopener noreferrer">
                    <Video className="size-4" /> {tr.t('events.joinOnline')}
                  </a>
                )}
              </div>
              <p className="muted text-sm">
                {tr.t('events.goingCount', { count: e.goingCount })} · {tr.t('events.interestedCount', { count: e.interestedCount })}
              </p>
              {e.description && <RichText text={e.description} />}
              {!!people.data?.items.length && (
                <section aria-label={tr.t('events.attendees')}>
                  <h2 className="mb-2 font-black">{tr.t('events.attendees')}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {people.data.items.map((a) => (
                      <li key={a.user.id} title={`${a.user.displayName} · ${tr.t(a.status === 'going' ? 'events.going' : 'events.interested')}`}>
                        <Link to={`/u/${a.user.id}`}>
                          <Avatar name={a.user.displayName} url={a.user.avatarUrl} size="md" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="flex gap-2 border-t border-line pt-4">
                {e.canEdit ? (
                  <>
                    <Button variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                      {tr.t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-err"
                      icon={<Trash2 className="size-4" />}
                      onClick={async () => {
                        if (!(await confirmDialog({ title: tr.t('events.deleteConfirm'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                        try {
                          await api.events.remove(id);
                          void qc.invalidateQueries({ queryKey: ['events'] });
                          navigate('/events', { replace: true });
                        } catch (err) {
                          toastError(err);
                        }
                      }}
                    >
                      {tr.t('common.delete')}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => reportContent({ targetType: 'event', targetId: id })}>
                    {tr.t('common.report')}
                  </Button>
                )}
              </div>
            </div>
            {editing && (
              <EventForm
                event={e}
                onClose={() => setEditing(false)}
                onSaved={(saved) => {
                  qc.setQueryData(key, saved);
                  setEditing(false);
                }}
              />
            )}
          </article>
        )}
      </QueryState>
    </div>
  );
}
