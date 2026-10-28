import { Ionicons } from '@expo/vector-icons';
import { xpProgress, type DailyChallengeDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AtRiskList } from '@/components/Family';
import { LeagueCard } from '../league';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, GradientHeader, Loading, SectionTitle, Text } from '@/components/ui';
import { toast, toastError } from '@/lib/ui';
import { api } from '@/lib/api';
import { appPath } from '@/lib/links';
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
    { icon: 'school-outline', label: tr.t('nav.academic'), href: '/study' },
    { icon: 'layers-outline', label: tr.t('home.reviewCards'), href: '/study?tab=cards' },
    { icon: 'timer-outline', label: tr.t('home.startFocus'), href: '/study?tab=focus' },
    { icon: 'flash-outline', label: tr.t('home.practice'), href: '/quiz/adaptive' },
    { icon: 'sparkles-outline', label: tr.t('home.askTutor'), href: '/tutor' },
    { icon: 'mic-outline', label: tr.t('nav.lab'), href: '/lab' },
    { icon: 'easel-outline', label: tr.t('nav.school'), href: '/school' },
    { icon: 'videocam-outline', label: tr.t('live.title'), href: '/live' },
    { icon: 'trophy-outline', label: tr.t('people.leaderboard'), href: '/people' },
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
        {me.accountType === 'student' && <LeagueCard />}
        {me.accountType === 'teacher' && <AtRiskList limit={3} />}
        {me.accountType === 'parent' && (
          <Card onPress={() => router.push('/family' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="people-circle-outline" size={28} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text weight="black">{tr.t('family.title')}</Text>
              <Text muted size={13}>
                {tr.t('family.subtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.text3} />
          </Card>
        )}
        {daily.data?.challenge && <DailyCard c={daily.data.challenge} onDone={() => void Promise.all([daily.refetch(), dash.refetch()])} />}
        <SectionTitle>{tr.t('home.inbox')}</SectionTitle>
        {dash.isPending ? (
          <Loading />
        ) : !dash.data?.inbox.length ? (
          <Empty title={tr.t('home.inboxEmpty')} icon="checkmark-done-outline" />
        ) : (
          dash.data.inbox.slice(0, 6).map((i) => {
            const href = appPath(i.link);
            return (
              <Card key={`${i.kind}-${i.refId ?? i.title}`} onPress={href ? () => router.push(href as never) : undefined}>
                <Text weight="bold">
                  {i.title}
                  {i.count ? ` (${i.count})` : ''}
                </Text>
                <Text muted size={12}>
                  {tr.tDyn(`academic.inboxKinds.${i.kind}`, undefined, i.kind)}
                </Text>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function DailyCard({ c, onDone }: { c: DailyChallengeDto; onDone: () => void }) {
  const tr = useT();
  const t = useTheme();
  const patchMe = useSession((s) => s.patchMe);
  const [busy, setBusy] = useState(false);
  const answer = async (i?: number) => {
    setBusy(true);
    try {
      const r = await api.daily.answer(i);
      const res = r.challenge.result;
      if (res)
        toast(
          res.correct ? tr.t('daily.correct', { xp: res.xpEarned }) : tr.t('daily.wrong', { answer: c.options[res.answer ?? 0] ?? '' }),
          res.correct ? 'ok' : 'err',
        );
      void api.me
        .get()
        .then(patchMe)
        .catch(() => undefined);
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="bold" color={t.primaryInk} size={12}>
        {tr.t('daily.title')} · {tr.t('daily.reward', { xp: c.xp })}
      </Text>
      <Text weight="black" size={17}>
        {c.title}
      </Text>
      {c.description ? <Text muted>{c.description}</Text> : null}
      {c.question ? <Text weight="bold">{c.question}</Text> : null}
      {c.claimed || c.result ? (
        <Text weight="bold" color={c.result?.correct === false ? t.err : t.ok}>
          ✓ {tr.t('daily.done')}
          {c.result && c.result.answer !== null && !c.result.correct ? ` · ${c.options[c.result.answer] ?? ''}` : ''}
        </Text>
      ) : c.type === 'quiz' && c.options.length ? (
        c.options.map((o, i) => <Button key={i} variant="outline" title={o} disabled={busy} onPress={() => void answer(i)} />)
      ) : (
        <Button title={tr.t('daily.complete')} loading={busy} onPress={() => void answer()} />
      )}
    </Card>
  );
}
