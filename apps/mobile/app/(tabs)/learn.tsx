import { Ionicons } from '@expo/vector-icons';
import type { QuizSummaryDto } from '@qubedu/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { FONT, useTheme } from '@/lib/theme';

type Difficulty = '' | 'easy' | 'medium' | 'hard';

export default function LearnScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('');
  const [mine, setMine] = useState(false);
  const teacher = useSession((s) => s.me?.accountType === 'teacher');
  useEffect(() => {
    const id = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);
  const list = useInfiniteQuery({
    queryKey: ['quizzes', q, difficulty, mine],
    queryFn: ({ pageParam }) =>
      api.quizzes.list({ q: q || undefined, difficulty: difficulty || undefined, mine: mine || undefined, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={items}
      keyExtractor={(i) => i.id}
      keyboardShouldPersistTaps="handled"
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => router.push('/quiz/adaptive' as never)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radiusCard, backgroundColor: t.primary }}
          >
            <Ionicons name="sparkles" size={26} color={t.onPrimary} />
            <View style={{ flex: 1 }}>
              <Text weight="black" size={16} color={t.onPrimary}>
                {tr.t('quiz.adaptive')}
              </Text>
              <Text size={12} color={t.onPrimary} style={{ opacity: 0.9 }}>
                {tr.t('quiz.adaptiveDesc')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/lab' as never)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: t.radiusCard,
              backgroundColor: t.cardSolid,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Ionicons name="mic-outline" size={26} color={t.primaryInk} />
            <View style={{ flex: 1 }}>
              <Text weight="black" size={16}>
                {tr.t('lab.title')}
              </Text>
              <Text size={12} muted>
                {tr.t('features.lab')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.text3} style={{ transform: [{ scaleX: tr.dir === 'rtl' ? -1 : 1 }] }} />
          </Pressable>
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={tr.t('quiz.searchPlaceholder')}
            placeholderTextColor={t.text3}
            accessibilityLabel={tr.t('quiz.searchPlaceholder')}
            returnKeyType="search"
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
          {teacher && <Button icon="add" variant="outline" title={tr.t('quiz.create')} onPress={() => router.push('/quiz-editor' as never)} />}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label={tr.t('quiz.mine')} active={mine} onPress={() => setMine((m) => !m)} />
            <Chip label={tr.t('common.all')} active={!difficulty} onPress={() => setDifficulty('')} />
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <Chip key={d} label={tr.t(`quiz.difficulties.${d}`)} active={difficulty === d} onPress={() => setDifficulty(d)} />
            ))}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <QuizRow
          quiz={item}
          onPress={() => router.push(`/quiz/${item.id}` as never)}
          onManage={item.canEdit ? () => router.push(`/quiz-stats/${item.id}` as never) : undefined}
        />
      )}
      ListEmptyComponent={
        list.isPending ? <Loading /> : list.error ? <ErrorView onRetry={() => void list.refetch()} /> : <Empty title={tr.t('quiz.empty')} icon="list-outline" />
      }
      ListFooterComponent={list.isFetchingNextPage ? <Loading /> : undefined}
    />
  );
}

function QuizRow({ quiz, onPress, onManage }: { quiz: QuizSummaryDto; onPress: () => void; onManage?: () => void }) {
  const tr = useT();
  const t = useTheme();
  const color = quiz.difficulty === 'easy' ? t.ok : quiz.difficulty === 'hard' ? t.err : t.warn;
  return (
    <Card onPress={onPress} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text weight="bold" size={12} color={color}>
          {tr.t(`quiz.difficulties.${quiz.difficulty}`)}
        </Text>
        <Text muted size={12}>
          {tr.t(`quiz.kinds.${quiz.kind}`)}
        </Text>
        {quiz.myBest ? (
          <Text weight="bold" size={12} color={t.primaryInk} style={{ marginStart: 'auto' }}>
            {tr.t('quiz.myBest', { pct: quiz.myBest.pct })}
          </Text>
        ) : null}
      </View>
      <Text weight="black" size={17}>
        {quiz.title}
      </Text>
      <Text muted size={13}>
        {tr.t('quiz.questions', { count: quiz.questionCount })} · {tr.t('quiz.duration', { count: Math.round(quiz.durationSec / 60) })}
        {quiz.material ? ` · ${quiz.material.name}` : ''}
      </Text>
      {onManage ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="soft" icon="stats-chart-outline" title={tr.t('quiz.stats')} onPress={onManage} />
          {!quiz.published && (
            <Text muted size={12}>
              {tr.t('common.draft')}
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}
