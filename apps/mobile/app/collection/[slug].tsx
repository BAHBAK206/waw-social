import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Row } from '@/components/kit';
import { Card, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { openSaved } from '@/lib/saved';

export default function PublicCollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const tr = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ['collection', slug], queryFn: () => api.saved.public(slug!) });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const { collection, owner, items } = q.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: collection.name }} />
      <Card style={{ gap: 4 }}>
        <Text weight="black" size={20}>
          {collection.name}
        </Text>
        {collection.description ? <Text muted>{collection.description}</Text> : null}
        <Text muted size={12}>
          {tr.t('saved.sharedBy', { name: owner.displayName })}
        </Text>
      </Card>
      {items.map((i) => (
        <Row key={i.id} title={i.title} subtitle={tr.t(`saved.types.${i.itemType}`)} onPress={() => openSaved(i, (h) => router.push(h as never))} />
      ))}
    </Screen>
  );
}
