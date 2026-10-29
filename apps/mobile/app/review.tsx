import type { DailyReviewDto, FlashcardDto, ReviewAnswerResultDto, ReviewQuestionDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { MathText } from '@/components/MathText';
import { Badge, Row, Segmented } from '@/components/kit';
import { Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

type Item = { kind: 'card'; card: FlashcardDto } | { kind: 'question'; question: ReviewQuestionDto };
type Rating = 'again' | 'unsure' | 'know' | 'easy';

function CardStep({ card, onRated }: { card: FlashcardDto; onRated: () => void }) {
  const tr = useT();
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const rate = async (r: Rating) => {
    setBusy(true);
    try {
      await api.flashcards.review(card.id, r);
      onRated();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Card onPress={() => setFlipped(true)} style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center' }}>
        <Text size={20} weight="black" style={{ textAlign: 'center' }}>
          <MathText text={flipped ? card.back : card.front} />
        </Text>
      </Card>
      {flipped ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button small variant="danger" disabled={busy} title={tr.t('academic.cards.again')} onPress={() => void rate('again')} />
          <Button small variant="outline" disabled={busy} title={tr.t('academic.cards.unsure')} onPress={() => void rate('unsure')} />
          <Button small variant="soft" disabled={busy} title={tr.t('academic.cards.know')} onPress={() => void rate('know')} />
          <Button small disabled={busy} title={tr.t('academic.cards.easy')} onPress={() => void rate('easy')} />
        </View>
      ) : (
        <Button variant="soft" title={tr.t('academic.cards.showAnswer')} onPress={() => setFlipped(true)} />
      )}
    </View>
  );
}

function QuestionStep({ question, onDone }: { question: ReviewQuestionDto; onDone: () => void }) {
  const tr = useT();
  const t = useTheme();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReviewAnswerResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const multi = question.type === 'multi';
  const ready = question.type === 'short' ? text.trim().length > 0 : picked.length > 0;
  const check = async () => {
    setBusy(true);
    try {
      setResult(await api.study.answerQuestion(question.id, question.type === 'short' ? text.trim() : multi ? picked : picked[0]!));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const right = (i: number) => !!result && (Array.isArray(result.answer) ? (result.answer as (number | string)[]).includes(i) : result.answer === i);
  return (
    <View style={{ gap: 12 }}>
      <Card>
        {question.topic ? <Badge label={question.topic} /> : null}
        <Text weight="bold" size={17}>
          <MathText text={question.prompt} />
        </Text>
      </Card>
      {question.type === 'short' ? (
        <Input label={tr.t('review.typeAnswer')} value={text} editable={!result} onChangeText={setText} autoCapitalize="none" />
      ) : (
        question.options.map((o, i) => {
          const on = picked.includes(i);
          return (
            <Pressable
              key={i}
              disabled={!!result}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setPicked(multi ? (on ? picked.filter((x) => x !== i) : [...picked, i]) : [i])}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: t.radiusControl,
                borderWidth: 1.5,
                borderColor: result && right(i) ? t.ok : on ? t.primary : t.border,
                backgroundColor: on ? t.primarySoft : t.card,
              }}
            >
              <Text weight="bold">
                <MathText text={o} />
              </Text>
            </Pressable>
          );
        })
      )}
      {result ? (
        <View style={{ gap: 8 }}>
          <Text weight="black" color={result.correct ? t.ok : t.err}>
            {result.correct ? tr.t('review.correct') : `${tr.t('review.wrong')} ${question.type === 'short' ? (result.answer as string[]).join(' / ') : ''}`}
          </Text>
          {result.explanation ? (
            <Text muted size={13}>
              {result.explanation}
            </Text>
          ) : null}
          <Button title={tr.t('review.next')} onPress={onDone} />
        </View>
      ) : (
        <Button title={tr.t('review.check')} disabled={!ready} loading={busy} onPress={() => void check()} />
      )}
    </View>
  );
}

function Runner({ data }: { data: DailyReviewDto }) {
  const tr = useT();
  const qc = useQueryClient();
  // The queue is fixed when the screen opens, so finishing it (which refreshes the data) keeps the \"done\" message.
  const [items] = useState<Item[]>(() => [
    ...data.cards.map((card): Item => ({ kind: 'card', card })),
    ...data.questions.map((question): Item => ({ kind: 'question', question })),
  ]);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const next = () => {
    setIndex((i) => i + 1);
    if (index + 1 >= items.length) {
      void qc.invalidateQueries({ queryKey: ['review'] });
      void qc.invalidateQueries({ queryKey: ['flashcards'] });
    }
  };
  if (!items.length) return <Empty title={tr.t('review.empty')} icon="happy-outline" />;
  if (index >= items.length) return <Empty title={tr.t('review.done', { count: items.length })} icon="trophy-outline" />;
  const item = items[index]!;
  if (!started)
    return (
      <Card style={{ gap: 10 }}>
        <Text weight="bold">{tr.t('review.queue', { count: data.total, minutes: data.minutes })}</Text>
        <Button title={tr.t('review.practice')} onPress={() => setStarted(true)} />
      </Card>
    );
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text muted weight="bold" size={13}>
          {item.kind === 'card' ? tr.t('review.cards') : tr.t('review.questions')}
        </Text>
        <Text muted weight="bold" size={13}>
          {index + 1}/{items.length}
        </Text>
      </View>
      {item.kind === 'card' ? (
        <CardStep key={item.card.id} card={item.card} onRated={next} />
      ) : (
        <QuestionStep key={item.question.id} question={item.question} onDone={next} />
      )}
    </View>
  );
}

function Focus() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['focus'], queryFn: () => api.study.focus(), refetchInterval: (s) => (s.state.data?.active ? 60_000 : false) });
  const [now, setNow] = useState(Date.now());
  const endsAt = q.data?.active?.endsAt ?? null;
  useEffect(() => {
    if (!endsAt) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [endsAt]);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['focus'] });
      if (done) toast(done);
    } catch (e) {
      toastError(e);
    }
  };
  const s = q.data;
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black" size={16}>
        {tr.t('focus.title')}
      </Text>
      <Text muted size={13}>
        {tr.t('focus.hint')}
      </Text>
      {s?.active && left > 0 ? (
        <View style={{ gap: 8 }}>
          <Text size={30} weight="black">
            {formatClock(left)}
          </Text>
          <Button variant="danger" title={tr.t('focus.stop')} onPress={() => void run(() => api.study.stopFocus(), tr.t('focus.finished'))} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[15, 25, 45, 60].map((m) => (
            <Button
              key={m}
              small
              variant={m === 25 ? 'primary' : 'soft'}
              title={tr.t('focus.minutes', { count: m })}
              onPress={() => void run(() => api.study.startFocus(m))}
            />
          ))}
        </View>
      )}
      {s ? (
        <Text muted size={12}>
          {`${tr.t('focus.today')}: ${s.todayMinutes} · ${tr.t('focus.week')}: ${s.weekMinutes} · ${tr.t('focus.sessions')}: ${s.weekSessions}`}
        </Text>
      ) : null}
      {s ? (
        <Text muted size={12}>
          {tr.t('focus.muted', { count: s.mutedWeek })}
        </Text>
      ) : null}
    </Card>
  );
}

export default function ReviewScreen() {
  const tr = useT();
  const router = useRouter();
  const [tab, setTab] = useState<'today' | 'mistakes'>('today');
  const q = useQuery({ queryKey: ['review', 'today'], queryFn: () => api.study.review(), staleTime: 0 });
  const mistakes = useQuery({ queryKey: ['review', 'mistakes'], queryFn: () => api.study.mistakes(), enabled: tab === 'mistakes' });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text muted>{tr.t('review.subtitle')}</Text>
      <Segmented
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'today', label: tr.t('review.tabToday') },
          { key: 'mistakes', label: tr.t('review.tabMistakes') },
        ]}
      />
      {tab === 'today' ? (
        q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorView onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Runner data={q.data} />
            {q.data.weakObjectives.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text weight="black">{tr.t('review.weak')}</Text>
                {q.data.weakObjectives.map((w) => (
                  <Row
                    key={w.id}
                    icon="trending-down-outline"
                    title={w.title}
                    subtitle={`${w.pct}%`}
                    onPress={() => router.push(`/curriculum/${w.id}` as never)}
                  />
                ))}
              </View>
            )}
            <Focus />
          </>
        )
      ) : mistakes.isPending ? (
        <Loading />
      ) : mistakes.error ? (
        <ErrorView onRetry={() => void mistakes.refetch()} />
      ) : !mistakes.data.items.length ? (
        <Empty title={tr.t('review.mistakesEmpty')} icon="checkmark-circle-outline" />
      ) : (
        <View style={{ gap: 8 }}>
          <Text muted size={13}>
            {tr.t('review.mistakesHint')}
          </Text>
          {mistakes.data.items.map((m) => (
            <Card key={m.questionId} style={{ gap: 4 }}>
              <Text weight="bold">
                <MathText text={m.prompt} />
              </Text>
              <Text muted size={12}>
                {[m.objectiveTitle ?? m.topic, tr.t('review.missedTimes', { count: m.misses })].filter(Boolean).join(' · ')}
              </Text>
              {m.practiceLink?.startsWith('/curriculum/') ? (
                <Button small variant="soft" title={tr.t('review.practiceTopic')} onPress={() => router.push(m.practiceLink as never)} />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
