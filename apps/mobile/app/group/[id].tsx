import type { PostDto } from '@qubedu/shared';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Composer } from '@/components/Composer';
import { PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, Chip, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Data = InfiniteData<{ items: PostDto[]; nextCursor: string | null }, string | undefined>;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'posts' | 'members'>('posts');
  const g = useQuery({ queryKey: ['group', id], queryFn: () => api.groups.get(id!) });
  const key = ['group', id, 'posts'];
  const posts = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.groups.posts(id!, { cursor: pageParam, limit: 12 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: !!g.data?.myRole || g.data?.privacy === 'public',
  });
  const members = useQuery({
    queryKey: ['group', id, 'members'],
    queryFn: () => api.groups.members(id!, { limit: 50 }),
    enabled: tab === 'members' && (!!g.data?.myRole || g.data?.privacy === 'public'),
  });
  if (g.isPending) return <Loading />;
  if (g.error || !g.data) return <ErrorView onRetry={() => void g.refetch()} />;
  const group = g.data;
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];
  const locked = group.privacy === 'private' && !group.myRole;
  const patch = (pid: string, fn: (p: PostDto) => PostDto) =>
    qc.setQueryData<Data>(key, (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((i) => (i.id === pid ? fn(i) : i)) })) });

  const join = async () => {
    try {
      const r = await api.groups.join(group.id);
      toast(r.status === 'member' ? tr.t('groups.join') : tr.t('groups.requested'));
      await g.refetch();
    } catch (e) {
      toastError(e);
    }
  };

  const header = (
    <View style={{ gap: 12, marginBottom: 6 }}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={group.name} url={group.avatarUrl} size={72} />
        <Text weight="black" size={21} style={{ textAlign: 'center' }}>
          {group.name}
        </Text>
        <Text muted>
          {tr.t('groups.members', { count: group.memberCount })} · {group.privacy === 'private' ? tr.t('common.private') : tr.t('common.public')}
        </Text>
        {group.description ? <Text style={{ textAlign: 'center' }}>{group.description}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {!group.myRole &&
            (group.pendingRequest ? (
              <Button
                small
                variant="outline"
                title={tr.t('groups.cancelRequest')}
                onPress={async () => {
                  await api.groups.cancelRequest(group.id).catch(toastError);
                  await g.refetch();
                }}
              />
            ) : (
              <Button small title={group.privacy === 'private' ? tr.t('groups.requestJoin') : tr.t('groups.join')} onPress={join} />
            ))}
          {group.conversationId && group.myRole ? (
            <Button
              small
              variant="soft"
              icon="chatbubbles-outline"
              title={tr.t('groups.tabs.chat')}
              onPress={() => router.push(`/chat/${group.conversationId}` as never)}
            />
          ) : null}
          {group.myRole && group.myRole !== 'owner' ? (
            <Button
              small
              variant="ghost"
              title={tr.t('groups.leave')}
              onPress={async () => {
                if (!(await confirm(tr.t('groups.leave'), { danger: true }))) return;
                try {
                  await api.groups.leave(group.id);
                  await qc.invalidateQueries({ queryKey: ['groups'] });
                  router.back();
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          ) : null}
        </View>
      </Card>
      {!locked && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label={tr.t('groups.tabs.posts')} active={tab === 'posts'} onPress={() => setTab('posts')} />
          <Chip label={tr.t('groups.tabs.members')} active={tab === 'members'} onPress={() => setTab('members')} />
        </View>
      )}
      {tab === 'posts' && group.myRole ? <Composer groupId={group.id} onPosted={() => void posts.refetch()} /> : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: group.name }} />
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={locked ? [] : tab === 'posts' ? items : []}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => <PostCard post={item} onPatch={(fn) => patch(item.id, fn)} onRemoved={() => void posts.refetch()} />}
        onEndReached={() => tab === 'posts' && posts.hasNextPage && !posts.isFetchingNextPage && void posts.fetchNextPage()}
        ListFooterComponent={
          tab === 'members' && !locked ? (
            <View style={{ gap: 8 }}>
              {members.data?.items.map((m) => (
                <Card
                  key={m.user.id}
                  onPress={() => router.push(`/user/${m.user.id}` as never)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}
                >
                  <Avatar name={m.user.displayName} url={m.user.avatarUrl} />
                  <View style={{ flex: 1 }}>
                    <Text weight="bold">{m.user.displayName}</Text>
                    <Text muted size={12}>
                      {tr.t(`groups.roles.${m.role}`)}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          locked ? (
            <Empty title={tr.t('groups.privateNotice')} icon="lock-closed-outline" />
          ) : tab === 'posts' && !posts.isPending ? (
            <Empty title={tr.t('feed.empty')} icon="newspaper-outline" />
          ) : tab === 'posts' ? (
            <Loading />
          ) : undefined
        }
      />
    </>
  );
}
