import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Share, View } from 'react-native';
import { Badge, FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { WEB_URL } from '@/lib/web';

export default function CertificatesScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['certificates', 'mine'], queryFn: () => api.certificates.mine() });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  return (
    <FeatureGate id="certificates">
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        {!q.data.items.length && <Empty icon="ribbon-outline" title={tr.t('certificates.none')} />}
        {q.data.items.map((c) => (
          <Card key={c.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="ribbon" size={24} color={t.warn} />
              <Text weight="black" style={{ flex: 1 }}>
                {c.title}
              </Text>
              {c.revoked ? <Badge label={tr.t('certificates.revoked')} tone="err" /> : null}
            </View>
            <Text muted size={13}>
              {c.issuerName} · {relativeTime(c.issuedAt, tr)}
              {c.grade !== null ? ` · ${c.grade}%` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                small
                variant="soft"
                icon="open-outline"
                title={tr.t('certificates.print')}
                onPress={() => router.push(`/web?path=${encodeURIComponent(`/certificate/${c.code}`)}&title=${encodeURIComponent(c.title)}` as never)}
              />
              <Button
                small
                variant="outline"
                icon="share-social-outline"
                title={tr.t('certificates.share')}
                onPress={() => void Share.share({ message: `${c.title}\n${WEB_URL}/certificate/${c.code}` })}
              />
            </View>
          </Card>
        ))}
      </Screen>
    </FeatureGate>
  );
}
