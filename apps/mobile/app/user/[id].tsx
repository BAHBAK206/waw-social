import { ACHIEVEMENTS, xpProgress, type PostDto } from '@qubedu/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const isMe = me.id === id;
  const q = useQuery({ queryKey: ['profile', id], queryFn: () => api.users.get(id!) });
  const posts = useInfiniteQuery({
    queryKey: ['posts', 'author', id],
    queryFn: ({ pageParam }) => api.posts.feed({ authorId: id, scope: 'all', cursor: pageParam, limit: 10 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const results = useQuery({ queryKey: ['profile', id, 'results'], queryFn: () => api.users.quizResults(id!) });
  const groups = useQuery({ queryKey: ['profile', id, 'groups'], queryFn: () => api.users.groups(id!) });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const u = q.data;
  const prog = xpProgress(u.xp);
  const unlocked = new Set(u.achievements.map((a) => a.id));
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];
  const setProfile = (patch: Partial<typeof u>) => qc.setQueryData(['profile', id], { ...u, ...patch });

  const header = (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={u.displayName} url={u.avatarUrl} size={88} />
        <Text weight="black" size={22}>
          {u.displayName}
        </Text>
        <Text muted>
          {u.username ? `@${u.username} · ` : ''}
          {tr.t(`ranks.${prog.rank}`)} · {tr.t('common.levelN', { level: prog.level })}
        </Text>
        {u.bio ? <Text style={{ textAlign: 'center' }}>{u.bio}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 6 }}>
          <Text>
            <Text weight="black">{u.followers}</Text> <Text muted>{tr.t('people.followers')}</Text>
          </Text>
          <Text>
            <Text weight="black">{u.following}</Text> <Text muted>{tr.t('people.following')}</Text>
          </Text>
        </View>
        {!isMe && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button
              small
              variant={u.isFollowing ? 'outline' : 'primary'}
              title={u.isFollowing ? tr.t('common.following') : tr.t('common.follow')}
              onPress={async () => {
                try {
                  if (u.isFollowing) await api.users.unfollow(u.id);
                  else await api.users.follow(u.id);
                  setProfile({ isFollowing: !u.isFollowing, followers: u.followers + (u.isFollowing ? -1 : 1) });
                } catch (e) {
                  toastError(e);
                }
              }}
            />
            {u.canMessage && (
              <Button
                small
                variant="soft"
                icon="chatbubble-outline"
                title={tr.t('people.message')}
                onPress={async () => {
                  try {
                    const c = await api.chat.direct(u.id);
                    router.push(`/chat/${c.id}` as never);
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            )}
            <Button
              small
              variant="ghost"
              icon="ban-outline"
              title={tr.t('common.block')}
              onPress={async () => {
                if (!(await confirm(tr.t('people.blockConfirm'), { danger: true }))) return;
                try {
                  await api.users.block(u.id);
                  router.back();
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          </View>
        )}
      </Card>
      {!u.statsHidden && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              ['XP', u.xp],
              [tr.t('common.streak'), `🔥 ${u.streak}`],
              [tr.t('people.quizzes'), u.quizCount],
            ].map(([label, value]) => (
              <Card key={String(label)} style={{ flex: 1, alignItems: 'center', padding: 10 }}>
                <Text weight="black" size={18}>
                  {value}
                </Text>
                <Text muted size={11}>
                  {label}
                </Text>
              </Card>
            ))}
          </View>
          <Text weight="black" size={17}>
            {tr.t('achievements.title')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ACHIEVEMENTS.map((a) => (
              <View
                key={a.id}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: t.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: unlocked.has(a.id) ? 1 : 0.3,
                }}
                accessibilityLabel={a.key}
              >
                <Text size={26}>{a.icon}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {u.accountType === 'teacher' && (
        <Button variant="soft" icon="play-circle-outline" title={tr.t('watch.channel.videos')} onPress={() => router.push(`/channel/${u.id}` as never)} />
      )}
      {!!results.data?.items.length && (
        <>
          <Text weight="black" size={17}>
            {tr.t('people.tabs.results')}
          </Text>
          {results.data.items.slice(0, 6).map((r) => (
            <Card
              key={r.quizId + r.at}
              onPress={() => router.push(`/quiz/${r.quizId}` as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Text weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                {r.title}
              </Text>
              <Text weight="black" color={r.pct >= 60 ? t.ok : t.err}>
                {r.pct}%
              </Text>
            </Card>
          ))}
        </>
      )}
      {!!groups.data?.items.length && (
        <>
          <Text weight="black" size={17}>
            {tr.t('people.tabs.groups')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {groups.data.items.map((g) => (
              <Button key={g.id} small variant="outline" title={`${g.name} · ${g.memberCount}`} onPress={() => router.push(`/group/${g.id}` as never)} />
            ))}
          </View>
        </>
      )}
      <Text weight="black" size={17}>
        {tr.t('people.tabs.posts')}
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: u.displayName }} />
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={items}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPatch={(fn) =>
              qc.setQueryData(
                ['posts', 'author', id],
                (old: typeof posts.data) =>
                  old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((i: PostDto) => (i.id === item.id ? fn(i) : i)) })) },
              )
            }
            onRemoved={() => void posts.refetch()}
          />
        )}
        onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && void posts.fetchNextPage()}
      />
    </>
  );
}
