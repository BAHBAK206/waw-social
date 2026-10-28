import { ADMIN_PERMISSIONS, ROOT_ONLY, birthYearChoices, hasPermission, type AdminUserDto, type ReportDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, UserChip } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ColumnChart } from '@/components/ui/Charts';
import { Checkbox, Input, Select, Switch } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, Spinner } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes, formatNumber, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { useSession } from '@/lib/session';
import { confirmDialog, promptDialog, toast, toastError } from '@/lib/ui';

export function OverviewTab() {
  const tr = useT();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.admin.overview(), refetchInterval: 60_000 });
  if (q.isPending) return <CardSkeletons count={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const stats: [string, number][] = [
    ['users', o.users.total],
    ['today', o.users.today],
    ['week', o.users.week],
    ['teachers', o.users.teachers],
    ['banned', o.users.banned],
    ['online', o.users.online],
    ['posts', o.content.posts],
    ['quizzes', o.content.quizzes],
    ['attempts', o.content.attempts],
    ['groups', o.content.groups],
    ['courses', o.content.courses],
    ['forms', o.content.forms],
    ['library', o.content.library],
    ['openReports', o.openReports],
    ['errors', o.errors24h],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="card p-4">
            <p className="text-2xl font-black tabular-nums">{formatNumber(v, tr)}</p>
            <p className="muted text-sm">{tr.t(`admin.stats.${k}` as 'admin.stats.users')}</p>
          </div>
        ))}
      </div>
      <section className="card space-y-2 p-4">
        <h2 className="font-black">{tr.t('admin.system.title')}</h2>
        <p className="text-sm">
          <b>{tr.t('admin.system.lastBackup')}:</b>{' '}
          {o.system.lastBackupAt ? (
            <span className={cx(Date.now() - o.system.lastBackupAt > 2 * 86400_000 && 'text-err font-bold')}>
              {relativeTime(o.system.lastBackupAt, tr)}
              {o.system.lastBackupSizeKb ? ` · ${formatBytes(o.system.lastBackupSizeKb * 1024)}` : ''}
            </span>
          ) : (
            <span className="text-warn">{tr.t('admin.system.never')}</span>
          )}
        </p>
        <p className="text-sm">
          {tr.t('admin.system.videosProcessing')}: <b className="tabular-nums">{o.system.videosProcessing}</b>
          {o.system.videosFailed > 0 && (
            <>
              {' · '}
              <span className="text-err">
                {tr.t('admin.system.videosFailed')}: <b className="tabular-nums">{o.system.videosFailed}</b>
              </span>
            </>
          )}
        </p>
        <p className={cx('text-sm', !o.system.alertsConfigured && 'muted')}>
          {o.system.alertsConfigured ? tr.t('admin.system.alertsOn') : tr.t('admin.system.alertsOff')}
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <ColumnChart title={tr.t('admin.stats.signups')} data={o.signupsByDay.map((d) => ({ label: d.day.slice(5), value: d.count, title: d.day }))} />
        </div>
        <div className="card p-4">
          <ColumnChart
            title={tr.t('admin.stats.activity')}
            data={o.activityByDay.map((d) => ({ label: d.day.slice(5), value: d.attempts + d.posts + d.messages, title: d.day }))}
          />
        </div>
      </div>
    </div>
  );
}

function UserDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.admin.user(id) });
  const canManage = hasPermission(me.role, me.permissions, 'users.manage');
  const isRoot = me.role === 'root';
  const refresh = async () => {
    await Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ['admin', 'users'] })]);
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(tr.t('common.saved'));
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  const u = q.data?.user;
  const [badge, setBadge] = useState({ enabled: false, label: '', color: '#1d9bf0', shape: 'seal' });
  const [perms, setPerms] = useState<string[]>([]);
  useEffect(() => {
    if (!u) return;
    setPerms(u.permissions);
    setBadge({ enabled: !!u.badge, label: u.badge?.label ?? '', color: u.badge?.color ?? '#1d9bf0', shape: u.badge?.shape ?? 'seal' });
  }, [u]);
  return (
    <Modal open onClose={onClose} size="lg" title={u ? u.displayName : tr.t('admin.users.details')}>
      {q.isPending ? (
        <Spinner className="py-10" />
      ) : q.error || !u ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar name={u.displayName} url={u.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <Link to={`/u/${u.id}`} className="font-black hover:underline" dir="auto">
                {u.displayName}
              </Link>
              <p className="muted truncate text-sm" dir="ltr">
                {u.email} {u.emailVerified ? '✓' : ''}
              </p>
              <p className="muted text-xs">
                {tr.t(`admin.users.roles.${u.role}`)} · {relativeTime(u.createdAt, tr)}
              </p>
            </div>
            {u.isMinor && <span className="badge badge-warn">{tr.t('admin.users.minor')}</span>}
            {u.banned && <span className="badge badge-err">{tr.t('admin.users.banned')}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {(
              [
                ['posts', q.data.stats.posts],
                ['attempts', q.data.stats.attempts],
                ['reports', q.data.stats.reports],
                ['xp', q.data.stats.xp],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-soft p-2">
                <p className="font-black tabular-nums">{v}</p>
                <p className="muted text-xs">{k}</p>
              </div>
            ))}
          </div>
          {u.banned && u.banReason && <p className="rounded-xl bg-soft p-3 text-sm">{u.banReason}</p>}
          {canManage && u.role !== 'root' && u.id !== me.id && (
            <>
              <div className="flex flex-wrap gap-2">
                {u.banned ? (
                  <Button variant="outline" onClick={() => void run(() => api.admin.unban(u.id))}>
                    {tr.t('admin.users.unban')}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    icon={<Ban className="size-4" />}
                    onClick={async () => {
                      const reason = await promptDialog({ title: tr.t('admin.users.ban'), danger: true, input: { label: tr.t('admin.users.banReason') } });
                      if (reason !== null) void run(() => api.admin.ban(u.id, reason));
                    }}
                  >
                    {tr.t('admin.users.ban')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => void run(() => api.admin.revokeSessions(u.id))}>
                  {tr.t('admin.users.revokeSessions')}
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (!(await confirmDialog({ title: tr.t('admin.users.deleteUser'), body: tr.t('common.confirmDelete'), danger: true }))) return;
                    try {
                      await api.admin.deleteUser(u.id);
                      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
                      onClose();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  {tr.t('admin.users.deleteUser')}
                </Button>
              </div>
              <section className="space-y-3 border-t border-line pt-4">
                <h3 className="font-black">{tr.t('admin.users.badge')}</h3>
                <Switch checked={badge.enabled} onChange={(v) => setBadge({ ...badge, enabled: v })} label={tr.t('admin.users.badge')} />
                {badge.enabled && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label={tr.t('admin.users.badgeLabel')}
                      value={badge.label}
                      maxLength={40}
                      onChange={(e) => setBadge({ ...badge, label: e.target.value })}
                    />
                    <Input
                      type="color"
                      label={tr.t('admin.users.badgeColor')}
                      value={badge.color}
                      onChange={(e) => setBadge({ ...badge, color: e.target.value })}
                    />
                    <Select
                      label="Shape"
                      value={badge.shape}
                      onChange={(e) => setBadge({ ...badge, shape: e.target.value })}
                      options={['seal', 'shield', 'diamond', 'ribbon', 'crown', 'pill'].map((s) => ({ value: s, label: s }))}
                    />
                  </div>
                )}
                <Button size="sm" onClick={() => void run(() => api.admin.setBadge(u.id, badge))}>
                  {tr.t('common.save')}
                </Button>
              </section>
              <section className="space-y-3 border-t border-line pt-4">
                <Select
                  label={tr.t('admin.users.birthYear')}
                  value={u.birthYear ? String(u.birthYear) : ''}
                  placeholder="—"
                  onChange={(e) => void run(() => api.admin.setBirthYear(u.id, e.target.value ? Number(e.target.value) : null))}
                  options={birthYearChoices().map((y) => ({ value: String(y), label: String(y) }))}
                />
              </section>
              {isRoot && (
                <section className="space-y-3 border-t border-line pt-4">
                  <h3 className="font-black">{tr.t('admin.users.role')}</h3>
                  <Select
                    value={u.role}
                    onChange={(e) => void run(() => api.admin.setRole(u.id, e.target.value as 'user' | 'moderator' | 'admin'))}
                    options={(['user', 'moderator', 'admin'] as const).map((r) => ({ value: r, label: tr.t(`admin.users.roles.${r}`) }))}
                  />
                  {u.role !== 'user' && (
                    <>
                      <h3 className="font-black">{tr.t('admin.users.permissions')}</h3>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {ADMIN_PERMISSIONS.filter((p) => !ROOT_ONLY.includes(p)).map((p) => (
                          <Checkbox
                            key={p}
                            checked={perms.includes(p)}
                            onChange={(v) => setPerms(v ? [...perms, p] : perms.filter((x) => x !== p))}
                            label={tr.t(`admin.permissions.${p}`)}
                          />
                        ))}
                      </div>
                      <Button size="sm" onClick={() => void run(() => api.admin.setPermissions(u.id, perms))}>
                        {tr.t('common.save')}
                      </Button>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function UsersTab() {
  const tr = useT();
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);
  const list = usePaged<AdminUserDto>(['admin', 'users', q], (cursor) => api.admin.users({ q, cursor, limit: 30 }));
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
        <input
          type="search"
          className="input ps-9"
          placeholder={tr.t('admin.users.search')}
          aria-label={tr.t('admin.users.search')}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {list.isPending ? (
        <CardSkeletons count={5} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('people.empty')} />
      ) : (
        <div className="card divide-y divide-line">
          {list.items.map((u) => (
            <button key={u.id} type="button" className="flex w-full items-center gap-3 p-3 text-start hover:bg-soft" onClick={() => setOpen(u.id)}>
              <UserChip user={u} link={false} className="flex-1" subtitle={<span dir="ltr">{u.email}</span>} />
              {u.role !== 'user' && (
                <span className="badge badge-primary">
                  <ShieldCheck className="size-3" /> {tr.t(`admin.users.roles.${u.role}`)}
                </span>
              )}
              {u.banned && <span className="badge badge-err">{tr.t('admin.users.banned')}</span>}
              <span className="muted hidden text-xs sm:block">{relativeTime(u.createdAt, tr)}</span>
            </button>
          ))}
        </div>
      )}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      {open && <UserDialog id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function ReportsTab() {
  const tr = useT();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const list = usePaged<ReportDto>(['admin', 'reports', status], (cursor) => api.admin.reports({ status, cursor, limit: 30 }));
  const resolve = async (r: ReportDto, s: 'resolved' | 'dismissed', removeContent = false) => {
    try {
      await api.admin.resolveReport(r.id, { status: s, removeContent });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-4">
      <Tabs
        active={status}
        onChange={setStatus}
        tabs={(['open', 'resolved', 'dismissed'] as const).map((k) => ({ key: k, label: tr.t(`admin.reports.${k}`) }))}
      />
      {list.isPending ? (
        <CardSkeletons count={3} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('admin.reports.empty')} />
      ) : (
        list.items.map((r) => (
          <article key={r.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-warn">{tr.tDyn(`report.reasons.${r.reason}`, undefined, r.reason)}</span>
              <span className="badge">{r.targetType}</span>
              {r.reportCount > 1 && <span className="badge">{tr.t('admin.reports.count', { count: r.reportCount })}</span>}
              {r.autoHidden && r.status === 'open' && <span className="badge badge-err">{tr.t('admin.reports.autoHidden')}</span>}
              <span className="muted ms-auto text-xs">{relativeTime(r.createdAt, tr)}</span>
            </div>
            {r.target && (
              <p className="text-sm">
                <b>{tr.t('admin.reports.target')}:</b>{' '}
                {r.target.link ? (
                  <Link to={r.target.link} className="link" dir="auto">
                    {r.target.label}
                  </Link>
                ) : (
                  <span dir="auto">{r.target.label}</span>
                )}
              </p>
            )}
            {r.details && (
              <p className="rounded-lg bg-soft p-2 text-sm" dir="auto">
                {r.details}
              </p>
            )}
            <p className="muted text-xs">
              {tr.t('admin.reports.reporter')}: {r.reporter.displayName}
            </p>
            {r.status === 'open' ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void resolve(r, 'resolved')}>
                  {tr.t('admin.reports.resolve')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => void resolve(r, 'resolved', true)}>
                  {tr.t('admin.reports.removeContent')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void resolve(r, 'dismissed')}
                  title={r.autoHidden ? tr.t('admin.reports.restoreHint') : undefined}
                >
                  {tr.t('admin.reports.dismiss')}
                </Button>
                {r.autoHidden && <p className="muted w-full text-xs">{tr.t('admin.reports.restoreHint')}</p>}
              </div>
            ) : (
              r.resolution && <p className="muted text-sm">{r.resolution}</p>
            )}
          </article>
        ))
      )}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}
