import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { VideoItem } from '../(tabs)/watch';
import { Row, Segmented } from '@/components/kit';
import { Avatar, Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { compactNumber } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

type Tab = 'videos' | 'shorts' | 'playlists' | 'about';

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const ch = useQuery({ queryKey: ['channel', id], queryFn: () => api.channels.get(id!) });
  const [tab, setTab] = useState<Tab>('videos');
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['channel', id, tab],
    queryFn: ({ pageParam }) => api.videos.list({ ownerId: id, kind: tab === 'shorts' ? 'short' : 'video', feed: 'new', cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: tab === 'videos' || tab === 'shorts',
  });
  if (ch.isPending) return <Loading />;
  if (ch.error || !ch.data) return <ErrorView onRetry={() => void ch.refetch()} />;
  const c = ch.data;
  const isSub = subscribed ?? c.isSubscribed;
  const videos = list.data?.pages.flatMap((p) => p.items) ?? [];
  const header = (
    <View style={{ gap: 12, marginBottom: 6 }}>
      <Stack.Screen options={{ title: c.user.displayName }} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={c.user.displayName} url={c.user.avatarUrl} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="black" size={18}>
            {c.user.displayName}
          </Text>
          <Text muted size={12}>
            {tr.t('watch.subscribers', { count: c.subscribers })} · {tr.t('watch.channel.totalViews', { count: compactNumber(c.totalViews, tr) })}
          </Text>
        </View>
        {me && me.id !== c.user.id && (
          <Button
            small
            variant={isSub ? 'outline' : 'primary'}
            title={isSub ? tr.t('watch.subscribed') : tr.t('watch.subscribe')}
            onPress={async () => {
              try {
                if (isSub) await api.users.unfollow(c.user.id);
                else await api.users.follow(c.user.id);
                setSubscribed(!isSub);
              } catch (e) {
                toastError(e);
              }
            }}
          />
        )}
      </Card>
      <Segmented
        tabs={(['videos', 'shorts', 'playlists', 'about'] as const).map((k) => ({ key: k, label: tr.t(`watch.channel.${k}`) }))}
        value={tab}
        onChange={setTab}
      />
    </View>
  );
  if (tab === 'playlists' || tab === 'about')
    return (
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        data={tab === 'playlists' ? c.playlists : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {header}
            {tab === 'about' && (
              <Card style={{ gap: 6 }}>
                <Text>{c.user.bio || '—'}</Text>
                <Text muted size={12}>
                  {tr.t('watch.channel.joined', { date: new Date(c.user.createdAt).toLocaleDateString(tr.intl) })}
                </Text>
              </Card>
            )}
          </>
        }
        renderItem={({ item }) => (
          <Row
            icon="albums-outline"
            title={item.title}
            subtitle={tr.t('watch.playlistVideos', { count: item.itemCount })}
            onPress={() => router.push(`/playlist/${item.id}` as never)}
          />
        )}
        ListEmptyComponent={tab === 'playlists' ? <Empty icon="albums-outline" title={tr.t('watch.noPlaylists')} /> : undefined}
      />
    );
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
      data={videos}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={header}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      renderItem={({ item }) => (
        <VideoItem v={item} onPress={() => router.push(tab === 'shorts' ? (`/shorts?start=${item.id}` as never) : (`/video/${item.id}` as never))} />
      )}
      ListEmptyComponent={list.isPending ? <Loading /> : <Empty icon="play-circle-outline" title={tr.t('watch.empty')} />}
    />
  );
}
