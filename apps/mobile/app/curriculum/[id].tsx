import { Ionicons } from '@expo/vector-icons';
import type { CurriculumNodeDto, CurriculumResourceDto, ObjectiveStatus } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Progress } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

function useStatusColor() {
  const t = useTheme();
  return (s: ObjectiveStatus) => (s === 'mastered' ? t.ok : s === 'weak' ? t.err : s === 'learning' ? t.primaryInk : t.text3);
}

function Resources({ items }: { items: CurriculumResourceDto[] }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((r) => (
        <Pressable
          key={`${r.type}:${r.id}`}
          accessibilityRole="link"
          onPress={() => router.push((r.type === 'video' ? `/video/${r.id}` : r.type === 'quiz' ? `/quiz/${r.id}` : '/library') as never)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 99,
            backgroundColor: t.primarySoft,
          }}
        >
          <Ionicons
            name={r.type === 'video' ? 'play-circle-outline' : r.type === 'quiz' ? 'list-outline' : 'document-outline'}
            size={14}
            color={t.primaryInk}
          />
          <Text size={12} color={t.primaryInk}>
            {tr.t(`curriculum.resourceTypes.${r.type}`)}: {r.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** One subject: the student's plan, then units → lessons → objectives with mastery and practice. */
export default function SubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const color = useStatusColor();
  const student = useSession((s) => s.me?.accountType === 'student');
  const tree = useQuery({ queryKey: ['curriculum-tree', id], queryFn: () => api.curriculum.tree(id!) });
  const plan = useQuery({ queryKey: ['curriculum-plan', id], queryFn: () => api.curriculum.plan(id!), enabled: student });
  const [busy, setBusy] = useState<string | null>(null);
  const start = async (key: string, fn: () => Promise<{ attemptId: string }>) => {
    setBusy(key);
    try {
      const { attemptId } = await fn();
      router.push(`/quiz/attempt?attempt=${attemptId}` as never);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (tree.isPending) return <Loading />;
  if (tree.error || !tree.data) return <ErrorView onRetry={() => void tree.refetch()} />;
  const d = tree.data;
  const children = (pid: string) => d.nodes.filter((n) => n.parentId === pid);
  const count = (nid: string) => d.questionCounts[nid] ?? 0;
  const practice = (n: CurriculumNodeDto) =>
    student && count(n.id) > 0 ? (
      <Button
        small
        variant="soft"
        icon="play"
        title={tr.t('curriculum.practice')}
        loading={busy === n.id}
        onPress={() => void start(n.id, () => api.curriculum.practice(n.id))}
      />
    ) : null;
  return (
    <Screen refreshing={tree.isRefetching} onRefresh={() => void Promise.all([tree.refetch(), plan.refetch()])}>
      <Stack.Screen options={{ title: d.subject.title }} />
      {student && plan.data ? (
        <Card style={{ gap: 10 }}>
          <Text weight="black" size={17}>
            {tr.t('curriculum.plan')}
          </Text>
          {plan.data.progress.total === 0 ? (
            <Text muted>{tr.t('curriculum.noPlan')}</Text>
          ) : (
            <>
              {!plan.data.placementDone ? (
                <Text muted size={13}>
                  {tr.t('curriculum.placementHint')}
                </Text>
              ) : null}
              <Button
                small
                variant={plan.data.placementDone ? 'ghost' : 'primary'}
                icon="compass-outline"
                title={plan.data.placementDone ? tr.t('curriculum.placementAgain') : tr.t('curriculum.placement')}
                loading={busy === 'placement'}
                onPress={() => void start('placement', () => api.curriculum.placement(id!))}
              />
              <Text weight="bold" size={13}>
                {tr.t('curriculum.progress', { mastered: plan.data.progress.mastered, total: plan.data.progress.total })}
              </Text>
              <Progress value={plan.data.progress.mastered} max={plan.data.progress.total} />
              {!plan.data.next.length ? (
                <Text weight="bold" color={t.ok}>
                  {tr.t('curriculum.allDone')}
                </Text>
              ) : (
                <>
                  <Text weight="black">{tr.t('curriculum.next')}</Text>
                  {plan.data.next.map((x) => (
                    <View key={x.objective.id} style={{ gap: 6, borderWidth: 1, borderColor: t.border, borderRadius: t.radiusControl, padding: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text weight="bold" style={{ flex: 1 }}>
                          {x.objective.title}
                        </Text>
                        <Text size={12} weight="bold" color={color(x.status)}>
                          {tr.t(`curriculum.status.${x.status}`)}
                        </Text>
                      </View>
                      {x.lesson ? (
                        <Text muted size={12}>
                          {x.lesson.title}
                        </Text>
                      ) : null}
                      <Resources items={x.resources} />
                      {x.questions > 0 ? (
                        <Button
                          small
                          variant="soft"
                          icon="play"
                          title={tr.t('curriculum.practice')}
                          loading={busy === x.objective.id}
                          onPress={() => void start(x.objective.id, () => api.curriculum.practice(x.objective.id))}
                        />
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </Card>
      ) : null}
      {children(d.subject.id).map((unit) => (
        <Card key={unit.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text weight="black" size={16} style={{ flex: 1 }}>
              {unit.code ? `${unit.code} · ` : ''}
              {unit.title}
            </Text>
            {practice(unit)}
          </View>
          <Resources items={d.resources[unit.id] ?? []} />
          {children(unit.id).map((lesson) => (
            <View key={lesson.id} style={{ gap: 6, backgroundColor: t.bg2, borderRadius: t.radiusControl, padding: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text weight="bold" style={{ flex: 1 }}>
                  {lesson.title}
                </Text>
                {practice(lesson)}
              </View>
              <Resources items={d.resources[lesson.id] ?? []} />
              {children(lesson.id).map((o) => {
                const m = d.mastery[o.id];
                return (
                  <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="flag-outline" size={14} color={t.text3} />
                    <Text size={14} style={{ flex: 1 }}>
                      {o.title}
                      {o.code ? ` (${o.code})` : ''}
                    </Text>
                    {m && student ? (
                      <Text size={12} weight="bold" color={color(m.status)}>
                        {m.mastery === null ? tr.t(`curriculum.status.${m.status}`) : tr.t('curriculum.mastery', { pct: m.mastery })}
                      </Text>
                    ) : (
                      <Text muted size={12}>
                        {tr.t('curriculum.questions', { count: count(o.id) })}
                      </Text>
                    )}
                    {practice(o)}
                  </View>
                );
              })}
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
