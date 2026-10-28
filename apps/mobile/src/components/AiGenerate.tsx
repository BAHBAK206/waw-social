import type { EditorQuestion } from '@qubedu/shared';
import type { Locale } from '@qubedu/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { SelectField, Sheet } from './kit';
import { Button, Chip, Input } from './ui';

/** Teacher tool: drafts questions from pasted text or one of the teacher's lessons. */
export function AiGenerateSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (q: EditorQuestion[]) => void }) {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [source, setSource] = useState<'text' | 'lesson'>('text');
  const [text, setText] = useState('');
  const [videoId, setVideoId] = useState('');
  const [count, setCount] = useState('5');
  const [busy, setBusy] = useState(false);
  const lessons = useQuery({
    queryKey: ['my-lessons', me?.id],
    queryFn: () => api.videos.list({ ownerId: me!.id, limit: 50 }),
    enabled: open && source === 'lesson' && !!me,
  });
  const ready = source === 'text' ? text.trim().length >= 80 : !!videoId;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr.t('quiz.editor.generate')}
      footer={
        <Button
          title={tr.t('quiz.editor.generate')}
          icon="sparkles-outline"
          loading={busy}
          disabled={!ready}
          onPress={async () => {
            setBusy(true);
            try {
              const res = await api.teacher.ai({
                task: 'quiz',
                count: Math.max(1, Math.min(20, Number(count) || 5)),
                language: tr.locale as Locale,
                ...(source === 'text' ? { text } : { videoId }),
              });
              onAdd(res.questions ?? []);
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label={tr.t('quiz.editor.sourceText')} active={source === 'text'} onPress={() => setSource('text')} />
        <Chip label={tr.t('quiz.editor.sourceLesson')} active={source === 'lesson'} onPress={() => setSource('lesson')} />
      </View>
      {source === 'text' ? (
        <Input placeholder={tr.t('quiz.editor.pasteLesson')} value={text} onChangeText={setText} multiline style={{ minHeight: 140 }} maxLength={60000} />
      ) : (
        <SelectField
          label={tr.t('quiz.editor.sourceLesson')}
          value={videoId}
          placeholder="—"
          onChange={(v) => setVideoId(v)}
          options={(lessons.data?.items ?? []).map((v) => ({ value: v.id, label: v.title }))}
        />
      )}
      <Input
        label={tr.t('quiz.editor.questionCount')}
        keyboardType="number-pad"
        value={count}
        onChangeText={(v) => setCount(v.replace(/\D/g, '').slice(0, 2))}
      />
    </Sheet>
  );
}
