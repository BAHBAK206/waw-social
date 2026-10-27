import type { LeaderboardEntry, UserSummary } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Avatar, Card, Chip, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { FONT, useTheme } from '@/lib/theme';

export default function PeopleScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'leaderboard' | 'discover'>('leaderboard');
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);
  const board = useQuery({ queryKey: ['leaderboard', period], queryFn: () => api.users.leaderboard({ period, limit: 50 }), enabled: tab === 'leaderboard' });
  const users = useQuery({ queryKey: ['users', q], queryFn: () => api.users.list({ q, limit: 30 }), enabled: tab === 'discover' });
  const open = (u: UserSummary) => router.push(`/user/${u.id}` as never);
  const data: { user: UserSummary; rank?: number; score?: number }[] =
    tab === 'leaderboard'
      ? (board.data?.items ?? []).map((e: LeaderboardEntry) => ({ user: e.user, rank: e.rank, score: e.score }))
      : (users.data?.items ?? []).map((user) => ({ user }));
  const active = tab === 'leaderboard' ? board : users;
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={data}
      keyExtractor={(e) => e.user.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={tr.t('people.leaderboard')} active={tab === 'leaderboard'} onPress={() => setTab('leaderboard')} />
            <Chip label={tr.t('people.discover')} active={tab === 'discover'} onPress={() => setTab('discover')} />
          </View>
          {tab === 'leaderboard' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['week', 'month', 'all'] as const).map((p) => (
                <Chip key={p} label={tr.t(`people.periods.${p}`)} active={period === p} onPress={() => setPeriod(p)} />
              ))}
            </View>
          ) : (
            <TextInput
              value={term}
              onChangeText={setTerm}
              placeholder={tr.t('people.searchPlaceholder')}
              placeholderTextColor={t.text3}
              accessibilityLabel={tr.t('people.searchPlaceholder')}
              style={{
                minHeight: 46,
                borderRadius: t.radiusControl,
                borderWidth: 1.5,
                borderColor: t.border,
                backgroundColor: t.bg2,
                paddingHorizontal: 14,
                color: t.text,
                fontFamily: FONT.regular,
                textAlign: 'auto',
              }}
            />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => open(item.user)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
          {item.rank ? (
            <Text weight="black" size={16} style={{ width: 28, textAlign: 'center' }}>
              {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : item.rank}
            </Text>
          ) : null}
          <Avatar name={item.user.displayName} url={item.user.avatarUrl} />
          <View style={{ flex: 1 }}>
            <Text weight="bold" numberOfLines={1}>
              {item.user.displayName}
            </Text>
            <Text muted size={12}>
              {item.user.username ? `@${item.user.username}` : tr.t('common.levelN', { level: item.user.level })}
            </Text>
          </View>
          {item.score !== undefined ? (
            <Text weight="black" color={t.primaryInk}>
              {item.score} XP
            </Text>
          ) : null}
        </Card>
      )}
      ListEmptyComponent={
        active.isPending ? (
          <Loading />
        ) : active.error ? (
          <ErrorView onRetry={() => void active.refetch()} />
        ) : (
          <Empty title={tr.t('people.empty')} icon="people-outline" />
        )
      }
    />
  );
}
