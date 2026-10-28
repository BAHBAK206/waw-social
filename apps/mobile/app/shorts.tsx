import { Ionicons } from '@expo/vector-icons';
import type { VideoDto } from '@qubedu/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions, type ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportContent } from '@/components/Report';
import { ReadAloud } from '@/components/ReadAloud';
import { FeatureGate } from '@/components/kit';
import { Avatar, Empty, Loading, Text } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { compactNumber } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

function ShortPlayer({ v }: { v: VideoDto }) {
  const player = useVideoPlayer({ uri: fileUrl(v.videoUrl)!, headers: { 'x-client': 'mobile', authorization: `Bearer ${api.http.token ?? ''}` } }, (p) => {
    p.loop = true;
    p.play();
  });
  const counted = useRef(false);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!counted.current && currentTime >= Math.min(5, v.durationSec / 2)) {
        counted.current = true;
        void api.videos.view(v.id).catch(() => undefined);
        void api.videos.progress(v.id, Math.floor(currentTime)).catch(() => undefined);
      }
    });
    player.timeUpdateEventInterval = 1;
    return () => sub.remove();
  }, [player, v.id, v.durationSec]);
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />;
}

function Short({ v, active, height }: { v: VideoDto; active: boolean; height: number }) {
  const tr = useT();
  const router = useRouter();
  const [liked, setLiked] = useState(v.myReaction === 1);
  const [likes, setLikes] = useState(v.likes);
  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {active ? <ShortPlayer v={v} /> : null}
      <View style={{ position: 'absolute', bottom: 24, start: 16, end: 80, gap: 6 }}>
        <Pressable
          onPress={() => router.push(`/channel/${v.owner.id}` as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          accessibilityRole="link"
        >
          <Avatar name={v.owner.displayName} url={v.owner.avatarUrl} size={32} />
          <Text weight="bold" color="#fff">
            {v.owner.displayName}
          </Text>
        </Pressable>
        <Text weight="bold" color="#fff" numberOfLines={3}>
          {v.title}
        </Text>
        {v.material ? (
          <Text size={12} color="rgba(255,255,255,0.85)">
            📚 {v.material.name}
          </Text>
        ) : null}
      </View>
      <View style={{ position: 'absolute', bottom: 28, end: 12, alignItems: 'center', gap: 18 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={tr.t('watch.like')}
          onPress={async () => {
            const next = !liked;
            setLiked(next);
            setLikes((n) => n + (next ? 1 : -1));
            try {
              const r = await api.videos.react(v.id, next ? 1 : 0);
              setLikes(r.likes);
            } catch (e) {
              setLiked(!next);
              toastError(e);
            }
          }}
          style={{ alignItems: 'center' }}
        >
          <Ionicons name={liked ? 'bulb' : 'bulb-outline'} size={32} color={liked ? '#fdcb6e' : '#fff'} />
          <Text size={12} weight="bold" color="#fff">
            {compactNumber(likes, tr)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr.t('feed.comments')}
          onPress={() => router.push(`/video/${v.id}` as never)}
          style={{ alignItems: 'center' }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={30} color="#fff" />
          <Text size={12} weight="bold" color="#fff">
            {compactNumber(v.commentCount, tr)}
          </Text>
        </Pressable>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 6 }}>
          <ReadAloud text={`${v.title}. ${v.description}`} size={24} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr.t('common.report')}
          onPress={() => reportContent({ targetType: 'video', targetId: v.id })}
          hitSlop={8}
        >
          <Ionicons name="flag-outline" size={26} color="#fff" />
        </Pressable>
        {v.quiz ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr.t('watch.takeQuiz')}
            onPress={() => router.push(`/quiz/${v.quiz!.id}` as never)}
            style={{ alignItems: 'center' }}
          >
            <Ionicons name="clipboard-outline" size={30} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function ShortsScreen() {
  const tr = useT();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const height = winH - insets.top - 56;
  const first = useQuery({ queryKey: ['video', start], queryFn: () => api.videos.get(start!), enabled: !!start });
  const q = useInfiniteQuery({
    queryKey: ['videos', 'shorts-feed'],
    queryFn: ({ pageParam }) => api.videos.list({ feed: 'home', kind: 'short', cursor: pageParam, limit: 10 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const list = [...(first.data ? [first.data] : []), ...(q.data?.pages.flatMap((p) => p.items) ?? []).filter((v) => v.id !== start)];
  const [active, setActive] = useState(0);
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i === 'number') setActive(i);
  }, []);
  return (
    <FeatureGate id="shorts">
      {q.isPending ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon="flash-outline" title={tr.t('watch.empty')} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(v) => v.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={height}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          renderItem={({ item, index }) => <Short v={item} active={index === active} height={height} />}
        />
      )}
    </FeatureGate>
  );
}
