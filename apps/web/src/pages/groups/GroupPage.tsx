import type { ChannelDto, GroupDto, GroupMemberDto, GroupResourceDto, PostDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Hash, Link2, LogOut, Megaphone, Plus, Settings, Trash2, UserCheck, UserX, Users, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChatThread } from '@/components/chat/ChatThread';
import { reportContent } from '@/components/common/ReportDialog';
import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar, UserChip } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, Spinner } from '@/components/ui/States';
import { GroupStudy } from '@/components/collab/GroupStudy';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { patchItem, removeItem, usePaged, useSentinel } from '@/lib/infinite';
import { useSession } from '@/lib/session';
import { confirmDialog, promptDialog, toast, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

const isStaff = (r: GroupDto['myRole']) => r === 'owner' || r === 'admin';

function Posts({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const key = ['group', g.id, 'posts'];
  const list = usePaged<PostDto>(key, (cursor) => api.groups.posts(g.id, { cursor, limit: 15 }));
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);
  return (
    <div className="space-y-4">
      {g.myRole && <Composer groupId={g.id} onPosted={() => void list.refetch()} />}
      {list.isPending ? (
        <CardSkeletons count={2} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('feed.empty')} />
      ) : (
        list.items.map((p) => (
          <PostCard key={p.id} post={p} onPatch={(fn) => patchItem<PostDto>(qc, key, p.id, fn)} onRemoved={(id) => removeItem<PostDto>(qc, key, id)} />
        ))
      )}
      <div ref={sentinel} aria-hidden />
    </div>
  );
}

function Members({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const key = ['group', g.id, 'members'];
  const list = usePaged<GroupMemberDto>(key, (cursor) => api.groups.members(g.id, { cursor, limit: 30 }));
  const manage = isStaff(g.myRole);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  if (list.isPending) return <CardSkeletons count={3} />;
  return (
    <div className="space-y-2">
      {list.items.map((m) => (
        <div key={m.user.id} className="card flex items-center gap-3 p-3">
          <UserChip user={m.user} className="flex-1" subtitle={tr.t(`groups.roles.${m.role}`)} />
          {manage && m.role !== 'owner' && m.user.id !== me?.id && (
            <Menu
              label={tr.t('common.more')}
              items={[
                {
                  label: tr.t('groups.makeAdmin'),
                  hidden: m.role === 'admin' || g.myRole !== 'owner',
                  onSelect: () => void act(() => api.groups.setRole(g.id, m.user.id, 'admin')),
                },
                {
                  label: tr.t('groups.makeTeacher'),
                  hidden: m.role === 'teacher',
                  onSelect: () => void act(() => api.groups.setRole(g.id, m.user.id, 'teacher')),
                },
                {
                  label: tr.t('groups.makeMember'),
                  hidden: m.role === 'member' || (m.role === 'admin' && g.myRole !== 'owner'),
                  onSelect: () => void act(() => api.groups.setRole(g.id, m.user.id, 'member')),
                },
                {
                  label: tr.t('groups.transfer'),
                  hidden: g.myRole !== 'owner',
                  onSelect: async () => {
                    if (await confirmDialog({ title: tr.t('groups.transfer'), danger: true })) void act(() => api.groups.transfer(g.id, m.user.id));
                  },
                },
                {
                  label: tr.t('groups.removeMember'),
                  danger: true,
                  hidden: m.role === 'admin' && g.myRole !== 'owner',
                  onSelect: async () => {
                    if (await confirmDialog({ title: tr.t('groups.removeMember'), danger: true })) void act(() => api.groups.kick(g.id, m.user.id));
                  },
                },
              ]}
            />
          )}
        </div>
      ))}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}

function Resources({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const key = ['group', g.id, 'resources'];
  const list = usePaged<GroupResourceDto>(key, (cursor) => api.groups.resources(g.id, { cursor, limit: 30 }));
  const [link, setLink] = useState(false);
  const [f, setF] = useState({ title: '', url: '' });
  const add = async (body: Parameters<typeof api.groups.addResource>[1]) => {
    try {
      await api.groups.addResource(g.id, body);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-3">
      {g.myRole && (
        <div className="flex flex-wrap gap-2">
          <UploadButton
            variant="outline"
            size="sm"
            purpose="group"
            icon={<Plus className="size-4" />}
            onUploaded={(r) => void add({ title: r.key.split('/').pop() ?? 'file', url: r.url, kind: 'file', mime: r.mime, size: r.size })}
          >
            {tr.t('groups.resource.file')}
          </UploadButton>
          <Button variant="outline" size="sm" icon={<Link2 className="size-4" />} onClick={() => setLink(true)}>
            {tr.t('groups.resource.link')}
          </Button>
        </div>
      )}
      {list.isPending ? (
        <CardSkeletons count={2} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('groups.resource.empty')} />
      ) : (
        list.items.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 p-3">
            <a href={r.kind === 'file' ? fileUrl(r.url) : r.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1">
              <p className="truncate font-bold" dir="auto">
                {r.title}
              </p>
              <p className="muted text-xs">
                {r.uploader.displayName} · {relativeTime(r.createdAt, tr)}
                {r.size ? ` · ${formatBytes(r.size)}` : ''}
              </p>
            </a>
            {(isStaff(g.myRole) || r.uploader.id === me?.id) && (
              <button
                type="button"
                className="icon-btn icon-btn-sm text-err"
                aria-label={tr.t('common.delete')}
                onClick={async () => {
                  try {
                    await api.groups.removeResource(g.id, r.id);
                    await qc.invalidateQueries({ queryKey: key });
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
      {link && (
        <Modal
          open
          size="sm"
          onClose={() => setLink(false)}
          title={tr.t('groups.resource.add')}
          footer={
            <Button
              disabled={!f.title.trim() || !/^https?:\/\//i.test(f.url)}
              onClick={async () => {
                await add({ title: f.title.trim(), url: f.url.trim(), kind: 'link' });
                setLink(false);
                setF({ title: '', url: '' });
              }}
            >
              {tr.t('common.add')}
            </Button>
          }
        >
          <div className="space-y-3">
            <Input label={tr.t('common.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Input
              type="url"
              dir="ltr"
              label={tr.t('common.link')}
              placeholder="https://"
              value={f.url}
              onChange={(e) => setF({ ...f, url: e.target.value })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Leaderboard({ g }: { g: GroupDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['group', g.id, 'leaderboard'], queryFn: () => api.groups.leaderboard(g.id) });
  if (q.isPending) return <CardSkeletons count={3} />;
  if (!q.data?.items.length) return <EmptyState title={tr.t('common.empty')} />;
  return (
    <ol className="space-y-2">
      {q.data.items.map((e) => (
        <li key={e.user.id} className="card flex items-center gap-3 p-3">
          <span className="w-8 text-center font-black tabular-nums">{e.rank}</span>
          <UserChip user={e.user} className="flex-1" />
          <span className="font-black tabular-nums">{e.score} XP</span>
        </li>
      ))}
    </ol>
  );
}

function Live({ g }: { g: GroupDto }) {
  const tr = useT();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['group', g.id, 'live'], queryFn: () => api.live.list({ scopeType: g.kind, scopeId: g.id }) });
  const canHost = g.myRole === 'owner' || g.myRole === 'admin' || g.myRole === 'teacher';
  return (
    <div className="space-y-3">
      {canHost && (
        <Button
          icon={<Video className="size-4" />}
          onClick={async () => {
            try {
              const r = await api.live.create({ title: g.name, scopeType: g.kind, scopeId: g.id });
              navigate(`/live/${r.id}`);
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('live.create')}
        </Button>
      )}
      {q.isPending ? (
        <CardSkeletons count={2} />
      ) : !q.data?.items.length ? (
        <EmptyState title={tr.t('common.empty')} />
      ) : (
        q.data.items.map((r) => (
          <Link key={r.id} to={`/live/${r.id}`} className="card flex items-center gap-3 p-3 hover:shadow-lg">
            <Video className="size-5 text-primary" />
            <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
              {r.title}
            </span>
            <span className={cx('badge', r.status === 'live' && 'badge-err')}>
              {r.status === 'live'
                ? tr.t('live.liveNow')
                : r.scheduledAt
                  ? formatDateTime(r.scheduledAt, tr)
                  : tr.t(r.status === 'ended' ? 'live.ended' : 'live.scheduled')}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

function Channels({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['group', g.id, 'channels'], queryFn: () => api.groups.channels(g.id) });
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'text' as ChannelDto['kind'] });
  const channels = q.data?.items ?? [];
  const current = channels.find((c) => c.id === active) ?? channels[0];
  if (q.isPending) return <Spinner className="py-10" />;
  return (
    <div className="card flex min-h-[28rem] overflow-hidden max-md:flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-line p-2 md:w-52 md:flex-col md:border-e" aria-label={tr.t('groups.tabs.channels')}>
        {channels.map((c) => (
          <div key={c.id} className="flex items-center">
            <button
              type="button"
              aria-current={c.id === current?.id}
              className={cx('chip flex-1 justify-start', c.id === current?.id && 'is-active')}
              onClick={() => setActive(c.id)}
            >
              {c.kind === 'announcement' ? <Megaphone className="size-3.5" /> : <Hash className="size-3.5" />} <span dir="auto">{c.name}</span>
            </button>
            {isStaff(g.myRole) && (
              <button
                type="button"
                className="icon-btn icon-btn-sm text-err max-md:hidden"
                aria-label={tr.t('common.delete')}
                onClick={async () => {
                  if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true }))) return;
                  try {
                    await api.groups.removeChannel(g.id, c.id);
                    await qc.invalidateQueries({ queryKey: ['group', g.id, 'channels'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {isStaff(g.myRole) && (
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            {tr.t('groups.channel.add')}
          </Button>
        )}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {current ? (
          <ChatThread
            key={current.id}
            conversationId={current.conversationId}
            group
            readOnly={current.kind === 'announcement' && !isStaff(g.myRole) && g.myRole !== 'teacher'}
            className="max-h-[32rem]"
          />
        ) : (
          <EmptyState title={tr.t('common.empty')} />
        )}
      </div>
      {adding && (
        <Modal
          open
          size="sm"
          onClose={() => setAdding(false)}
          title={tr.t('groups.channel.add')}
          footer={
            <Button
              disabled={!f.name.trim()}
              onClick={async () => {
                try {
                  const c = await api.groups.addChannel(g.id, { name: f.name.trim(), kind: f.kind });
                  await qc.invalidateQueries({ queryKey: ['group', g.id, 'channels'] });
                  setActive(c.id);
                  setAdding(false);
                  setF({ name: '', kind: 'text' });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('common.create')}
            </Button>
          }
        >
          <div className="space-y-3">
            <Input label={tr.t('common.name')} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Select
              label={tr.t('groups.tabs.channels')}
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value as ChannelDto['kind'] })}
              options={[
                { value: 'text', label: tr.t('groups.channel.text') },
                { value: 'announcement', label: tr.t('groups.channel.announcement') },
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsTab({ g }: { g: GroupDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: g.name,
    description: g.description,
    privacy: g.privacy,
    tags: g.tags.join(', '),
    avatarUrl: g.avatarUrl,
    coverUrl: g.coverUrl,
  });
  const [busy, setBusy] = useState(false);
  const requests = useQuery({
    queryKey: ['group', g.id, 'requests'],
    queryFn: () => api.groups.requests(g.id),
    enabled: g.privacy === 'private' || g.requestCount > 0,
  });
  const decide = async (userId: string, d: 'approve' | 'reject') => {
    try {
      await api.groups.decide(g.id, userId, d);
      await Promise.all([requests.refetch(), qc.invalidateQueries({ queryKey: ['group', g.id] })]);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-6">
      {(requests.data?.items.length ?? 0) > 0 || g.privacy === 'private' ? (
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('groups.requests')}</h3>
          {!requests.data?.items.length ? (
            <p className="muted">{tr.t('groups.noRequests')}</p>
          ) : (
            requests.data.items.map((r) => (
              <div key={r.user.id} className="flex items-center gap-3">
                <UserChip user={r.user} className="flex-1" subtitle={r.message || undefined} />
                <Button size="sm" variant="success" icon={<UserCheck className="size-4" />} onClick={() => void decide(r.user.id, 'approve')}>
                  {tr.t('groups.approve')}
                </Button>
                <Button size="sm" variant="outline" icon={<UserX className="size-4" />} onClick={() => void decide(r.user.id, 'reject')}>
                  {tr.t('groups.reject')}
                </Button>
              </div>
            ))
          )}
        </section>
      ) : null}
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={f.name} url={f.avatarUrl} size="lg" />
          <UploadButton variant="outline" size="sm" purpose="group" imageOnly onUploaded={(r) => setF({ ...f, avatarUrl: r.url })}>
            {tr.t('settings.profile.avatar')}
          </UploadButton>
          <UploadButton variant="outline" size="sm" purpose="group" imageOnly onUploaded={(r) => setF({ ...f, coverUrl: r.url })}>
            {tr.t('settings.profile.cover')}
          </UploadButton>
        </div>
        <Input label={tr.t('common.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Select
          label={tr.t('groups.privacyLabel')}
          value={f.privacy}
          onChange={(e) => setF({ ...f, privacy: e.target.value as 'public' | 'private' })}
          options={[
            { value: 'public', label: tr.t('common.public') },
            { value: 'private', label: tr.t('common.private') },
          ]}
        />
        <Input label={tr.t('groups.tags')} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.groups.update(g.id, {
                ...f,
                name: f.name.trim(),
                tags: f.tags
                  .split(/[,،]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 8),
              });
              await qc.invalidateQueries({ queryKey: ['group', g.id] });
              toast(tr.t('common.saved'));
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      </section>
      {g.myRole === 'owner' && (
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (!(await confirmDialog({ title: tr.t('groups.deleteConfirm'), danger: true, confirmLabel: tr.t('groups.deleteGroup') }))) return;
            try {
              await api.groups.remove(g.id);
              navigate(g.kind === 'group' ? '/groups' : '/communities', { replace: true });
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('groups.deleteGroup')}
        </Button>
      )}
    </div>
  );
}

export default function GroupPage() {
  const { groupId = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gate = useAuthGate();
  const q = useQuery({ queryKey: ['group', groupId], queryFn: () => api.groups.get(groupId) });
  const g = q.data;
  const isCommunity = g?.kind === 'community';
  const member = !!g?.myRole;
  const tabKeys = ['posts', 'chat', 'study', 'channels', 'members', 'resources', 'leaderboard', 'live', 'settings'] as const;
  const [tab, setTab] = useTabParam(tabKeys, 'posts');
  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error || !g)
    return (
      <div className="page-narrow">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  const refresh = () => qc.invalidateQueries({ queryKey: ['group', groupId] });
  const locked = g.privacy === 'private' && !member;

  const join = gate(async () => {
    try {
      let message: string | undefined;
      if (g.privacy === 'private') {
        const m = await promptDialog({ title: tr.t('groups.requestJoin'), input: { label: tr.t('common.optional') } });
        if (m === null) return;
        message = m || undefined;
      }
      const r = await api.groups.join(g.id, message);
      toast(r.status === 'member' ? tr.t('groups.join') : tr.t('groups.requested'));
      await refresh();
      await qc.invalidateQueries({ queryKey: ['groups'] });
    } catch (e) {
      toastError(e);
    }
  });

  const tabs = [
    { key: 'posts' as const, label: tr.t('groups.tabs.posts') },
    { key: 'channels' as const, label: tr.t('groups.tabs.channels'), hidden: !isCommunity || !member },
    { key: 'chat' as const, label: tr.t('groups.tabs.chat'), hidden: isCommunity || !member || !g.conversationId },
    { key: 'study' as const, label: tr.t('groups.tabs.study'), hidden: isCommunity || !member },
    { key: 'members' as const, label: tr.t('groups.tabs.members'), hidden: locked },
    { key: 'resources' as const, label: tr.t('groups.tabs.resources'), hidden: locked },
    { key: 'leaderboard' as const, label: tr.t('groups.tabs.leaderboard'), hidden: locked },
    { key: 'live' as const, label: tr.t('groups.tabs.live'), hidden: !member },
    {
      key: 'settings' as const,
      label: tr.t('groups.tabs.settings'),
      icon: <Settings className="size-4" />,
      hidden: !isStaff(g.myRole),
      badge: g.requestCount > 0 ? g.requestCount : undefined,
    },
  ];
  const activeTab = tabs.find((t) => t.key === tab && !t.hidden) ? tab : 'posts';

  return (
    <div className="page-narrow space-y-5">
      <div className="card overflow-hidden">
        <div
          className="surface-gradient h-32 md:h-44"
          style={g.coverUrl ? { backgroundImage: `url(${fileUrl(g.coverUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        />
        <div className="px-4 pb-4 md:px-6">
          <div className="-mt-10 flex flex-wrap items-end gap-3">
            <Avatar name={g.name} url={g.avatarUrl} size="xl" className="rounded-full ring-4 ring-[var(--card-solid)]" />
            <div className="min-w-0 flex-1 pt-12 md:pt-0">
              <h1 className="text-2xl font-black" dir="auto">
                {g.name}
              </h1>
              <p className="muted flex flex-wrap items-center gap-x-3 text-sm">
                <span className="inline-flex items-center gap-1">
                  {g.privacy === 'private' ? (
                    tr.t('common.private')
                  ) : (
                    <>
                      <Globe className="size-3.5" /> {tr.t('common.public')}
                    </>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {tr.t('groups.members', { count: g.memberCount })}
                </span>
                <Link className="hover:underline" to={`/u/${g.owner.id}`}>
                  {g.owner.displayName}
                </Link>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!member &&
                (g.pendingRequest ? (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api.groups.cancelRequest(g.id);
                        await refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    {tr.t('groups.cancelRequest')}
                  </Button>
                ) : (
                  <Button onClick={() => void join()}>{g.privacy === 'private' ? tr.t('groups.requestJoin') : tr.t('groups.join')}</Button>
                ))}
              <Menu
                label={tr.t('common.more')}
                items={[
                  { label: tr.t('common.report'), onSelect: gate(() => reportContent({ targetType: 'group', targetId: g.id })) },
                  {
                    label: tr.t('groups.leave'),
                    icon: <LogOut className="size-4" />,
                    danger: true,
                    hidden: !member || g.myRole === 'owner',
                    onSelect: async () => {
                      if (!(await confirmDialog({ title: tr.t('groups.leave'), danger: true }))) return;
                      try {
                        await api.groups.leave(g.id);
                        await refresh();
                        await qc.invalidateQueries({ queryKey: ['groups'] });
                        navigate(g.kind === 'group' ? '/groups' : '/communities');
                      } catch (e) {
                        toastError(e);
                      }
                    },
                  },
                ]}
              />
            </div>
          </div>
          {g.description && (
            <p className="mt-3 whitespace-pre-line" dir="auto">
              {g.description}
            </p>
          )}
          {g.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2">
              {g.tags.map((t) => (
                <span key={t} className="chip !min-h-6 text-xs">
                  #{t}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      {locked ? (
        <EmptyState icon={<Users className="size-7" />} title={tr.t('groups.privateNotice')} />
      ) : (
        <>
          <Tabs active={activeTab} onChange={setTab} tabs={tabs} />
          {activeTab === 'posts' && <Posts g={g} />}
          {activeTab === 'chat' && g.conversationId && (
            <div className="card flex h-[34rem] flex-col overflow-hidden">
              <ChatThread conversationId={g.conversationId} group />
            </div>
          )}
          {activeTab === 'study' && <GroupStudy g={g} />}
          {activeTab === 'channels' && <Channels g={g} />}
          {activeTab === 'members' && <Members g={g} />}
          {activeTab === 'resources' && <Resources g={g} />}
          {activeTab === 'leaderboard' && <Leaderboard g={g} />}
          {activeTab === 'live' && <Live g={g} />}
          {activeTab === 'settings' && <SettingsTab g={g} />}
        </>
      )}
    </div>
  );
}
