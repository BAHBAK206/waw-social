import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { EventCard } from './events';
import { VideoItem } from './(tabs)/watch';
import { FeatureGate, Row } from '@/components/kit';
import { Chip, Empty, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function ExploreScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['explore'], queryFn: () => api.explore.home() });
  const d = q.data;
  return (
    <FeatureGate id="explore">
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        <Text muted>{tr.t('explore.subtitle')}</Text>
        {q.isPending ? (
          <Loading />
        ) : !d ? null : (
          <>
            <SectionTitle>{tr.t('explore.trendingTags')}</SectionTitle>
            {!d.tags.length ? (
              <Text muted>{tr.t('explore.noTrending')}</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {d.tags.map((x) => (
                  <Chip key={x.tag} label={`#${x.tag} · ${x.count}`} onPress={() => router.push(`/tag/${encodeURIComponent(x.tag)}` as never)} />
                ))}
              </View>
            )}
            {d.videos.length > 0 && <SectionTitle>{tr.t('explore.popularVideos')}</SectionTitle>}
            {d.videos.slice(0, 6).map((v) => (
              <VideoItem key={v.id} v={v} onPress={() => router.push(`/video/${v.id}` as never)} />
            ))}
            {d.posts.length > 0 && <SectionTitle>{tr.t('explore.popularPosts')}</SectionTitle>}
            {d.posts.slice(0, 6).map((p) => (
              <Row
                key={p.id}
                icon="chatbox-ellipses-outline"
                title={p.text.slice(0, 140) || '…'}
                subtitle={p.author.displayName}
                onPress={() => router.push(`/post/${p.id}` as never)}
              />
            ))}
            {d.events.length > 0 && <SectionTitle>{tr.t('explore.events')}</SectionTitle>}
            {d.events.map((e) => (
              <EventCard key={e.id} e={e} onPress={() => router.push(`/event/${e.id}` as never)} />
            ))}
            {d.people.length > 0 && <SectionTitle>{tr.t('explore.people')}</SectionTitle>}
            {d.people.map((u) => (
              <Row
                key={u.id}
                icon="person-outline"
                title={u.displayName}
                subtitle={tr.t(`auth.${u.accountType}`)}
                onPress={() => router.push(`/user/${u.id}` as never)}
              />
            ))}
            {!d.videos.length && !d.posts.length && !d.tags.length && <Empty icon="compass-outline" title={tr.t('explore.noTrending')} />}
          </>
        )}
      </ScrollView>
    </FeatureGate>
  );
}
