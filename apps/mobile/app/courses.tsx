import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Avatar, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { GuideHint } from '@/components/Guide';

export default function CoursesScreen() {
  const tr = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['catalog', q], queryFn: () => api.catalog.list({ q: q.trim() || undefined }) });
  return (
    <FeatureGate id="catalog">
      <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        <GuideHint id="catalog" />
        <Text muted>{tr.t('catalog.subtitle')}</Text>
        <Input placeholder={tr.t('catalog.search')} value={q} onChangeText={setQ} accessibilityLabel={tr.t('catalog.search')} />
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorView onRetry={() => void list.refetch()} />
        ) : !list.data.items.length ? (
          <Empty icon="storefront-outline" title={tr.t('catalog.empty')} />
        ) : (
          list.data.items.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/catalog/${c.id}` as never)} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text weight="black" style={{ flex: 1 }}>
                  {c.title}
                </Text>
                <Badge label={c.priceCents ? formatPrice(c.priceCents, c.currency, tr) : tr.t('catalog.free')} tone={c.priceCents ? 'primary' : 'ok'} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Avatar name={c.owner.displayName} url={c.owner.avatarUrl} size={22} />
                <Text muted size={13}>
                  {c.owner.displayName} · {tr.t('catalog.members', { count: c.memberCount })}
                  {c.enrolled ? ` · ${tr.t('catalog.enrolled')}` : ''}
                </Text>
              </View>
            </Card>
          ))
        )}
      </Screen>
    </FeatureGate>
  );
}
