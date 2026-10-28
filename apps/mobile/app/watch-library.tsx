import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoItem } from './(tabs)/watch';
import { Row, Segmented, Sheet } from '@/components/kit';
import { Button, Empty, Input, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

type Tab = 'history' | 'later' | 'liked' | 'playlists';

export default function WatchLibraryScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('history');
  const history = useInfiniteQuery({
    queryKey: ['watch-history'],
    queryFn: ({ pageParam }) => api.videos.history({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: tab === 'history',
  });
  const later = useInfiniteQuery({
    queryKey: ['watch-later'],
    queryFn: ({ pageParam }) => api.videos.watchLaterList({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: tab === 'later',
  });
  const liked = useInfiniteQuery({
    queryKey: ['videos', 'liked'],
    queryFn: ({ pageParam }) => api.videos.list({ feed: 'liked', cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: tab === 'liked',
  });
  const playlists = useQuery({ queryKey: ['playlists', 'mine'], queryFn: () => api.playlists.mine(), enabled: tab === 'playlists' });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const active = tab === 'history' ? history : tab === 'later' ? later : liked;
  const videos =
    tab === 'history'
      ? (history.data?.pages.flatMap((p) => p.items.map((i) => i.video)) ?? [])
      : tab === 'later'
        ? (later.data?.pages.flatMap((p) => p.items) ?? [])
        : (liked.data?.pages.flatMap((p) => p.items) ?? []);

  const header = (
    <View style={{ gap: 10, marginBottom: 6 }}>
      <Segmented
        tabs={[
          { key: 'history', label: tr.t('watch.history') },
          { key: 'later', label: tr.t('watch.watchLaterTitle') },
          { key: 'liked', label: tr.t('watch.likedTitle') },
          { key: 'playlists', label: tr.t('watch.playlists') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'history' && !!videos.length && (
        <Button
          small
          variant="ghost"
          icon="trash-outline"
          title={tr.t('watch.clearHistory')}
          onPress={async () => {
            if (!(await confirm(tr.t('watch.clearHistoryConfirm'), { danger: true }))) return;
            try {
              await api.videos.clearHistory();
              await qc.invalidateQueries({ queryKey: ['watch-history'] });
            } catch (e) {
              toastError(e);
            }
          }}
        />
      )}
      {tab === 'playlists' && <Button icon="add" title={tr.t('watch.newPlaylist')} onPress={() => setCreating(true)} />}
    </View>
  );

  if (tab === 'playlists')
    return (
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        data={playlists.data?.items ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {header}
            <Sheet
              open={creating}
              onClose={() => setCreating(false)}
              title={tr.t('watch.newPlaylist')}
              footer={
                <Button
                  title={tr.t('common.create')}
                  disabled={!title.trim()}
                  onPress={async () => {
                    try {
                      const p = await api.playlists.create({ title: title.trim() });
                      setCreating(false);
                      setTitle('');
                      await playlists.refetch();
                      router.push(`/playlist/${p.id}` as never);
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                />
              }
            >
              <Input label={tr.t('watch.playlistName')} value={title} onChangeText={setTitle} />
            </Sheet>
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
        ListEmptyComponent={playlists.isPending ? <Loading /> : <Empty icon="albums-outline" title={tr.t('watch.noPlaylists')} />}
      />
    );

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
      data={videos}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={header}
      onEndReached={() => active.hasNextPage && !active.isFetchingNextPage && void active.fetchNextPage()}
      renderItem={({ item }) => (
        <View>
          <VideoItem v={item} onPress={() => router.push(`/video/${item.id}` as never)} />
          {tab === 'history' && (
            <Pressable
              style={{ position: 'absolute', top: 8, end: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 5 }}
              accessibilityRole="button"
              accessibilityLabel={tr.t('watch.removeFromHistory')}
              onPress={async () => {
                try {
                  await api.videos.removeFromHistory(item.id);
                  await qc.invalidateQueries({ queryKey: ['watch-history'] });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
      ListEmptyComponent={
        active.isPending ? (
          <Loading />
        ) : (
          <Empty
            icon="time-outline"
            title={tab === 'history' ? tr.t('watch.historyEmpty') : tab === 'later' ? tr.t('watch.watchLaterEmpty') : tr.t('watch.empty')}
          />
        )
      }
      ListFooterComponent={active.isFetchingNextPage ? <Loading /> : undefined}
    />
  );
}
