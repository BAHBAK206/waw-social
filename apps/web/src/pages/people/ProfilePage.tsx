import { ACHIEVEMENTS, xpProgress, type PostDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Calendar, Flag, Flame, MessageCircle, Settings, Timer, Trophy } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { FollowButton } from '@/components/common/FollowButton';
import { reportContent } from '@/components/common/ReportDialog';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar, VerifiedBadge } from '@/components/ui/Avatar';
import { ButtonLink, Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { ProgressBar } from '@/components/ui/Charts';
import { CardSkeletons, EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api, fileUrl } from '@/lib/api';
import { formatDate, formatNumber, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { patchItem, removeItem, usePaged, useSentinel } from '@/lib/infinite';
import { useSession } from '@/lib/session';
import { confirmDialog, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';
import { Link } from 'react-router';

const TABS = ['posts', 'results', 'achievements', 'groups'] as const;

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className="text-primary">{icon}</span>
      <div>
        <p className="leading-none font-black tabular-nums">{value}</p>
        <p className="muted text-xs">{label}</p>
      </div>
    </div>
  );
}

function PostsTab({ userId }: { userId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const key = ['posts', 'author', userId];
  const list = usePaged<PostDto>(key, (cursor) => api.posts.feed({ authorId: userId, scope: 'all', cursor, limit: 15 }));
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);
  if (list.isPending) return <CardSkeletons count={2} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.items.length) return <EmptyState title={tr.t('feed.empty')} />;
  return (
    <div className="space-y-4">
      {list.items.map((p) => (
        <PostCard key={p.id} post={p} onPatch={(fn) => patchItem<PostDto>(qc, key, p.id, fn)} onRemoved={(id) => removeItem<PostDto>(qc, key, id)} />
      ))}
      <div ref={sentinel} aria-hidden />
    </div>
  );
}

export default function ProfilePage() {
  const { id: param } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gate = useAuthGate();
  const me = useSession((s) => s.me);
  const id = param ?? me?.id ?? '';
  const isMe = !!me && me.id === id;
  const [tab, setTab] = useTabParam(TABS, 'posts');
  const q = useQuery({ queryKey: ['profile', id], queryFn: () => api.users.get(id), enabled: !!id });
  const results = useQuery({
    queryKey: ['profile', id, 'results'],
    queryFn: () => api.users.quizResults(id),
    enabled: tab === 'results' && !!q.data && !q.data.statsHidden,
  });
  const groups = useQuery({ queryKey: ['profile', id, 'groups'], queryFn: () => api.users.groups(id), enabled: tab === 'groups' });

  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error || !q.data)
    return (
      <div className="page-narrow">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  const u = q.data;
  const progress = xpProgress(u.xp);
  const patch = (fn: (p: typeof u) => typeof u) => qc.setQueryData(['profile', id], fn(u));
  const unlocked = new Set(u.achievements.map((a) => a.id));

  return (
    <div className="page-narrow space-y-5">
      <div className="card overflow-hidden">
        <div
          className="surface-gradient h-32 md:h-44"
          style={u.coverUrl ? { backgroundImage: `url(${fileUrl(u.coverUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        />
        <div className="px-4 pb-4 md:px-6">
          <div className="-mt-12 flex flex-wrap items-end gap-3">
            <Avatar name={u.displayName} url={u.avatarUrl} size="xl" online={u.online} className="rounded-full ring-4 ring-[var(--card-solid)]" />
            <div className="min-w-0 flex-1 pt-14 md:pt-0 md:pb-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black" dir="auto">
                {u.displayName}
                <VerifiedBadge badge={u.badge} />
              </h1>
              <p className="muted text-sm">
                {u.username ? `@${u.username} · ` : ''}
                {tr.t(`ranks.${progress.rank}`)} · {tr.t('common.levelN', { level: progress.level })}
                {u.followsYou && <span className="badge ms-2">{tr.t('people.followsYou')}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isMe ? (
                <ButtonLink to="/settings" variant="outline" icon={<Settings className="size-4" />}>
                  {tr.t('people.editProfile')}
                </ButtonLink>
              ) : (
                <>
                  <FollowButton
                    userId={u.id}
                    size="md"
                    following={u.isFollowing}
                    onChange={(f) => patch((p) => ({ ...p, isFollowing: f, followers: p.followers + (f ? 1 : -1) }))}
                  />
                  {u.canMessage && (
                    <Button
                      variant="soft"
                      icon={<MessageCircle className="size-4" />}
                      onClick={gate(async () => {
                        try {
                          const c = await api.chat.direct(u.id);
                          navigate(`/chat/${c.id}`);
                        } catch (e) {
                          toastError(e);
                        }
                      })}
                    >
                      {tr.t('people.message')}
                    </Button>
                  )}
                  <Menu
                    label={tr.t('common.more')}
                    items={[
                      {
                        label: tr.t('common.report'),
                        icon: <Flag className="size-4" />,
                        onSelect: gate(() => reportContent({ targetType: 'user', targetId: u.id })),
                      },
                      {
                        label: tr.t('common.block'),
                        icon: <Ban className="size-4" />,
                        danger: true,
                        onSelect: gate(async () => {
                          if (!(await confirmDialog({ title: tr.t('people.blockConfirm'), danger: true }))) return;
                          try {
                            await api.users.block(u.id);
                            navigate(-1);
                          } catch (e) {
                            toastError(e);
                          }
                        }),
                      },
                    ]}
                  />
                </>
              )}
            </div>
          </div>
          {u.bio && (
            <p className="mt-3 whitespace-pre-line" dir="auto">
              {u.bio}
            </p>
          )}
          <p className="muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {u.institution && <span dir="auto">{u.institution}</span>}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" /> {tr.t('people.joined', { date: formatDate(u.createdAt, tr, { month: 'long', year: 'numeric' }) })}
            </span>
            {!u.online && u.lastSeenAt && <span>{tr.t('people.lastSeen', { time: relativeTime(u.lastSeenAt, tr) })}</span>}
          </p>
          <div className="mt-3 flex gap-5 text-sm">
            <Link to={isMe ? '/people?tab=followers' : '#'} className="hover:underline">
              <b className="tabular-nums">{formatNumber(u.followers, tr)}</b> <span className="muted">{tr.t('people.followers')}</span>
            </Link>
            <Link to={isMe ? '/people?tab=following' : '#'} className="hover:underline">
              <b className="tabular-nums">{formatNumber(u.following, tr)}</b> <span className="muted">{tr.t('people.following')}</span>
            </Link>
          </div>
        </div>
      </div>

      {u.statsHidden ? (
        <p className="muted text-center text-sm">{tr.t('people.statsHidden')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Trophy className="size-5" />} value={formatNumber(u.xp, tr)} label="XP" />
            <Stat icon={<Flame className="size-5" />} value={u.streak} label={tr.t('common.streak')} />
            <Stat icon={<Trophy className="size-5" />} value={u.quizCount} label={tr.t('people.quizzes')} />
            <Stat icon={<Timer className="size-5" />} value={tr.t('common.minutes', { count: u.studyMinutes })} label={tr.t('people.studyTime')} />
          </div>
          <div className="card p-3">
            <ProgressBar value={progress.inLevel} max={progress.needed} label={`XP ${progress.xp} / ${progress.nextThreshold}`} />
          </div>
        </>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={TABS.map((k) => ({ key: k, label: tr.t(`people.tabs.${k}`), hidden: u.statsHidden && (k === 'results' || k === 'achievements') }))}
      />
      {tab === 'posts' && <PostsTab userId={u.id} />}
      {tab === 'results' &&
        (results.isPending ? (
          <CardSkeletons count={2} />
        ) : !results.data?.items.length ? (
          <EmptyState title={tr.t('common.empty')} />
        ) : (
          <ul className="space-y-2">
            {results.data.items.map((r) => (
              <li key={`${r.quizId}-${r.at}`} className="card flex items-center gap-3 p-3">
                <Link to={`/quiz/${r.quizId}`} className="min-w-0 flex-1 truncate font-bold" dir="auto">
                  {r.title}
                </Link>
                <span className="muted text-xs">{relativeTime(r.at, tr)}</span>
                <span className="font-black tabular-nums">{r.pct}%</span>
              </li>
            ))}
          </ul>
        ))}
      {tab === 'achievements' && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            const [name, desc] = (tr.dict.achievements.items as unknown as Record<string, readonly [string, string]>)[a.key] ?? [a.key, ''];
            return (
              <li key={a.id} className={`card flex items-center gap-3 p-3 ${got ? '' : 'opacity-50 grayscale'}`}>
                <span className="text-3xl" aria-hidden>
                  {a.icon}
                </span>
                <div className="min-w-0">
                  <p className="font-black">{name}</p>
                  <p className="muted text-xs">{desc}</p>
                </div>
                <span className="sr-only">{got ? tr.t('achievements.unlocked') : tr.t('achievements.locked')}</span>
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'groups' &&
        (groups.isPending ? (
          <CardSkeletons count={2} />
        ) : !groups.data?.items.length ? (
          <EmptyState title={tr.t('groups.empty')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.data.items.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`} className="card flex items-center gap-3 p-3 hover:shadow-lg">
                  <Avatar name={g.name} url={g.avatarUrl} />
                  <div className="min-w-0">
                    <p className="truncate font-black" dir="auto">
                      {g.name}
                    </p>
                    <p className="muted text-xs">{tr.t('groups.members', { count: g.memberCount })}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
