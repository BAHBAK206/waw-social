import type { VideoDto } from '@qubedu/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Avatar, Chip, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { formatClock, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

type Feed = 'home' | 'trending' | 'subscriptions' | 'new';

export function VideoItem({ v, onPress }: { v: VideoDto; onPress: () => void }) {
  const tr = useT();
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={v.title} style={{ gap: 8 }}>
      <View>
        <Image
          source={{ uri: fileUrl(v.thumbnailUrl) }}
          style={{ width: '100%', aspectRatio: v.kind === 'short' ? 1.1 : 16 / 9, borderRadius: 14, backgroundColor: t.bg3 }}
          contentFit="cover"
          accessibilityLabel=""
        />
        <View
          style={{ position: 'absolute', end: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}
        >
          <Text size={11} weight="bold" color="#fff">
            {v.kind === 'short' ? 'Shorts' : formatClock(v.durationSec)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Avatar name={v.owner.displayName} url={v.owner.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <Text weight="bold" numberOfLines={2}>
            {v.title}
          </Text>
          <Text muted size={12}>
            {v.owner.displayName} · {tr.t('watch.views', { count: v.views })} · {relativeTime(v.createdAt, tr)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function WatchScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [feed, setFeed] = useState<Feed>('home');
  const q = useInfiniteQuery({
    queryKey: ['videos', feed],
    queryFn: ({ pageParam }) => api.videos.list({ feed, cursor: pageParam, limit: 12 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 20 }}
      data={items}
      keyExtractor={(v) => v.id}
      refreshing={q.isRefetching && !q.isFetchingNextPage}
      onRefresh={() => void q.refetch()}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['home', 'trending', 'subscriptions', 'new'] as const).map((f) => (
            <Chip key={f} label={tr.tDyn(`watch.feeds.${f}`, undefined, f)} active={feed === f} onPress={() => setFeed(f)} />
          ))}
        </View>
      }
      renderItem={({ item }) => <VideoItem v={item} onPress={() => router.push(`/video/${item.id}` as never)} />}
      ListEmptyComponent={
        q.isPending ? <Loading /> : q.error ? <ErrorView onRetry={() => void q.refetch()} /> : <Empty title={tr.t('watch.empty')} icon="play-circle-outline" />
      }
      ListFooterComponent={q.isFetchingNextPage ? <Loading /> : undefined}
    />
  );
}
