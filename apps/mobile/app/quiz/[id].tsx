import { Ionicons } from '@expo/vector-icons';
import type { QuizAttemptDto, QuizResultDto } from '@qubedu/shared';
import { xpProgress } from '@qubedu/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ReadAloud } from '@/components/ReadAloud';
import { Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Answer = number | number[] | string | null;

function Result({ res }: { res: QuizResultDto }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const level = xpProgress(res.xpAfter);
  const [cardsSaved, setCardsSaved] = useState(false);
  const wrong = res.breakdown.filter((b) => !b.correct);
  const show = (b: QuizResultDto['breakdown'][number], v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => (typeof x === 'number' ? b.options[x] : x)).join('، ')
      : typeof v === 'number'
        ? (b.options[v] ?? String(v))
        : String(v ?? '');
  const saveMistakes = async () => {
    try {
      const r = await api.flashcards.create(
        wrong.map((b) => ({
          front: b.prompt.slice(0, 1000),
          back: [show(b, b.answer), b.explanation ?? ''].filter(Boolean).join('\n').slice(0, 2000) || '—',
          deck: tr.t('quiz.result.mistakesDeck'),
        })),
      );
      toast(tr.t('ai.savedCards', { count: r.items.length }));
      setCardsSaved(true);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: t.bg }}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Text weight="black" size={44} color={res.pct >= 50 ? t.ok : t.err}>
          {res.pct}%
        </Text>
        <Text weight="bold">{tr.t('quiz.result.score', { correct: res.correct, total: res.total })}</Text>
        {res.perfect ? <Text weight="bold">{tr.t('quiz.result.perfect')}</Text> : null}
        {res.isNewBest ? (
          <Text weight="bold" color={t.primaryInk}>
            {tr.t('quiz.result.newBest')}
          </Text>
        ) : null}
        {res.review ? (
          <Text muted>{tr.t('quiz.result.reviewMode')}</Text>
        ) : (
          <Text weight="bold" color={t.primaryInk}>
            {tr.t('quiz.result.xpEarned', { xp: res.xpEarned })}
          </Text>
        )}
        {res.levelUp ? <Text weight="black">{tr.t('quiz.result.levelUp', { level: level.level })}</Text> : null}
        <Text muted size={12}>
          {tr.t('quiz.result.time', { time: formatClock(res.timeSec) })}
        </Text>
      </Card>
      {!!res.lessons?.length && (
        <Card style={{ gap: 8, borderWidth: res.pct < 70 ? 1.5 : 0, borderColor: t.warn }}>
          <Text weight="black">{tr.t('quiz.result.reviewLesson')}</Text>
          <Text muted size={13}>
            {res.pct < 70 ? tr.t('quiz.result.reviewLessonLow') : tr.t('quiz.result.reviewLessonHint')}
          </Text>
          {res.lessons.map((l) => (
            <Pressable
              key={l.id}
              accessibilityRole="link"
              onPress={() => router.push(`/video/${l.id}` as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Ionicons name="play-circle-outline" size={22} color={t.primaryInk} />
              <Text weight="bold" color={t.primaryInk} style={{ flex: 1 }}>
                {l.title}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
      {!res.review && wrong.length > 0 && (
        <Button
          variant="soft"
          title={cardsSaved ? tr.t('quiz.result.mistakesSaved') : tr.t('quiz.result.mistakesToCards', { count: wrong.length })}
          disabled={cardsSaved}
          onPress={saveMistakes}
        />
      )}
      {res.topicStats.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Text weight="black">{tr.t('quiz.result.topics')}</Text>
          {res.topicStats.map((s) => (
            <View key={s.topic} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text>{s.topic}</Text>
              <Text weight="bold" color={s.pct >= 60 ? t.ok : t.err}>
                {s.pct}%
              </Text>
            </View>
          ))}
        </Card>
      )}
      <Text weight="black" size={17}>
        {tr.t('quiz.result.breakdown')}
      </Text>
      {res.breakdown.map((b, i) => {
        const fmt = (v: unknown) =>
          Array.isArray(v)
            ? v.map((x) => (typeof x === 'number' ? b.options[x] : x)).join('، ')
            : typeof v === 'number'
              ? (b.options[v] ?? String(v))
              : v == null || v === ''
                ? tr.t('quiz.result.noAnswer')
                : String(v);
        return (
          <Card key={b.questionId} style={{ gap: 6, borderColor: b.correct ? t.ok : t.err, borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name={b.correct ? 'checkmark-circle' : 'close-circle'} size={22} color={b.correct ? t.ok : t.err} />
              <Text weight="bold" style={{ flex: 1 }}>
                {i + 1}. {b.prompt}
              </Text>
            </View>
            <Text size={13}>
              {tr.t('quiz.result.yourAnswer')}: {fmt(b.given)}
            </Text>
            {!b.correct && (
              <Text size={13} color={t.ok} weight="bold">
                {tr.t('quiz.result.correctAnswer')}: {fmt(b.answer)}
              </Text>
            )}
            {b.explanation ? (
              <Text size={13} muted>
                {tr.t('quiz.result.explanation')}: {b.explanation}
              </Text>
            ) : null}
          </Card>
        );
      })}
      <Button title={tr.t('quiz.result.backToList')} variant="soft" onPress={() => router.replace('/learn' as never)} />
    </ScrollView>
  );
}

function Player({ attempt, onDone }: { attempt: QuizAttemptDto; onDone: (r: QuizResultDto) => void }) {
  const tr = useT();
  const t = useTheme();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => attempt.questions.map((q) => (q.type === 'multi' ? [] : q.type === 'short' ? '' : null)));
  const [left, setLeft] = useState(() => Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000)));
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const q = attempt.questions[index]!;

  const submit = useCallback(
    async (force = false) => {
      if (submitted.current) return;
      const unanswered = answers.filter((a) => a === null || a === '' || (Array.isArray(a) && !a.length)).length;
      if (!force && !(await confirm(tr.t('quiz.player.confirmSubmit', { count: unanswered })))) return;
      submitted.current = true;
      setBusy(true);
      try {
        const res = await api.quizzes.submit(
          attempt.attemptId,
          answers.map((a) => (Array.isArray(a) && !a.length ? null : a === '' ? null : a)),
        );
        void Haptics.notificationAsync(res.pct >= 50 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
        onDone(res);
      } catch (e) {
        submitted.current = false;
        toastError(e);
      } finally {
        setBusy(false);
      }
    },
    [answers, attempt.attemptId, onDone, tr],
  );

  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [attempt.expiresAt]);
  useEffect(() => {
    if (left === 0) void submit(true);
  }, [left, submit]);

  const set = (v: Answer) => setAnswers((a) => a.map((x, i) => (i === index ? v : x)));
  const current = answers[index];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: attempt.quiz.title, headerBackVisible: false, gestureEnabled: false }} />
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text weight="bold">{tr.t('quiz.player.questionOf', { n: index + 1, total: attempt.questions.length })}</Text>
          <Text weight="black" color={left < 30 ? t.err : t.text} accessibilityLabel={tr.t('quiz.player.timeLeft')}>
            {formatClock(left)}
          </Text>
        </View>
        <View style={{ height: 6, backgroundColor: t.bg3, borderRadius: 3 }}>
          <View style={{ height: 6, width: `${((index + 1) / attempt.questions.length) * 100}%`, backgroundColor: t.primary, borderRadius: 3 }} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Text weight="black" size={19} style={{ flex: 1 }}>
            {q.prompt}
          </Text>
          <ReadAloud text={[q.prompt, ...q.options].join('. ')} size={24} />
        </View>
        {q.type === 'multi' ? (
          <Text muted size={13}>
            {tr.t('quiz.player.selectAll')}
          </Text>
        ) : null}
        {q.type === 'short' ? (
          <Input value={typeof current === 'string' ? current : ''} onChangeText={set} placeholder={tr.t('quiz.player.typeAnswer')} />
        ) : (
          q.options.map((o, i) => {
            const selected = q.type === 'multi' ? Array.isArray(current) && current.includes(i) : current === i;
            return (
              <Pressable
                key={i}
                accessibilityRole={q.type === 'multi' ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  if (q.type === 'multi') {
                    const arr = Array.isArray(current) ? current : [];
                    set(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i].sort());
                  } else set(i);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: t.radiusControl,
                  borderWidth: 2,
                  borderColor: selected ? t.primary : t.border,
                  backgroundColor: selected ? t.primarySoft : t.cardSolid,
                }}
              >
                <Ionicons
                  name={q.type === 'multi' ? (selected ? 'checkbox' : 'square-outline') : selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected ? t.primary : t.text3}
                />
                <Text style={{ flex: 1 }} weight={selected ? 'bold' : 'regular'}>
                  {o}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: t.cardSolid, borderTopWidth: 1, borderTopColor: t.border }}>
        <Button title={tr.t('common.previous')} variant="outline" disabled={index === 0} onPress={() => setIndex(index - 1)} style={{ flex: 1 }} />
        {index < attempt.questions.length - 1 ? (
          <Button title={tr.t('common.next')} onPress={() => setIndex(index + 1)} style={{ flex: 1 }} />
        ) : (
          <Button title={tr.t('quiz.player.submit')} loading={busy} onPress={() => void submit()} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

export default function QuizScreen() {
  const { id, review, topic } = useLocalSearchParams<{ id: string; review?: string; topic?: string }>();
  const [attempt, setAttempt] = useState<QuizAttemptDto | null>(null);
  const [result, setResult] = useState<QuizResultDto | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const run = useCallback(async () => {
    setFailed(false);
    try {
      setAttempt(id === 'adaptive' ? await api.quizzes.adaptive({ count: 10, topic: topic || null }) : await api.quizzes.start(id!, review === '1'));
    } catch (e) {
      setFailed(true);
      toastError(e);
    }
  }, [id, review]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);
  if (result) return <Result res={result} />;
  if (failed) return <ErrorView onRetry={() => void run()} />;
  if (!attempt) return <Loading />;
  return <Player attempt={attempt} onDone={setResult} />;
}
