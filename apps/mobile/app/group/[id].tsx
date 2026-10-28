import type { PostDto } from '@qubedu/shared';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { ReportButton } from '@/components/Report';
import { Composer } from '@/components/Composer';
import { PostCard } from '@/components/PostCard';
import { Files } from '@/components/Files';
import { pickDocument, Row, Segmented, Sheet } from '@/components/kit';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
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
  const [tab, setTab] = useState<'posts' | 'members' | 'resources' | 'leaderboard' | 'channels' | 'requests'>('posts');
  const [addingRes, setAddingRes] = useState(false);
  const [res, setRes] = useState({ title: '', url: '' });
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
  const canSee = !!g.data?.myRole || g.data?.privacy === 'public';
  const mod = g.data?.myRole === 'owner' || g.data?.myRole === 'admin';
  const resources = useQuery({
    queryKey: ['group', id, 'resources'],
    queryFn: () => api.groups.resources(id!, { limit: 50 }),
    enabled: tab === 'resources' && canSee,
  });
  const board = useQuery({ queryKey: ['group', id, 'leaderboard'], queryFn: () => api.groups.leaderboard(id!), enabled: tab === 'leaderboard' && canSee });
  const channels = useQuery({ queryKey: ['group', id, 'channels'], queryFn: () => api.groups.channels(id!), enabled: tab === 'channels' && !!g.data?.myRole });
  const requests = useQuery({ queryKey: ['group', id, 'requests'], queryFn: () => api.groups.requests(id!), enabled: tab === 'requests' && mod });
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
        <Segmented
          tabs={[
            { key: 'posts' as const, label: tr.t('groups.tabs.posts') },
            { key: 'members' as const, label: tr.t('groups.tabs.members') },
            { key: 'resources' as const, label: tr.t('groups.tabs.resources') },
            { key: 'leaderboard' as const, label: tr.t('groups.tabs.leaderboard') },
            ...(group.kind === 'community' && group.myRole ? [{ key: 'channels' as const, label: tr.t('groups.tabs.channels') }] : []),
            ...(mod && group.privacy === 'private' ? [{ key: 'requests' as const, label: tr.t('groups.requests') }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {tab === 'posts' && group.myRole ? <Composer groupId={group.id} onPosted={() => void posts.refetch()} /> : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: group.name,
          headerRight: () => (group.myRole !== 'owner' ? <ReportButton targetType="group" targetId={group.id} size={20} /> : null),
        }}
      />
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
          locked ? undefined : tab === 'resources' ? (
            <View style={{ gap: 8 }}>
              {group.myRole && <Button small icon="add" variant="outline" title={tr.t('groups.resource.add')} onPress={() => setAddingRes(true)} />}
              {resources.isPending ? (
                <Loading />
              ) : !resources.data?.items.length ? (
                <Empty icon="folder-open-outline" title={tr.t('groups.resource.empty')} />
              ) : null}
              {resources.data?.items.map((r) => (
                <Card key={r.id} style={{ gap: 6 }}>
                  <Text weight="bold">{r.title}</Text>
                  <Text muted size={12}>
                    {r.uploader.displayName}
                  </Text>
                  <Files
                    files={[
                      {
                        url: r.url,
                        name: r.title,
                        mime: r.mime ?? 'application/octet-stream',
                        size: r.size ?? 0,
                        kind: r.mime?.startsWith('audio/') ? 'audio' : r.mime?.startsWith('image/') ? 'image' : 'file',
                      },
                    ]}
                  />
                </Card>
              ))}
              <Sheet
                open={addingRes}
                onClose={() => setAddingRes(false)}
                title={tr.t('groups.resource.add')}
                footer={
                  <Button
                    title={tr.t('common.save')}
                    disabled={!res.title.trim() || !/^https?:\/\//.test(res.url.trim())}
                    onPress={async () => {
                      try {
                        await api.groups.addResource(group.id, { title: res.title.trim(), url: res.url.trim(), kind: 'link' });
                        setAddingRes(false);
                        setRes({ title: '', url: '' });
                        await resources.refetch();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  />
                }
              >
                <Button
                  variant="outline"
                  icon="document-attach-outline"
                  title={tr.t('groups.resource.file')}
                  onPress={async () => {
                    try {
                      const f = await pickDocument();
                      if (!f) return;
                      const up = await uploadFile(f, 'group');
                      await api.groups.addResource(group.id, { title: res.title.trim() || f.name, url: up.url, kind: 'file', mime: up.mime, size: up.size });
                      setAddingRes(false);
                      await resources.refetch();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                />
                <Input label={tr.t('common.title')} value={res.title} onChangeText={(v) => setRes({ ...res, title: v })} />
                <Input
                  label={tr.t('groups.resource.link')}
                  value={res.url}
                  onChangeText={(v) => setRes({ ...res, url: v })}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://"
                />
              </Sheet>
            </View>
          ) : tab === 'leaderboard' ? (
            <View style={{ gap: 8 }}>
              {board.isPending ? <Loading /> : null}
              {board.data?.items.map((e) => (
                <Card
                  key={e.user.id}
                  onPress={() => router.push(`/user/${e.user.id}` as never)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Text weight="black" style={{ width: 26 }}>
                    {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
                  </Text>
                  <Avatar name={e.user.displayName} url={e.user.avatarUrl} size={34} />
                  <Text weight="bold" style={{ flex: 1 }}>
                    {e.user.displayName}
                  </Text>
                  <Text weight="black">{e.score}</Text>
                </Card>
              ))}
            </View>
          ) : tab === 'channels' ? (
            <View style={{ gap: 8 }}>
              {channels.data?.items.map((c) => (
                <Row
                  key={c.id}
                  icon={c.kind === 'announcement' ? 'megaphone-outline' : 'chatbubbles-outline'}
                  title={`# ${c.name}`}
                  subtitle={c.kind === 'announcement' ? tr.t('groups.channel.announcement') : tr.t('groups.channel.text')}
                  onPress={() => router.push(`/chat/${c.conversationId}` as never)}
                />
              ))}
            </View>
          ) : tab === 'requests' ? (
            <View style={{ gap: 8 }}>
              {!requests.data?.items.length && !requests.isPending ? <Empty icon="person-add-outline" title={tr.t('groups.noRequests')} /> : null}
              {requests.data?.items.map((r) => (
                <Card key={r.user.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={r.user.displayName} url={r.user.avatarUrl} size={34} />
                    <Text weight="bold" style={{ flex: 1 }}>
                      {r.user.displayName}
                    </Text>
                  </View>
                  {r.message ? <Text muted>{r.message}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['approve', 'reject'] as const).map((d) => (
                      <Button
                        key={d}
                        small
                        variant={d === 'approve' ? 'primary' : 'outline'}
                        title={tr.t(`groups.${d}`)}
                        onPress={async () => {
                          try {
                            await api.groups.decide(group.id, r.user.id, d);
                            await Promise.all([requests.refetch(), g.refetch()]);
                          } catch (e) {
                            toastError(e);
                          }
                        }}
                      />
                    ))}
                  </View>
                </Card>
              ))}
            </View>
          ) : tab === 'members' ? (
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
