import { Ionicons } from '@expo/vector-icons';
import { xpProgress } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, Empty, GradientHeader, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { greetingKey } from '@/lib/greeting';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function HomeScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.academic.dashboard() });
  const daily = useQuery({ queryKey: ['daily'], queryFn: () => api.daily.get() });
  const progress = xpProgress(me.xp);
  const goal = me.dailyGoalMinutes;
  const done = dash.data?.studyMinutesToday ?? me.todayMinutes;
  const actions: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; href: string }[] = [
    { icon: 'flash-outline', label: tr.t('home.practice'), href: '/learn' },
    { icon: 'videocam-outline', label: tr.t('live.title'), href: '/live' },
    { icon: 'people-outline', label: tr.t('groups.title'), href: '/groups' },
    { icon: 'trophy-outline', label: tr.t('people.leaderboard'), href: '/people' },
    { icon: 'bookmark-outline', label: tr.t('saved.title'), href: '/saved' },
    { icon: 'notifications-outline', label: tr.t('notifications.title'), href: '/notifications' },
  ];
  return (
    <Screen refreshing={dash.isRefetching} onRefresh={() => void Promise.all([dash.refetch(), daily.refetch()])} contentStyle={{ padding: 0 }}>
      <GradientHeader style={{ paddingTop: 24 }}>
        <Text color={t.onPrimary} style={{ opacity: 0.9 }}>
          {tr.t(greetingKey())}
        </Text>
        <Text weight="black" size={26} color={t.onPrimary}>
          {me.displayName}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12 }}>
            <Text color={t.onPrimary} weight="black" size={20}>
              🔥 {me.streak}
            </Text>
            <Text color={t.onPrimary} size={12}>
              {me.streak ? tr.t('home.streakDays', { count: me.streak }) : tr.t('home.streakStart')}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12 }}>
            <Text color={t.onPrimary} weight="black" size={20}>
              ⭐ {tr.t('common.levelN', { level: progress.level })}
            </Text>
            <Text color={t.onPrimary} size={12}>
              {me.xp} XP
            </Text>
          </View>
        </View>
      </GradientHeader>
      <View style={{ padding: 16, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text weight="bold">{tr.t('home.dailyGoal')}</Text>
            <Text muted>{tr.t('home.goalProgress', { done, goal })}</Text>
          </View>
          <View
            style={{ height: 10, borderRadius: 5, backgroundColor: t.bg3, overflow: 'hidden' }}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: goal, now: Math.min(done, goal) }}
          >
            <View style={{ height: 10, width: `${Math.min(100, (done / Math.max(1, goal)) * 100)}%`, backgroundColor: t.primary, borderRadius: 5 }} />
          </View>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {actions.map((a) => (
            <Pressable
              key={a.href}
              onPress={() => router.push(a.href as never)}
              accessibilityRole="button"
              style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, padding: 12, borderRadius: t.radiusCard, backgroundColor: t.primarySoft }}
            >
              <Ionicons name={a.icon} size={26} color={t.primaryInk} />
              <Text weight="bold" size={12} style={{ textAlign: 'center' }}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {daily.data?.challenge && (
          <Card onPress={() => router.push('/learn' as never)}>
            <Text weight="bold" color={t.primaryInk} size={12}>
              {tr.t('daily.title')} · +{daily.data.challenge.xp} XP
            </Text>
            <Text weight="black" size={17}>
              {daily.data.challenge.title}
            </Text>
            <Text muted>{daily.data.challenge.description}</Text>
          </Card>
        )}
        <SectionTitle>{tr.t('home.inbox')}</SectionTitle>
        {dash.isPending ? (
          <Loading />
        ) : !dash.data?.inbox.length ? (
          <Empty title={tr.t('home.inboxEmpty')} icon="checkmark-done-outline" />
        ) : (
          dash.data.inbox.slice(0, 6).map((i) => (
            <Card key={`${i.kind}-${i.title}`}>
              <Text weight="bold">{i.title}</Text>
              <Text muted size={12}>
                {tr.tDyn(`academic.inbox.kinds.${i.kind}`, undefined, i.kind)}
              </Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
