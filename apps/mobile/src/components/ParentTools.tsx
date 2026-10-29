import { SPEECH_LOCALE } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';
import { Badge } from './kit';
import { Button, Card, Text } from './ui';

/** The week in a few spoken sentences, read by the phone in the parent's language. */
export function VoiceSummary({ studentId }: { studentId: string }) {
  const tr = useT();
  const [speaking, setSpeaking] = useState(false);
  const run = useMutation({
    mutationFn: () => api.parentComms.summary(studentId),
    onSuccess: (d) => {
      setSpeaking(true);
      Speech.speak(d.text, {
        language: SPEECH_LOCALE[d.language],
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    onError: toastError,
  });
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text weight="black" style={{ flex: 1 }}>
        {tr.t('parentComms.voice.title')}
      </Text>
      {speaking ? (
        <Button small variant="soft" icon="stop" title={tr.t('parentComms.voice.stop')} onPress={() => void Speech.stop()} />
      ) : (
        <Button small variant="soft" icon="volume-high-outline" title={tr.t('parentComms.voice.listen')} loading={run.isPending} onPress={() => run.mutate()} />
      )}
    </Card>
  );
}

/** Homework of one child: tap "I saw it" so the teacher knows the family is aware. */
export function HomeworkCheck({ studentId }: { studentId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['parent-homework'], queryFn: () => api.parentComms.homework() });
  const ack = useMutation({
    mutationFn: (assignmentId: string) => api.parentComms.ackHomework(assignmentId, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-homework'] }),
    onError: toastError,
  });
  const items = (q.data?.items ?? []).filter((i) => i.student.id === studentId && i.status !== 'graded');
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('parentComms.homework.title')}</Text>
      {!items.length ? (
        <Text muted size={13}>
          {tr.t('parentComms.homework.none')}
        </Text>
      ) : null}
      {items.map((i) => (
        <View key={i.assignmentId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text weight="bold" numberOfLines={2}>
              {i.title}
            </Text>
            <Text muted size={12}>
              {i.courseTitle}
            </Text>
          </View>
          <Badge label={tr.t(`parentComms.homework.${i.status}`)} tone={i.status === 'missing' ? 'err' : i.status === 'submitted' ? 'ok' : 'neutral'} />
          {i.acked ? (
            <Text size={12} weight="bold">
              ✓ {tr.t('parentComms.homework.seen')}
            </Text>
          ) : (
            <Button
              small
              variant="soft"
              title={tr.t('parentComms.homework.saw')}
              loading={ack.isPending && ack.variables === i.assignmentId}
              onPress={() => ack.mutate(i.assignmentId)}
            />
          )}
        </View>
      ))}
    </Card>
  );
}

export function BehaviorList({ studentId }: { studentId?: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['behavior'], queryFn: () => api.parentComms.behavior() });
  const items = (q.data?.items ?? []).filter((n) => !studentId || n.student.id === studentId);
  if (!items.length) return null;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('parentComms.behavior.mineTitle')}</Text>
      {items.slice(0, 8).map((n) => (
        <View key={n.id} style={{ gap: 2 }}>
          <Text>
            {n.kind === 'positive' ? '🙂 ' : '😐 '}
            {n.text}
          </Text>
          <Text muted size={12}>
            {[n.teacherName, n.courseTitle, relativeTime(n.createdAt, tr)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </Card>
  );
}
