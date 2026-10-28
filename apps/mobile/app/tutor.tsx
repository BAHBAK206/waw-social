import { Ionicons } from '@expo/vector-icons';
import { LIMITS, type AiAnswerDto, type EssayGradeDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ReadAloud } from '@/components/ReadAloud';
import { Badge, FeatureGate, Progress, Segmented, SelectField } from '@/components/kit';
import { Button, Card, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

type Mode = 'solve' | 'explain' | 'summarize' | 'quiz';

function Answer({ a }: { a: AiAnswerDto }) {
  const tr = useT();
  const t = useTheme();
  const [saved, setSaved] = useState(false);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text weight="black">{tr.t('ai.answer')}</Text>
        <Badge label={tr.t(`ai.confidence.${a.confidence}`)} tone={a.confidence === 'high' ? 'ok' : a.confidence === 'medium' ? 'warn' : 'err'} />
        <View style={{ flex: 1 }} />
        <ReadAloud text={[a.answer, ...a.steps].join('. ')} />
      </View>
      <Text weight="bold" size={17}>
        {a.answer}
      </Text>
      {a.choice !== null && <Badge tone="primary" label={tr.t('ai.choice', { choice: a.choice + 1 })} />}
      {a.steps.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text weight="bold" size={13}>
            {tr.t('ai.steps')}
          </Text>
          {a.steps.map((s, i) => (
            <Text key={i}>
              {i + 1}. {s}
            </Text>
          ))}
        </View>
      )}
      {!!a.generatedQuestions?.length && (
        <View style={{ gap: 8 }}>
          <Text weight="bold" size={13}>
            {tr.t('ai.generated')}
          </Text>
          {a.generatedQuestions.map((g, i) => (
            <View key={i} style={{ gap: 2, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
              <Text weight="bold">
                {i + 1}. {g.prompt}
              </Text>
              {g.options.map((o, k) => (
                <Text key={k} size={13} weight={k === g.answer ? 'bold' : 'regular'} color={k === g.answer ? t.ok : undefined}>
                  {k === g.answer ? '✓ ' : '○ '}
                  {o}
                </Text>
              ))}
            </View>
          ))}
          <Button
            variant="soft"
            icon="layers-outline"
            disabled={saved}
            title={tr.t('ai.toFlashcards')}
            onPress={async () => {
              try {
                const res = await api.flashcards.create(
                  a.generatedQuestions!.map((g) => ({ front: g.prompt, back: `${g.options[g.answer] ?? ''}\n${g.explanation}`.trim(), deck: 'AI' })),
                );
                toast(tr.t('ai.savedCards', { count: res.items.length }));
                setSaved(true);
              } catch (e) {
                toastError(e);
              }
            }}
          />
        </View>
      )}
      {a.sources.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text weight="bold" size={13}>
            {tr.t('ai.sources')}
          </Text>
          {a.sources.map((s, i) => (
            <Text key={i} muted size={12}>
              📄 {s.title}
              {s.page ? ` · ${tr.t('ai.page', { page: s.page })}` : ''}
            </Text>
          ))}
        </View>
      )}
      <Text muted size={11}>
        {tr.t('ai.disclaimer')}
      </Text>
    </Card>
  );
}

function Solver() {
  const tr = useT();
  const courses = useQuery({ queryKey: ['ai', 'courses'], queryFn: () => api.ai.courses() });
  const quota = useQuery({ queryKey: ['ai', 'quota'], queryFn: () => api.ai.quota() });
  const [mode, setMode] = useState<Mode>('solve');
  const [question, setQuestion] = useState('');
  const [material, setMaterial] = useState('');
  const [options, setOptions] = useState('');
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AiAnswerDto | null>(null);
  const ask = async () => {
    setBusy(true);
    try {
      setAnswer(
        await api.ai.solve({
          question: question.trim(),
          material: material.trim() || undefined,
          options: options
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean),
          courseId: courseId || null,
          mode,
        }),
      );
      void quota.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Segmented
        tabs={(['solve', 'explain', 'summarize', 'quiz'] as const).map((k) => ({ key: k, label: tr.t(`ai.modes.${k}`) }))}
        value={mode}
        onChange={setMode}
      />
      {quota.data && !quota.data.enabled && <Text weight="bold">{tr.t('errors.ai_disabled')}</Text>}
      <Input
        label={tr.t('ai.question')}
        value={question}
        onChangeText={setQuestion}
        placeholder={tr.t('ai.questionPlaceholder')}
        multiline
        maxLength={LIMITS.aiQuestion}
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
      {(mode === 'summarize' || mode === 'quiz') && (
        <Input
          label={tr.t('ai.material')}
          value={material}
          onChangeText={setMaterial}
          placeholder={tr.t('ai.materialPlaceholder')}
          multiline
          maxLength={LIMITS.aiMaterial}
          style={{ minHeight: 140, textAlignVertical: 'top' }}
        />
      )}
      {mode === 'solve' && (
        <Input label={tr.t('ai.options')} value={options} onChangeText={setOptions} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      )}
      {!!courses.data?.items.length && (
        <SelectField
          label={tr.t('ai.course')}
          value={courseId}
          placeholder={tr.t('ai.anyCourse')}
          onChange={setCourseId}
          options={courses.data.items.map((c) => ({ value: c.id, label: `${c.title} (${c.materials})` }))}
        />
      )}
      <Button icon="sparkles" title={tr.t('ai.ask')} loading={busy} disabled={!question.trim() && !material.trim()} onPress={() => void ask()} />
      {quota.data?.enabled && (
        <Text muted size={12}>
          {tr.t('ai.quota', { remaining: Math.max(0, quota.data.limit - quota.data.used) })}
        </Text>
      )}
      {answer && <Answer a={answer} />}
    </View>
  );
}

function Essay() {
  const tr = useT();
  const t = useTheme();
  const [answer, setAnswer] = useState('');
  const [points, setPoints] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<EssayGradeDto | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <Input label={tr.t('ai.essayAnswer')} value={answer} onChangeText={setAnswer} multiline style={{ minHeight: 140, textAlignVertical: 'top' }} />
      <Input label={tr.t('ai.keyPoints')} value={points} onChangeText={setPoints} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Input label={tr.t('ai.modelAnswer')} value={model} onChangeText={setModel} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Button
        title={tr.t('ai.grade')}
        loading={busy}
        disabled={!answer.trim() || (!points.trim() && !model.trim())}
        onPress={async () => {
          setBusy(true);
          try {
            setRes(
              await api.ai.gradeEssay({
                answer: answer.trim(),
                modelAnswer: model.trim() || undefined,
                keyPoints: points
                  .split('\n')
                  .map((p) => p.trim())
                  .filter(Boolean),
              }),
            );
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      {res && (
        <Card style={{ gap: 8 }}>
          <Text weight="black" size={36}>
            {res.score}%
          </Text>
          <Progress value={res.score} />
          <Text>{res.feedback}</Text>
          <Text weight="bold" size={13}>
            {tr.t('ai.coverage')}
          </Text>
          {res.coverage.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
              <Ionicons name={c.matched ? 'checkmark-circle' : 'close-circle'} size={18} color={c.matched ? t.ok : t.err} />
              <Text style={{ flex: 1 }}>{c.point}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

export default function TutorScreen() {
  const tr = useT();
  const t = useTheme();
  const [tab, setTab] = useState<'tutor' | 'essay'>('tutor');
  return (
    <FeatureGate id="ai">
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text muted>{tr.t('ai.subtitle')}</Text>
        <Segmented
          tabs={[
            { key: 'tutor', label: tr.t('ai.title') },
            { key: 'essay', label: tr.t('ai.essay') },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'tutor' ? <Solver /> : <Essay />}
      </ScrollView>
    </FeatureGate>
  );
}
