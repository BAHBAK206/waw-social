import { Ionicons } from '@expo/vector-icons';
import {
  blankFormQuestion,
  DEFAULT_FORM_SETTINGS,
  FORM_TYPES,
  FORM_TYPES_WITH_OPTIONS,
  formQuestionsBody,
  retypeFormQuestion,
  validForm,
  type FormDto,
  type FormQuestion,
  type FormSettings,
} from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { DateField, FeatureGate, SelectField, SwitchRow } from '@/components/kit';
import { Button, Card, Input, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';
import { WEB_URL } from '@/lib/web';

const COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#2d3436', '#e84393', '#fdcb6e'];

function QuestionCard({
  q,
  i,
  total,
  quizMode,
  onChange,
  onRemove,
  onMove,
}: {
  q: FormQuestion;
  i: number;
  total: number;
  quizMode: boolean;
  onChange: (q: FormQuestion) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const tr = useT();
  const t = useTheme();
  const set = (patch: Partial<FormQuestion>) => onChange({ ...q, ...patch });
  const choice = FORM_TYPES_WITH_OPTIONS.has(q.type);
  return (
    <Card style={{ gap: 10, borderStartWidth: q.type === 'section' ? 5 : undefined, borderStartColor: t.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <SelectField
            label={tr.t('quiz.editor.type')}
            value={q.type}
            onChange={(v) => v && onChange(retypeFormQuestion(q, v))}
            options={FORM_TYPES.map((x) => ({ value: x, label: tr.t(`forms.questionTypes.${x}`) }))}
          />
        </View>
        <Pressable hitSlop={8} disabled={i === 0} onPress={() => onMove(-1)} accessibilityRole="button" accessibilityLabel={tr.t('common.previous')}>
          <Ionicons name="arrow-up" size={20} color={i === 0 ? t.text3 : t.text2} />
        </Pressable>
        <Pressable hitSlop={8} disabled={i === total - 1} onPress={() => onMove(1)} accessibilityRole="button" accessibilityLabel={tr.t('common.next')}>
          <Ionicons name="arrow-down" size={20} color={i === total - 1 ? t.text3 : t.text2} />
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove} accessibilityRole="button" accessibilityLabel={tr.t('common.delete')}>
          <Ionicons name="trash-outline" size={20} color={t.err} />
        </Pressable>
      </View>
      <Input label={tr.t('common.title')} value={q.title} onChangeText={(v) => set({ title: v })} maxLength={500} />
      <Input label={tr.t('common.description')} value={q.description} onChangeText={(v) => set({ description: v })} maxLength={2000} multiline />
      {choice && (
        <View style={{ gap: 8 }}>
          <Text weight="bold" size={13} muted>
            {tr.t('forms.options')}
          </Text>
          {q.options.map((o, k) => {
            const correct = !!o && !!q.correct?.includes(o);
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {quizMode && (
                  <Pressable
                    hitSlop={6}
                    accessibilityRole={q.type === 'multiple' ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: correct }}
                    accessibilityLabel={tr.t('forms.correct')}
                    onPress={() => {
                      const cur = q.correct ?? [];
                      set({ correct: q.type === 'multiple' ? (correct ? cur.filter((x) => x !== o) : [...cur, o]) : [o] });
                    }}
                  >
                    <Ionicons name={correct ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={correct ? t.ok : t.text3} />
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <Input
                    value={o}
                    maxLength={300}
                    placeholder={tr.t('poll.option', { n: k + 1 })}
                    onChangeText={(v) => set({ options: q.options.map((x, j) => (j === k ? v : x)), correct: q.correct?.map((c) => (c === o ? v : c)) })}
                  />
                </View>
                {q.options.length > 2 && (
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={tr.t('common.remove')}
                    onPress={() => set({ options: q.options.filter((_, j) => j !== k), correct: q.correct?.filter((c) => c !== o) })}
                  >
                    <Ionicons name="close" size={20} color={t.text3} />
                  </Pressable>
                )}
              </View>
            );
          })}
          <Button small variant="ghost" icon="add" title={tr.t('forms.addOption')} onPress={() => set({ options: [...q.options, ''] })} />
        </View>
      )}
      {q.type === 'scale' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              label={tr.t('forms.minLabel')}
              keyboardType="number-pad"
              value={String(q.min ?? 1)}
              onChangeText={(v) => set({ min: Math.max(0, Math.min(1, Number(v) || 0)) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={tr.t('forms.maxLabel')}
              keyboardType="number-pad"
              value={String(q.max ?? 5)}
              onChangeText={(v) => set({ max: Math.max(2, Math.min(10, Number(v) || 5)) })}
            />
          </View>
        </View>
      )}
      {q.type !== 'section' && <SwitchRow label={tr.t('forms.required')} value={q.required} onChange={(v) => set({ required: v })} />}
      {quizMode && choice && (
        <Input
          label={tr.t('forms.pointsLabel')}
          keyboardType="number-pad"
          value={String(q.points ?? 1)}
          onChangeText={(v) => set({ points: Math.max(0, Math.min(100, Number(v.replace(/\D/g, '')) || 0)) })}
        />
      )}
    </Card>
  );
}

export default function FormEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['form', id], queryFn: () => api.forms.get(id!), enabled: !!id, staleTime: 0 });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<FormSettings>(DEFAULT_FORM_SETTINGS);
  const [questions, setQuestions] = useState<FormQuestion[]>(() => [blankFormQuestion()]);
  const [published, setPublished] = useState(false);
  const [saved, setSaved] = useState<FormDto | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f = existing.data;
    if (!f) return;
    setTitle(f.title);
    setDescription(f.description);
    setSettings({ ...DEFAULT_FORM_SETTINGS, ...f.settings });
    setQuestions(f.questions.length ? f.questions : [blankFormQuestion()]);
    setPublished(f.published);
    setSaved(f);
  }, [existing.data]);
  if (id && existing.isPending) return <Loading />;
  const set = (patch: Partial<FormSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const valid = validForm(title, questions);
  const link = saved ? `${WEB_URL}/f/${saved.slug}` : null;
  const deadlineDay = settings.deadline ? new Date(settings.deadline).toISOString().slice(0, 10) : '';

  const save = async (publish?: boolean) => {
    setBusy(true);
    try {
      const body = { title: title.trim(), description: description.trim(), settings, published: publish ?? published, questions: formQuestionsBody(questions) };
      const res = saved ? await api.forms.update(saved.id, body) : await api.forms.create(body);
      setSaved(res);
      setPublished(res.published);
      toast(tr.t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['forms'] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FeatureGate id="forms">
      <Stack.Screen options={{ title: saved ? saved.title || tr.t('forms.saveForm') : tr.t('forms.newForm') }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 10, borderTopWidth: 6, borderTopColor: settings.color }}>
          <Input label={tr.t('common.title')} value={title} onChangeText={setTitle} placeholder={tr.t('forms.untitled')} maxLength={200} />
          <Input label={tr.t('common.description')} value={description} onChangeText={setDescription} multiline />
        </Card>
        <SectionTitle>{tr.t('forms.settings')}</SectionTitle>
        <Card style={{ gap: 4 }}>
          <SwitchRow label={tr.t('forms.accepting')} value={settings.acceptingResponses} onChange={(v) => set({ acceptingResponses: v })} />
          <SwitchRow label={tr.t('forms.requireSignIn')} value={settings.requireSignIn} onChange={(v) => set({ requireSignIn: v })} />
          <SwitchRow label={tr.t('forms.oneResponse')} value={settings.oneResponsePerUser} onChange={(v) => set({ oneResponsePerUser: v })} />
          <SwitchRow label={tr.t('forms.collectEmail')} value={settings.collectEmail} onChange={(v) => set({ collectEmail: v })} />
          <SwitchRow label={tr.t('forms.showResults')} value={settings.showResults} onChange={(v) => set({ showResults: v })} />
          <SwitchRow label={tr.t('forms.quizMode')} value={settings.quizMode} onChange={(v) => set({ quizMode: v })} />
          <SwitchRow label={tr.t('forms.shuffle')} value={settings.shuffleQuestions} onChange={(v) => set({ shuffleQuestions: v })} />
          <DateField label={tr.t('forms.deadline')} value={deadlineDay} onChange={(v) => set({ deadline: v ? new Date(`${v}T23:59:00`).getTime() : null })} />
          {settings.deadline ? <Button small variant="ghost" title={tr.t('common.clear')} onPress={() => set({ deadline: null })} /> : null}
          <Input label={tr.t('forms.confirmation')} value={settings.confirmationMessage} onChangeText={(v) => set({ confirmationMessage: v })} multiline />
          <Text weight="bold" size={13} muted>
            {tr.t('forms.color')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => set({ color: c })}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.color === c }}
                accessibilityLabel={c}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: settings.color === c ? 3 : 0, borderColor: t.text }}
              />
            ))}
          </View>
        </Card>
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            i={i}
            total={questions.length}
            quizMode={settings.quizMode}
            onChange={(x) => setQuestions((qs) => qs.map((y, k) => (k === i ? x : y)))}
            onRemove={async () => {
              if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
              setQuestions((qs) => (qs.length > 1 ? qs.filter((_, k) => k !== i) : [blankFormQuestion()]));
            }}
            onMove={(d) =>
              setQuestions((qs) => {
                const arr = [...qs];
                const j = i + d;
                if (j < 0 || j >= arr.length) return qs;
                [arr[i], arr[j]] = [arr[j]!, arr[i]!];
                return arr;
              })
            }
          />
        ))}
        <Button variant="outline" icon="add" title={tr.t('forms.addQuestion')} onPress={() => setQuestions((qs) => [...qs, blankFormQuestion()])} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button variant="outline" title={tr.t('common.save')} loading={busy} disabled={!valid} onPress={() => void save()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={published ? tr.t('common.unpublish') : tr.t('common.publish')}
              loading={busy}
              disabled={!valid}
              onPress={() => void save(!published)}
            />
          </View>
        </View>
        {link && (
          <Card style={{ gap: 8 }}>
            <Text weight="bold">{tr.t('forms.shareLink')}</Text>
            <Text muted size={12} selectable>
              {link}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button
                small
                variant="soft"
                icon="copy-outline"
                title={tr.t('forms.copyLink')}
                onPress={async () => {
                  await Clipboard.setStringAsync(link);
                  toast(tr.t('common.copied'));
                }}
              />
              <Button
                small
                variant="soft"
                icon="share-social-outline"
                title={tr.t('forms.share')}
                onPress={() => void Share.share({ message: `${title}\n${link}` })}
              />
              <Button
                small
                variant="outline"
                icon="bar-chart-outline"
                title={tr.t('forms.analytics')}
                onPress={() => router.push(`/form-responses/${saved!.id}` as never)}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </FeatureGate>
  );
}
