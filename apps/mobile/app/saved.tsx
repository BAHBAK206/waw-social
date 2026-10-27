import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

const ROUTES: Record<string, string> = { post: '/post/', quiz: '/quiz/', group: '/group/', user: '/user/' };

export default function SavedScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['saved'], queryFn: () => api.saved.list() });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {!q.data.items.length ? <Empty title={tr.t('saved.empty')} icon="bookmark-outline" /> : null}
      {q.data.items.map((i) => (
        <Card
          key={i.id}
          onPress={() => {
            const route = ROUTES[i.itemType];
            if (route && i.refId) router.push(`${route}${i.refId}` as never);
            else if (i.url && /^https?:/.test(i.url)) void Linking.openURL(i.url);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ flex: 1 }}>
            <Text muted size={11}>
              {tr.t(`saved.types.${i.itemType}`)}
            </Text>
            <Text weight="bold" numberOfLines={2}>
              {i.title}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={tr.t('common.delete')}
            hitSlop={10}
            onPress={async () => {
              try {
                await api.saved.remove(i.id);
                await qc.invalidateQueries({ queryKey: ['saved'] });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color={t.text3} />
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}
