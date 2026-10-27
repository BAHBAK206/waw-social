import type { GroupDto } from '@qubedu/shared';
import { LIMITS } from '@qubedu/shared';
import { Globe, Lock, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { usePaged, useSentinel } from '@/lib/infinite';
import { celebrate, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

export function GroupCard({ g }: { g: GroupDto }) {
  const tr = useT();
  return (
    <Link to={`/groups/${g.id}`} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <div
        className="surface-gradient h-20"
        style={g.coverUrl ? { backgroundImage: `url(${fileUrl(g.coverUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      />
      <div className="flex gap-3 p-3">
        <Avatar name={g.name} url={g.avatarUrl} size="lg" className="-mt-9 rounded-full ring-4 ring-[var(--card-solid)]" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate font-black" dir="auto">
            {g.name}
          </p>
          <p className="muted flex items-center gap-1.5 text-xs">
            {g.privacy === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
            <Users className="size-3" /> {tr.t('groups.members', { count: g.memberCount })}
          </p>
        </div>
      </div>
      {g.description && (
        <p className="muted line-clamp-2 px-3 pb-3 text-sm" dir="auto">
          {g.description}
        </p>
      )}
      {g.myRole && <span className="badge badge-primary mx-3 mb-3 self-start">{tr.t(`groups.roles.${g.myRole}`)}</span>}
      {!g.myRole && g.pendingRequest && <span className="badge mx-3 mb-3 self-start">{tr.t('groups.requested')}</span>}
    </Link>
  );
}

function CreateDialog({ kind, onClose }: { kind: 'group' | 'community'; onClose: () => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', description: '', privacy: 'public' as 'public' | 'private', tags: '', avatarUrl: null as string | null });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'group' ? tr.t('groups.create') : tr.t('groups.createCommunity')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={f.name.trim().length < LIMITS.groupName.min}
            onClick={async () => {
              setBusy(true);
              try {
                const g = await api.groups.create({
                  kind,
                  name: f.name.trim(),
                  description: f.description.trim(),
                  privacy: f.privacy,
                  avatarUrl: f.avatarUrl,
                  tags: f.tags
                    .split(/[,،]/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                });
                if (g.newAchievements.length) celebrate({ newAchievements: g.newAchievements });
                navigate(`/groups/${g.id}`);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={f.name || '?'} url={f.avatarUrl} size="lg" />
          <UploadButton variant="outline" size="sm" purpose="group" imageOnly onUploaded={(r) => setF({ ...f, avatarUrl: r.url })}>
            {tr.t('settings.profile.avatar')}
          </UploadButton>
        </div>
        <Input label={tr.t('common.name')} value={f.name} maxLength={LIMITS.groupName.max} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <Textarea
          label={tr.t('common.description')}
          value={f.description}
          maxLength={LIMITS.groupDescription}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <Select
          label={tr.t('groups.privacyLabel')}
          value={f.privacy}
          hint={f.privacy === 'public' ? tr.t('groups.publicDesc') : tr.t('groups.privateDesc')}
          onChange={(e) => setF({ ...f, privacy: e.target.value as 'public' | 'private' })}
          options={[
            { value: 'public', label: tr.t('common.public') },
            { value: 'private', label: tr.t('common.private') },
          ]}
        />
        <Input label={tr.t('groups.tags')} value={f.tags} placeholder="math, physics" onChange={(e) => setF({ ...f, tags: e.target.value })} />
      </div>
    </Modal>
  );
}

const SCOPES = ['mine', 'discover'] as const;

export function GroupsList({ kind }: { kind: 'group' | 'community' }) {
  const tr = useT();
  const gate = useAuthGate();
  const [scope, setScope] = useTabParam(SCOPES, 'discover');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);
  const list = usePaged<GroupDto>(['groups', kind, scope, q], (cursor) => api.groups.list({ kind, scope, q, cursor }));
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);
  return (
    <div className="page">
      <PageHeader
        title={kind === 'group' ? tr.t('groups.title') : tr.t('groups.communities')}
        subtitle={kind === 'group' ? tr.t('groups.subtitle') : tr.t('groups.communitiesSubtitle')}
        icon={<Users className="size-6" />}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={gate(() => setCreating(true))}>
            {kind === 'group' ? tr.t('groups.create') : tr.t('groups.createCommunity')}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs active={scope} onChange={setScope} tabs={SCOPES.map((k) => ({ key: k, label: tr.t(`groups.${k}`) }))} />
        <input
          type="search"
          className="input max-w-xs flex-1"
          placeholder={tr.t('common.search')}
          aria-label={tr.t('common.search')}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {list.isPending ? (
        <CardSkeletons count={6} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('groups.empty')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((g) => (
            <GroupCard key={g.id} g={g} />
          ))}
        </div>
      )}
      <div ref={sentinel} aria-hidden />
      {creating && <CreateDialog kind={kind} onClose={() => setCreating(false)} />}
    </div>
  );
}
