import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Progress } from '@/components/kit';
import { Button, Card, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

/** The class's weekly study goal and its challenge against the other classes of its school. */
export function ClassMotivation({ courseId }: { courseId: string }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const goal = useQuery({ queryKey: ['course', courseId, 'goal'], queryFn: () => api.collab.goal(courseId) });
  const challenge = useQuery({ queryKey: ['course', courseId, 'challenge'], queryFn: () => api.collab.challenge(courseId) });
  const [target, setTarget] = useState('');
  const g = goal.data;
  const c = challenge.data;
  if (!g && !c) return null;
  return (
    <View style={{ gap: 10 }}>
      {g ? (
        <Card style={{ gap: 8 }}>
          <Text weight="black">{tr.t('collab.goalTitle')}</Text>
          {g.targetMinutes ? (
            <>
              <Progress value={g.minutes} max={g.targetMinutes} />
              <Text size={13} weight="bold">
                {tr.t('collab.goalProgress', { minutes: g.minutes, target: g.targetMinutes })}
              </Text>
              {g.reached ? (
                <Text weight="black" color={t.ok}>
                  {tr.t('collab.goalReached')}
                </Text>
              ) : null}
            </>
          ) : (
            <Text muted size={13}>
              {tr.t('collab.goalNone')}
            </Text>
          )}
          <Text muted size={12}>
            {tr.t('collab.badges', { count: g.badges })}
          </Text>
          {g.canSet ? (
            <View style={{ gap: 8 }}>
              <Input label={tr.t('collab.goalSet')} value={target} keyboardType="number-pad" onChangeText={setTarget} />
              <Button
                small
                title={tr.t('collab.goalSave')}
                disabled={Number(target) < 30}
                onPress={async () => {
                  try {
                    qc.setQueryData(['course', courseId, 'goal'], await api.collab.setGoal(courseId, Number(target)));
                    setTarget('');
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            </View>
          ) : null}
        </Card>
      ) : null}
      {c && c.schoolId && c.standings.length ? (
        <Card style={{ gap: 6 }}>
          <Text weight="black">{tr.t('collab.challengeTitle')}</Text>
          <Text muted size={12}>
            {tr.t('collab.challengeHint')}
          </Text>
          {c.standings.map((s) => (
            <View key={s.courseId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text weight="black" style={{ width: 22 }}>
                {s.rank}
              </Text>
              <Text weight={s.mine ? 'black' : 'bold'} style={{ flex: 1 }} numberOfLines={1} color={s.mine ? t.primary : undefined}>
                {s.title}
              </Text>
              <Text weight="black" size={13}>
                {tr.t('collab.average', { count: s.average })}
              </Text>
            </View>
          ))}
          {c.lastWeekWinner ? (
            <Text muted size={12}>
              {tr.t('collab.lastWinner', { title: c.lastWeekWinner.title })}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}
