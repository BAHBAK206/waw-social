import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Progress } from '@/components/kit';
import { Avatar, Button, Card, ErrorView, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function QuizStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const quiz = useQuery({ queryKey: ['quiz', id], queryFn: () => api.quizzes.get(id!) });
  const q = useQuery({ queryKey: ['quiz', id, 'stats'], queryFn: () => api.quizzes.stats(id!) });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const s = q.data;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Stack.Screen options={{ title: tr.t('quiz.statsTitle') }} />
      {quiz.data && (
        <Text weight="black" size={20}>
          {quiz.data.title}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Card style={{ flex: 1, gap: 2 }}>
          <Text weight="black" size={24}>
            {s.attempts}
          </Text>
          <Text muted size={12}>
            {tr.t('admin.stats.attempts')}
          </Text>
        </Card>
        <Card style={{ flex: 1, gap: 2 }}>
          <Text weight="black" size={24}>
            {s.averagePct === null ? '—' : `${Math.round(s.averagePct)}%`}
          </Text>
          <Text muted size={12}>
            {tr.t('quiz.averageScore')}
          </Text>
        </Card>
      </View>
      <SectionTitle>{tr.t('quiz.questionAccuracy')}</SectionTitle>
      {s.questions.map((x, i) => {
        const pct = x.total ? Math.round((x.correct / x.total) * 100) : 0;
        return (
          <Card key={x.id} style={{ gap: 6 }}>
            <Text weight="bold">
              {i + 1}. {x.prompt}
            </Text>
            <Progress value={pct} color={pct >= 60 ? t.ok : t.err} />
            <Text muted size={12}>
              {x.correct}/{x.total} · {pct}%
            </Text>
          </Card>
        );
      })}
      {s.leaderboard.length > 0 && <SectionTitle>{tr.t('quiz.topStudents')}</SectionTitle>}
      {s.leaderboard.map((l, i) => (
        <Card key={l.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text weight="black" style={{ width: 24 }}>
            {i + 1}
          </Text>
          <Avatar name={l.user.displayName} url={l.user.avatarUrl} size={32} />
          <Text weight="bold" style={{ flex: 1 }}>
            {l.user.displayName}
          </Text>
          <Text weight="black">{l.pct}%</Text>
        </Card>
      ))}
      <Button variant="outline" icon="create-outline" title={tr.t('quiz.edit')} onPress={() => router.push(`/quiz-editor?id=${id}` as never)} />
    </Screen>
  );
}
