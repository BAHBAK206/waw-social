import type { EventDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Plus, Video } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, PageHeader } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, formatTime, fromLocalInput, relativeFuture, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { toast, toastError } from '@/lib/ui';

const TABS = ['upcoming', 'mine', 'past'] as const;

export function EventCard({ event, compact }: { event: EventDto; compact?: boolean }) {
  const tr = useT();
  const live = event.startsAt <= Date.now() && (event.endsAt ?? event.startsAt + 3_600_000) > Date.now();
  const d = new Date(event.startsAt);
  return (
    <Link to={`/events/${event.id}`} className={cx('card group flex gap-4 overflow-hidden p-3 transition-shadow hover:shadow-lg', compact && 'p-2')}>
      <div className="surface-gradient flex w-16 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] py-2 text-center">
        <span className="text-xs font-bold uppercase">{formatDate(d, tr, { month: 'short' })}</span>
        <span className="text-2xl leading-none font-black tabular-nums">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-black" dir="auto">
          {event.title}
        </p>
        <p className="muted text-sm">
          {live ? <span className="text-err font-bold">● {tr.t('events.now')}</span> : relativeFuture(event.startsAt, tr)} · {formatTime(event.startsAt, tr)}
        </p>
        {(event.location || event.onlineUrl) && (
          <p className="muted flex items-center gap-1 truncate text-sm">
            {event.onlineUrl ? <Video className="size-3.5 shrink-0" /> : <MapPin className="size-3.5 shrink-0" />}
            {event.location || tr.t('events.joinOnline')}
          </p>
        )}
        {!compact && (
          <p className="muted mt-1 text-xs">
            {tr.t('events.goingCount', { count: event.goingCount })} · {tr.t('events.interestedCount', { count: event.interestedCount })}
          </p>
        )}
      </div>
      {event.coverUrl && !compact && (
        <img src={fileUrl(event.coverUrl)} alt="" loading="lazy" className="hidden size-20 rounded-[var(--radius-control)] object-cover sm:block" />
      )}
    </Link>
  );
}

export function EventForm({ event, onClose, onSaved }: { event?: EventDto; onClose: () => void; onSaved: (e: EventDto) => void }) {
  const tr = useT();
  const groups = useQuery({ queryKey: ['groups', 'mine-for-events'], queryFn: () => api.groups.list({ scope: 'mine', kind: 'group' }), enabled: !event });
  const [f, setF] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    startsAt: toLocalInput(event?.startsAt ?? Date.now() + 86_400_000),
    endsAt: toLocalInput(event?.endsAt),
    location: event?.location ?? '',
    onlineUrl: event?.onlineUrl ?? '',
    groupId: event?.groupId ?? '',
    coverUrl: event?.coverUrl ?? null,
  });
  const [busy, setBusy] = useState(false);
  const starts = fromLocalInput(f.startsAt);
  const ends = fromLocalInput(f.endsAt);
  const invalid = !!starts && !!ends && ends <= starts;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={event ? tr.t('events.edit') : tr.t('events.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={!f.title.trim() || !starts || invalid}
            onClick={async () => {
              setBusy(true);
              try {
                const body = {
                  title: f.title.trim(),
                  description: f.description.trim(),
                  startsAt: starts!,
                  endsAt: ends,
                  location: f.location.trim(),
                  onlineUrl: f.onlineUrl.trim() || null,
                  coverUrl: f.coverUrl,
                };
                const saved = event ? await api.events.update(event.id, body) : await api.events.create({ ...body, groupId: f.groupId || null });
                toast(tr.t('events.created'));
                onSaved(saved);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('events.nameLabel')} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label={tr.t('events.descriptionLabel')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input type="datetime-local" label={tr.t('events.startsAt')} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          <Input
            type="datetime-local"
            label={tr.t('events.endsAt')}
            value={f.endsAt}
            error={invalid ? tr.t('events.invalidRange') : undefined}
            onChange={(e) => setF({ ...f, endsAt: e.target.value })}
          />
        </div>
        <Input label={tr.t('events.location')} value={f.location} maxLength={200} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <Input
          type="url"
          dir="ltr"
          label={tr.t('events.onlineUrl')}
          value={f.onlineUrl}
          placeholder="https://"
          onChange={(e) => setF({ ...f, onlineUrl: e.target.value })}
        />
        {!event && (
          <Select
            label={tr.t('events.group')}
            value={f.groupId}
            placeholder={tr.t('events.noGroup')}
            onChange={(e) => setF({ ...f, groupId: e.target.value })}
            options={(groups.data?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
          />
        )}
        <div className="flex items-center gap-3">
          {f.coverUrl && <img src={fileUrl(f.coverUrl)} alt="" className="h-16 rounded-[var(--radius-control)]" />}
          <UploadButton variant="outline" purpose="general" imageOnly onUploaded={(r) => setF({ ...f, coverUrl: r.url })}>
            {tr.t('settings.profile.cover')}
          </UploadButton>
        </div>
      </div>
    </Modal>
  );
}

export default function EventsPage() {
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useTabParam(TABS, 'upcoming');
  const [creating, setCreating] = useState(false);
  const list = usePaged<EventDto>(['events', tab], (cursor) => api.events.list({ scope: tab, cursor, limit: 20 }));
  return (
    <div className="page-narrow">
      <PageHeader
        title={tr.t('events.title')}
        subtitle={tr.t('events.subtitle')}
        icon={<CalendarDays className="size-6" />}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {tr.t('events.create')}
          </Button>
        }
      />
      <Tabs className="mb-5" active={tab} onChange={setTab} tabs={TABS.map((k) => ({ key: k, label: tr.t(`events.tabs.${k}`) }))} />
      {list.isPending ? (
        <CardSkeletons count={3} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState icon={<CalendarDays className="size-7" />} title={tr.t('events.empty')} />
      ) : (
        <div className="space-y-3">
          {list.items.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
        </div>
      )}
      {creating && (
        <EventForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['events'] });
          }}
        />
      )}
    </div>
  );
}
