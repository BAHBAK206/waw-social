import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { VideoItem } from '../(tabs)/watch';
import { PostCard } from '@/components/PostCard';
import { Segmented } from '@/components/kit';
import { Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function TagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tag', tag], queryFn: () => api.explore.tag(tag!) });
  const [tab, setTab] = useState<'posts' | 'videos'>('posts');
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: `#${d.tag}` }} />
      <Text weight="black" size={24}>
        #{d.tag}
      </Text>
      <Text muted>
        {tr.t('explore.posts', { count: d.postCount })} · {tr.t('watch.playlistVideos', { count: d.videoCount })}
      </Text>
      <Segmented
        tabs={[
          { key: 'posts', label: tr.t('explore.tagPosts') },
          { key: 'videos', label: tr.t('explore.tagVideos') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'posts' ? (
        d.posts.length ? (
          d.posts.map((p) => (
            <PostCard key={p.id} post={p} onPatch={(fn) => qc.setQueryData(['tag', tag], { ...d, posts: d.posts.map((x) => (x.id === p.id ? fn(x) : x)) })} />
          ))
        ) : (
          <Empty title={tr.t('explore.tagEmpty', { tag: d.tag })} />
        )
      ) : d.videos.length ? (
        d.videos.map((v) => <VideoItem key={v.id} v={v} onPress={() => router.push(`/video/${v.id}` as never)} />)
      ) : (
        <Empty title={tr.t('explore.tagEmpty', { tag: d.tag })} />
      )}
    </ScrollView>
  );
}
