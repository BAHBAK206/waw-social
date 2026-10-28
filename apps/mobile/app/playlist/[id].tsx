import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { VideoItem } from '../(tabs)/watch';
import { Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['playlist', id], queryFn: () => api.playlists.get(id!) });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const { playlist, videos } = q.data;
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
      data={videos}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={
        <Card style={{ gap: 6 }}>
          <Stack.Screen options={{ title: playlist.title }} />
          <Text weight="black" size={20}>
            {playlist.title}
          </Text>
          {playlist.description ? <Text muted>{playlist.description}</Text> : null}
          <Text muted size={12}>
            {playlist.owner.displayName} · {tr.t('watch.playlistVideos', { count: videos.length })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {videos[0] && <Button small icon="play" title={tr.t('watch.playAll')} onPress={() => router.push(`/video/${videos[0]!.id}` as never)} />}
            {playlist.canEdit && (
              <Button
                small
                variant="ghost"
                title={tr.t('watch.deletePlaylist')}
                onPress={async () => {
                  if (!(await confirm(tr.t('watch.deletePlaylistConfirm'), { danger: true }))) return;
                  try {
                    await api.playlists.remove(playlist.id);
                    router.back();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            )}
          </View>
        </Card>
      }
      renderItem={({ item }) => (
        <View>
          <VideoItem v={item} onPress={() => router.push(`/video/${item.id}` as never)} />
          {playlist.canEdit && (
            <Pressable
              style={{ position: 'absolute', top: 8, end: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 5 }}
              accessibilityRole="button"
              accessibilityLabel={tr.t('watch.removeFromPlaylist')}
              onPress={async () => {
                try {
                  await api.playlists.removeItem(playlist.id, item.id);
                  await q.refetch();
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
      ListEmptyComponent={<Empty icon="albums-outline" title={tr.t('watch.playlistEmpty')} />}
    />
  );
}
