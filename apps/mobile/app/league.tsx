import { Ionicons } from '@expo/vector-icons';
import type { LeagueDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Badge, FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Avatar, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export const TIER_COLORS = ['#cd7f32', '#a8b2bd', '#e5b80b', '#2f6fde', '#d6336c', '#2fb380', '#7ad7f0'];
const daysLeft = (l: LeagueDto) => Math.max(0, Math.floor((l.endsAt - Date.now()) / 86_400_000));

export function LeagueCard() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['league'], queryFn: () => api.leagues.me(), staleTime: 60_000 });
  if (!q.data) return null;
  const l = q.data;
  const me = l.members.find((m) => m.me);
  return (
    <Card onPress={() => router.push('/league' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name="medal" size={30} color={TIER_COLORS[l.tierIndex]} />
      <View style={{ flex: 1 }}>
        <Text weight="black">{tr.t(`league.tiers.${l.tier}`)}</Text>
        <Text muted size={13}>
          {me ? tr.t('league.rank', { rank: me.rank, tier: tr.t(`league.tiers.${l.tier}`) }) : tr.t('league.notJoined')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.text3} />
    </Card>
  );
}

export default function LeagueScreen() {
  const tr = useT();
  const t = useTheme();
  const q = useQuery({ queryKey: ['league'], queryFn: () => api.leagues.me(), refetchInterval: 60_000 });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const l = q.data;
  return (
    <FeatureGate id="league">
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="medal" size={48} color={TIER_COLORS[l.tierIndex]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="black" size={22}>
              {tr.t(`league.tiers.${l.tier}`)}
            </Text>
            <Text muted size={13}>
              {tr.t('league.endsIn', { count: daysLeft(l) })}
            </Text>
            {l.lastResult ? (
              <Text weight="bold" size={13}>
                {tr.t(l.lastResult === 'up' ? 'league.lastUp' : l.lastResult === 'down' ? 'league.lastDown' : 'league.lastStay')}
              </Text>
            ) : null}
          </View>
        </Card>
        <Text muted size={13}>
          {tr.t('league.subtitle')}
        </Text>
        {!l.joined ? (
          <Empty icon="medal-outline" title={tr.t('league.notJoined')} />
        ) : (
          l.members.map((m, i) => {
            const up = i < l.promote && m.xp > 0;
            const down = l.demote > 0 && i >= l.members.length - l.demote;
            return (
              <View
                key={m.user.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: m.me ? t.primarySoft : t.card,
                  borderStartWidth: up || down ? 4 : 0,
                  borderStartColor: up ? t.ok : t.err,
                }}
              >
                <Text weight="black" style={{ width: 24, textAlign: 'center' }}>
                  {m.rank}
                </Text>
                <Avatar name={m.user.displayName} url={m.user.avatarUrl} size={32} />
                <Text weight={m.me ? 'bold' : undefined} style={{ flex: 1 }} numberOfLines={1}>
                  {m.me ? `${m.user.displayName} (${tr.t('league.you')})` : m.user.displayName}
                </Text>
                {up ? <Badge label="↑" tone="ok" /> : down ? <Badge label="↓" tone="err" /> : null}
                <Text weight="bold">{tr.t('league.xp', { xp: m.xp })}</Text>
              </View>
            );
          })
        )}
      </Screen>
    </FeatureGate>
  );
}
