import type { LiveRoomDto, ScheduledClassDto } from '@qubedu/shared';
import { hasPermission } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Radio, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDateTime, fromLocalInput, relativeFuture, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confirmDialog, toast, toastError } from '@/lib/ui';

function RoomCard({ room }: { room: LiveRoomDto }) {
  const tr = useT();
  const live = room.status === 'live';
  return (
    <Link to={`/live/${room.id}`} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-lg">
      <Avatar name={room.host.displayName} url={room.host.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-black" dir="auto">
          {room.title}
        </p>
        <p className="muted truncate text-sm">
          {room.host.displayName}
          {room.scheduledAt && !live ? ` · ${formatDateTime(room.scheduledAt, tr)} (${relativeFuture(room.scheduledAt, tr)})` : ''}
        </p>
      </div>
      {live ? (
        <span className="badge badge-err">
          <Radio className="size-3.5" /> {tr.t('live.liveNow')}
        </span>
      ) : (
        <span className="badge">{room.status === 'ended' ? tr.t('live.ended') : tr.t('live.scheduled')}</span>
      )}
    </Link>
  );
}

function NewRoomDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<'open' | 'group' | 'community' | 'course'>('open');
  const [scopeId, setScopeId] = useState('');
  const [when, setWhen] = useState('');
  const [settings, setSettings] = useState({ allowStudentCamera: false, allowStudentMic: false, allowStudentScreen: false, allowChat: true });
  const [busy, setBusy] = useState(false);
  const groups = useQuery({
    queryKey: ['groups', 'mine-live', scope],
    queryFn: () => api.groups.list({ scope: 'mine', kind: scope === 'community' ? 'community' : 'group' }),
    enabled: scope === 'group' || scope === 'community',
  });
  const courses = useQuery({ queryKey: ['school', 'mine-live'], queryFn: () => api.school.courses(), enabled: scope === 'course' });
  const options =
    scope === 'course'
      ? (courses.data?.items ?? []).filter((c) => c.myRole === 'teacher' || c.myRole === 'assistant').map((c) => ({ value: c.id, label: c.title }))
      : (groups.data?.items ?? []).map((g) => ({ value: g.id, label: g.name }));
  const at = fromLocalInput(when);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('live.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={!title.trim() || (scope !== 'open' && !scopeId)}
            onClick={async () => {
              setBusy(true);
              try {
                const room = await api.live.create({
                  title: title.trim(),
                  scopeType: scope,
                  scopeId: scope === 'open' ? null : scopeId,
                  scheduledAt: at,
                  settings,
                });
                await qc.invalidateQueries({ queryKey: ['live-rooms'] });
                navigate(`/live/${room.id}`);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {at ? tr.t('live.scheduled') : tr.t('live.start')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.title')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Select
          label={tr.t('live.scope')}
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as typeof scope);
            setScopeId('');
          }}
          options={(['open', 'group', 'community', 'course'] as const).map((k) => ({ value: k, label: tr.t(`live.scopes.${k}`) }))}
        />
        {scope !== 'open' && (
          <Select label={tr.t(`live.scopes.${scope}`)} value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder="—" options={options} />
        )}
        <Input type="datetime-local" label={tr.t('live.startAt')} value={when} min={toLocalInput(Date.now())} onChange={(e) => setWhen(e.target.value)} />
        <fieldset className="space-y-1">
          <legend className="field-label">{tr.t('live.settings.title')}</legend>
          <Switch
            checked={settings.allowStudentCamera}
            onChange={(v) => setSettings({ ...settings, allowStudentCamera: v })}
            label={tr.t('live.settings.allowStudentCamera')}
          />
          <Switch
            checked={settings.allowStudentMic}
            onChange={(v) => setSettings({ ...settings, allowStudentMic: v })}
            label={tr.t('live.settings.allowStudentMic')}
          />
          <Switch
            checked={settings.allowStudentScreen}
            onChange={(v) => setSettings({ ...settings, allowStudentScreen: v })}
            label={tr.t('live.settings.allowStudentScreen')}
          />
          <Switch checked={settings.allowChat} onChange={(v) => setSettings({ ...settings, allowChat: v })} label={tr.t('live.settings.allowChat')} />
        </fieldset>
      </div>
    </Modal>
  );
}

function ClassDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', subject: '', description: '', link: '', startsAt: '' });
  const [busy, setBusy] = useState(false);
  const valid = f.title.trim() && /^https?:\/\//i.test(f.link.trim());
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('live.addClass')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              try {
                await api.classes.create({
                  title: f.title.trim(),
                  subject: f.subject.trim() || null,
                  description: f.description.trim(),
                  link: f.link.trim(),
                  startsAt: fromLocalInput(f.startsAt),
                });
                toast(tr.t('common.saved'));
                await qc.invalidateQueries({ queryKey: ['classes'] });
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
        </>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.title')} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label={tr.t('academic.subject')} value={f.subject} maxLength={60} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <Input
          type="url"
          dir="ltr"
          label={tr.t('live.classLink')}
          value={f.link}
          placeholder="https://"
          onChange={(e) => setF({ ...f, link: e.target.value })}
        />
        <Input type="datetime-local" label={tr.t('live.startAt')} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Modal>
  );
}

export default function ClassesPage() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const canHost = !!me;
  const canAddClass = !!me && (me.accountType === 'teacher' || hasPermission(me.role, me.permissions, 'classes.manage'));
  const [newRoom, setNewRoom] = useState(false);
  const [newClass, setNewClass] = useState(false);
  const rooms = useQuery({ queryKey: ['live-rooms'], queryFn: () => api.live.list(), refetchInterval: 20_000 });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.classes.list() });
  const active = (rooms.data?.items ?? []).filter((r) => r.status === 'live');
  const upcoming = (rooms.data?.items ?? []).filter((r) => r.status === 'scheduled');
  return (
    <div className="page-narrow space-y-8">
      <PageHeader
        title={tr.t('live.title')}
        subtitle={tr.t('live.subtitle')}
        icon={<Video className="size-6" />}
        actions={
          canHost && (
            <Button icon={<Plus className="size-4" />} onClick={() => setNewRoom(true)}>
              {tr.t('live.create')}
            </Button>
          )
        }
      />
      {rooms.isPending ? (
        <CardSkeletons count={3} />
      ) : rooms.error ? (
        <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />
      ) : (
        <>
          <section className="space-y-3" aria-label={tr.t('live.liveNow')}>
            <h2 className="text-lg font-black">{tr.t('live.liveNow')}</h2>
            {active.length ? active.map((r) => <RoomCard key={r.id} room={r} />) : <EmptyState title={tr.t('common.empty')} />}
          </section>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-black">{tr.t('live.scheduled')}</h2>
              {upcoming.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </section>
          )}
        </>
      )}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-black">{tr.t('live.externalClasses')}</h2>
          {canAddClass && (
            <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setNewClass(true)}>
              {tr.t('live.addClass')}
            </Button>
          )}
        </div>
        {classes.isPending ? (
          <CardSkeletons count={2} />
        ) : (
          (classes.data?.items ?? []).map((c: ScheduledClassDto) => (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-black" dir="auto">
                  {c.title}
                </p>
                <p className="muted truncate text-sm">
                  {[c.subject, c.startsAt ? formatDateTime(c.startsAt, tr) : null, c.createdBy?.displayName].filter(Boolean).join(' · ')}
                </p>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm" dir="auto">
                    {c.description}
                  </p>
                )}
              </div>
              <a className="btn btn-soft btn-sm" href={c.link} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink className="size-4" /> {tr.t('live.join')}
              </a>
              {me && (c.createdBy?.id === me.id || hasPermission(me.role, me.permissions, 'classes.manage')) && (
                <button
                  type="button"
                  className="icon-btn icon-btn-sm text-err"
                  aria-label={tr.t('common.delete')}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true }))) return;
                    try {
                      await api.classes.remove(c.id);
                      await qc.invalidateQueries({ queryKey: ['classes'] });
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))
        )}
        {classes.data?.items.length === 0 && <EmptyState title={tr.t('common.empty')} />}
      </section>
      {newRoom && <NewRoomDialog onClose={() => setNewRoom(false)} />}
      {newClass && <ClassDialog onClose={() => setNewClass(false)} />}
    </div>
  );
}
