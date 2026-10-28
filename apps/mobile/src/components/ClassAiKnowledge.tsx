import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Draft = { id?: string; question: string; answer: string };

/** Teacher: questions and answers that only this class gets from Qubedu AI. */
export function ClassAiKnowledge({ courseId }: { courseId: string }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const key = ['course', courseId, 'knowledge'];
  const list = useQuery({ queryKey: key, queryFn: () => api.school.knowledge(courseId) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const items = list.data?.items ?? [];
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text weight="black" size={16}>
        {tr.t('classAi.title')}
      </Text>
      <Text muted size={13}>
        {tr.t('classAi.hint')}
      </Text>
      {items.length === 0 ? (
        <Text muted size={13}>
          {tr.t('classAi.empty')}
        </Text>
      ) : null}
      {items.map((k) => (
        <Card key={k.id} style={{ gap: 4 }}>
          <Pressable onPress={() => setDraft({ id: k.id, question: k.question, answer: k.answer })} accessibilityRole="button">
            <Text weight="bold">{k.question}</Text>
            <Text muted size={13} numberOfLines={3}>
              {k.answer}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
              try {
                await api.school.removeKnowledge(courseId, k.id);
                await qc.invalidateQueries({ queryKey: key });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Text size={13} color={t.err}>
              {tr.t('common.delete')}
            </Text>
          </Pressable>
        </Card>
      ))}
      <Button variant="outline" icon="add" title={tr.t('classAi.add')} onPress={() => setDraft({ question: '', answer: '' })} />
      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? tr.t('common.edit') : tr.t('classAi.add')}>
        {draft ? (
          <View style={{ gap: 10 }}>
            <Input label={tr.t('classAi.question')} value={draft.question} maxLength={500} onChangeText={(v) => setDraft({ ...draft, question: v })} />
            <Input
              label={tr.t('classAi.answer')}
              value={draft.answer}
              maxLength={4000}
              multiline
              style={{ minHeight: 110, textAlignVertical: 'top' }}
              onChangeText={(v) => setDraft({ ...draft, answer: v })}
            />
            <Button
              title={tr.t('common.save')}
              loading={busy}
              disabled={draft.question.trim().length < 3 || !draft.answer.trim()}
              onPress={async () => {
                setBusy(true);
                try {
                  const body = { question: draft.question.trim(), answer: draft.answer.trim() };
                  if (draft.id) await api.school.updateKnowledge(courseId, draft.id, body);
                  else await api.school.addKnowledge(courseId, body);
                  toast(tr.t('classAi.saved'));
                  setDraft(null);
                  await qc.invalidateQueries({ queryKey: key });
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
