import { Ionicons } from '@expo/vector-icons';
import {
  blankQuestion,
  blankQuiz,
  LIMITS,
  quizBody,
  retypeQuestion,
  validQuizQuestions,
  type EditorQuestion,
  type QuestionType,
  type QuizDraft,
} from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SubjectPicker } from '@/components/SubjectPicker';
import { FeatureGate, SelectField, SwitchRow } from '@/components/kit';
import { Button, Card, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

const TYPES: QuestionType[] = ['mc', 'tf', 'multi', 'short'];

function QuestionEditor({
  q,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  q: EditorQuestion;
  index: number;
  total: number;
  onChange: (q: EditorQuestion) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const tr = useT();
  const t = useTheme();
  const set = (patch: Partial<EditorQuestion>) => onChange({ ...q, ...patch });
  const multi = q.type === 'multi';
  const isCorrect = (i: number) => (multi ? Array.isArray(q.answer) && (q.answer as number[]).includes(i) : q.answer === i);
  const toggleCorrect = (i: number) => {
    if (!multi) return set({ answer: i });
    const cur = Array.isArray(q.answer) ? (q.answer as number[]) : [];
    set({ answer: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort() });
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text weight="black" style={{ flex: 1 }}>
          {tr.t('quiz.editor.question', { n: index + 1 })}
        </Text>
        <Pressable hitSlop={8} disabled={index === 0} onPress={() => onMove(-1)} accessibilityRole="button" accessibilityLabel={tr.t('common.previous')}>
          <Ionicons name="arrow-up" size={20} color={index === 0 ? t.text3 : t.text2} />
        </Pressable>
        <Pressable hitSlop={8} disabled={index === total - 1} onPress={() => onMove(1)} accessibilityRole="button" accessibilityLabel={tr.t('common.next')}>
          <Ionicons name="arrow-down" size={20} color={index === total - 1 ? t.text3 : t.text2} />
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove} accessibilityRole="button" accessibilityLabel={tr.t('quiz.editor.removeQuestion')}>
          <Ionicons name="trash-outline" size={20} color={t.err} />
        </Pressable>
      </View>
      <Input label={tr.t('quiz.editor.prompt')} value={q.prompt} onChangeText={(v) => set({ prompt: v })} multiline maxLength={LIMITS.questionText} />
      <SelectField
        label={tr.t('quiz.editor.type')}
        value={q.type}
        onChange={(v) => v && onChange(retypeQuestion(q, v, tr.t('quiz.editor.true'), tr.t('quiz.editor.false')))}
        options={TYPES.map((x) => ({ value: x, label: tr.t(`quiz.editor.types.${x}`) }))}
      />
      {q.type === 'short' ? (
        <Input
          label={tr.t('quiz.editor.acceptedAnswers')}
          multiline
          value={(q.answer as string[]).join('\n')}
          onChangeText={(v) => set({ answer: v.split('\n') })}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <Text weight="bold" size={13} muted>
            {tr.t('quiz.editor.correct')}
          </Text>
          {q.options.map((opt, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => toggleCorrect(i)}
                hitSlop={6}
                accessibilityRole={multi ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: isCorrect(i) }}
                accessibilityLabel={tr.t('quiz.editor.correct')}
              >
                <Ionicons
                  name={multi ? (isCorrect(i) ? 'checkbox' : 'square-outline') : isCorrect(i) ? 'radio-button-on' : 'radio-button-off'}
                  size={24}
                  color={isCorrect(i) ? t.ok : t.text3}
                />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Input
                  value={opt}
                  placeholder={tr.t('quiz.editor.option', { n: i + 1 })}
                  maxLength={LIMITS.optionText}
                  onChangeText={(v) => set({ options: q.options.map((o, k) => (k === i ? v : o)) })}
                />
              </View>
              {q.type !== 'tf' && q.options.length > 2 && (
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={tr.t('common.remove')}
                  onPress={() => {
                    const options = q.options.filter((_, k) => k !== i);
                    const answer = multi
                      ? (q.answer as number[]).filter((a) => a !== i).map((a) => (a > i ? a - 1 : a))
                      : typeof q.answer === 'number'
                        ? q.answer === i
                          ? 0
                          : q.answer > i
                            ? q.answer - 1
                            : q.answer
                        : 0;
                    set({ options, answer: multi && !(answer as number[]).length ? [0] : answer });
                  }}
                >
                  <Ionicons name="close" size={20} color={t.text3} />
                </Pressable>
              )}
            </View>
          ))}
          {q.type !== 'tf' && q.options.length < LIMITS.optionsPerQuestion && (
            <Button small variant="ghost" icon="add" title={tr.t('quiz.editor.addOption')} onPress={() => set({ options: [...q.options, ''] })} />
          )}
        </View>
      )}
      <Input label={tr.t('quiz.editor.explanation')} value={q.explanation ?? ''} onChangeText={(v) => set({ explanation: v || null })} multiline />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 2 }}>
          <Input label={tr.t('quiz.editor.topic')} value={q.topic ?? ''} onChangeText={(v) => set({ topic: v || null })} maxLength={120} />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={tr.t('quiz.editor.pointsLabel')}
            keyboardType="number-pad"
            value={String(q.points)}
            onChangeText={(v) => set({ points: Math.max(1, Math.min(100, Number(v.replace(/\D/g, '')) || 1)) })}
          />
        </View>
      </View>
    </Card>
  );
}

export default function QuizEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const existing = useQuery({ queryKey: ['quiz-editor', id], queryFn: () => api.quizzes.editor(id!), enabled: !!id, staleTime: 0 });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.school.courses() });
  const [form, setForm] = useState<QuizDraft>(blankQuiz);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (existing.data) {
      const { id: _id, ...rest } = existing.data;
      void _id;
      setForm(rest);
    }
  }, [existing.data]);
  if (id && existing.isPending) return <Loading />;
  const valid = form.title.trim().length >= 2 && validQuizQuestions(form.questions);
  const setQ = (i: number, q: EditorQuestion) => setForm((f) => ({ ...f, questions: f.questions.map((x, k) => (k === i ? q : x)) }));
  const save = async () => {
    setBusy(true);
    try {
      const body = quizBody(form);
      if (id) await api.quizzes.update(id, body);
      else await api.quizzes.create(body);
      toast(tr.t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['quizzes'] });
      router.back();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FeatureGate id="quiz">
      <Stack.Screen options={{ title: id ? tr.t('quiz.edit') : tr.t('quiz.create') }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Input label={tr.t('quiz.editor.titleLabel')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} maxLength={160} />
        <Input label={tr.t('quiz.editor.descriptionLabel')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        <SubjectPicker
          label={tr.t('quiz.material')}
          value={form.materialId ?? ''}
          placeholder={tr.t('feed.noSubject')}
          onChange={(m) => {
            const section = taxonomy.data?.sections.find((s) => s.materials.some((x) => x.id === m));
            setForm({ ...form, materialId: m || null, sectionId: section?.id ?? null });
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SelectField
              label={tr.t('quiz.kind')}
              value={form.kind}
              onChange={(v) => v && setForm({ ...form, kind: v })}
              options={(['quiz', 'test', 'exam'] as const).map((k) => ({ value: k, label: tr.t(`quiz.kinds.${k}`) }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField
              label={tr.t('quiz.difficulty')}
              value={form.difficulty}
              onChange={(v) => v && setForm({ ...form, difficulty: v })}
              options={(['easy', 'medium', 'hard'] as const).map((k) => ({ value: k, label: tr.t(`quiz.difficulties.${k}`) }))}
            />
          </View>
        </View>
        <Input
          label={tr.t('quiz.editor.durationLabel')}
          keyboardType="number-pad"
          value={String(Math.round(form.durationSec / 60))}
          onChangeText={(v) => setForm({ ...form, durationSec: Math.max(1, Math.min(300, Number(v.replace(/\D/g, '')) || 1)) * 60 })}
        />
        {!!courses.data?.items.length && (
          <SelectField
            label={tr.t('quiz.editor.course')}
            value={form.courseId ?? ''}
            placeholder="—"
            onChange={(v) => setForm({ ...form, courseId: v || null })}
            options={courses.data.items.filter((c) => c.myRole === 'teacher' || c.myRole === 'assistant').map((c) => ({ value: c.id, label: c.title }))}
          />
        )}
        <SwitchRow label={tr.t('quiz.editor.shuffle')} value={form.shuffle} onChange={(v) => setForm({ ...form, shuffle: v })} />
        <SwitchRow label={tr.t('quiz.editor.publishedLabel')} value={form.published} onChange={(v) => setForm({ ...form, published: v })} />
        {form.questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            total={form.questions.length}
            onChange={(x) => setQ(i, x)}
            onRemove={async () => {
              if (form.questions.length > 1 && !(await confirm(tr.t('quiz.editor.removeQuestion'), { danger: true }))) return;
              setForm((f) => ({ ...f, questions: f.questions.length > 1 ? f.questions.filter((_, k) => k !== i) : [blankQuestion()] }));
            }}
            onMove={(d) =>
              setForm((f) => {
                const qs = [...f.questions];
                const j = i + d;
                if (j < 0 || j >= qs.length) return f;
                [qs[i], qs[j]] = [qs[j]!, qs[i]!];
                return { ...f, questions: qs };
              })
            }
          />
        ))}
        {form.questions.length < LIMITS.questionsPerQuiz && (
          <Button
            variant="outline"
            icon="add"
            title={tr.t('quiz.editor.addQuestion')}
            onPress={() => setForm((f) => ({ ...f, questions: [...f.questions, blankQuestion()] }))}
          />
        )}
        {!valid && (
          <Text size={13} color={t.err}>
            {tr.t('quiz.editor.validation')}
          </Text>
        )}
        <Button icon="save-outline" title={tr.t('quiz.editor.saveQuiz')} loading={busy} disabled={!valid} onPress={() => void save()} />
      </ScrollView>
    </FeatureGate>
  );
}
