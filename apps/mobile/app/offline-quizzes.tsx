import type { OfflineQuizPackDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Badge } from '@/components/kit';
import { Button, Card, Empty, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useNetwork } from '@/lib/network';
import { downloadQuiz, finishOffline, loadOfflineQuizzes, markOffline, packSize, removeQuiz, useOfflineQuizzes } from '@/lib/offlineQuizzes';
import { flushOutbox, useOutbox } from '@/lib/outbox';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Given = number | number[] | string | null;

/** One saved quiz, solved with no connection; the result is kept and sent when the phone is online. */
function Player({ pack, onClose }: { pack: OfflineQuizPackDto; onClose: () => void }) {
  const tr = useT();
  const t = useTheme();
  const [startedAt] = useState(Date.now());
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Given[]>(() => pack.questions.map(() => null));
  const [done, setDone] = useState(false);
  const q = pack.questions[i]!;
  const set = (v: Given) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)));
  const cur = answers[i];
  if (done) {
    const r = markOffline(pack, answers);
    return (
      <View style={{ gap: 10 }}>
        <Card style={{ gap: 6, alignItems: 'center' }}>
          <Text weight="black" size={22}>
            {tr.t('ops.offline.result', { correct: r.correct, total: r.total, pct: r.pct })}
          </Text>
          <Text muted size={13} style={{ textAlign: 'center' }}>
            {tr.t('ops.offline.saving')}
          </Text>
        </Card>
        {pack.questions.map((x, k) => (
          <Card key={x.id} style={{ gap: 4 }}>
            <Text weight="bold">
              {r.marks[k] ? '✅' : '❌'} {x.prompt}
            </Text>
            {x.explanation ? (
              <Text muted size={13}>
                {x.explanation}
              </Text>
            ) : null}
          </Card>
        ))}
        <Button title={tr.t('ops.offline.done')} onPress={onClose} />
      </View>
    );
  }
  const options = q.type === 'tf' ? [tr.t('ops.offline.tfTrue'), tr.t('ops.offline.tfFalse')] : q.options;
  return (
    <View style={{ gap: 10 }}>
      <Text muted size={13}>
        {i + 1} / {pack.questions.length}
      </Text>
      <Text weight="black" size={18}>
        {q.prompt}
      </Text>
      {q.type === 'short' ? (
        <Input label={tr.t('ops.offline.answer')} value={typeof cur === 'string' ? cur : ''} onChangeText={(v) => set(v)} autoCapitalize="none" />
      ) : (
        options.map((o, k) => {
          const on = q.type === 'multi' ? Array.isArray(cur) && cur.includes(k) : cur === k;
          return (
            <Pressable
              key={k}
              accessibilityRole={q.type === 'multi' ? 'checkbox' : 'radio'}
              accessibilityState={{ selected: on }}
              onPress={() => (q.type === 'multi' ? set(on ? (cur as number[]).filter((x) => x !== k) : [...(Array.isArray(cur) ? cur : []), k]) : set(k))}
              style={{ padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.bg2 }}
            >
              <Text weight={on ? 'bold' : 'regular'}>{o}</Text>
            </Pressable>
          );
        })
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {i > 0 ? <Button variant="outline" title="‹" onPress={() => setI(i - 1)} /> : null}
        {i < pack.questions.length - 1 ? (
          <Button style={{ flex: 1 }} title={tr.t('ops.offline.next')} onPress={() => setI(i + 1)} />
        ) : (
          <Button
            style={{ flex: 1 }}
            title={tr.t('ops.offline.finish')}
            onPress={() => {
              void finishOffline(pack.quiz.id, answers, startedAt);
              setDone(true);
            }}
          />
        )}
      </View>
    </View>
  );
}

export default function OfflineQuizzesScreen() {
  const tr = useT();
  const userId = useSession((s) => s.me?.id);
  const offline = useNetwork((s) => s.offline);
  const { packs } = useOfflineQuizzes();
  const pending = useOutbox((s) => s.items.filter((x) => x.userId === userId && x.kind === 'quiz-result').length);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void loadOfflineQuizzes();
  }, []);
  const list = useQuery({ queryKey: ['offline', 'quizzes'], queryFn: () => api.offline.quizzes(), enabled: !offline });
  const saved = Object.values(packs).sort((a, b) => b.savedAt - a.savedAt);
  const available = (list.data?.items ?? []).filter((x) => !packs[x.id]);
  const bytes = saved.reduce((n, p) => n + packSize(p), 0);
  if (playing && packs[playing])
    return (
      <Screen>
        <Player pack={packs[playing]!} onClose={() => setPlaying(null)} />
      </Screen>
    );
  return (
    <Screen>
      <Text muted>{tr.t('ops.offline.subtitle')}</Text>
      {offline ? <Badge label={tr.t('ops.offline.offlineNow')} tone="warn" /> : null}
      {pending ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge label={tr.t('ops.offline.pending', { count: pending })} tone="warn" />
          {!offline ? (
            <Button
              small
              variant="ghost"
              icon="sync-outline"
              title={tr.t('ops.offline.sync')}
              onPress={() => void flushOutbox().then(() => toast(tr.t('ops.offline.synced')))}
            />
          ) : null}
        </Card>
      ) : null}
      {!saved.length ? <Empty icon="download-outline" title={tr.t('ops.offline.empty')} /> : null}
      {saved.map((p) => (
        <Card key={p.quiz.id} style={{ gap: 6 }}>
          <Text weight="bold">{p.quiz.title}</Text>
          <Text muted size={13}>
            {tr.t('ops.offline.questions', { count: p.questions.length })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small icon="play" title={tr.t('ops.offline.start')} onPress={() => setPlaying(p.quiz.id)} />
            <Button
              small
              variant="ghost"
              icon="trash-outline"
              title={tr.t('ops.offline.remove')}
              onPress={async () => {
                if (await confirm(tr.t('offline.removeConfirm'), { danger: true })) await removeQuiz(p.quiz.id);
              }}
            />
          </View>
        </Card>
      ))}
      {saved.length ? (
        <Text muted size={12} style={{ textAlign: 'center' }}>
          {tr.t('ops.offline.size', { mb: (bytes / 1_048_576).toFixed(2) })}
        </Text>
      ) : null}
      {!offline ? (
        <>
          <Text weight="black">{tr.t('ops.offline.available')}</Text>
          {list.isSuccess && !available.length ? <Text muted>{tr.t('ops.offline.none')}</Text> : null}
          {available.map((x) => (
            <Card key={x.id} style={{ gap: 6 }}>
              <Text weight="bold">{x.title}</Text>
              <Text muted size={13}>
                {tr.t('ops.offline.questions', { count: x.questionCount })}
              </Text>
              <Button
                small
                variant="soft"
                icon="download-outline"
                title={tr.t('ops.offline.download')}
                loading={busy === x.id}
                onPress={async () => {
                  setBusy(x.id);
                  try {
                    await downloadQuiz(x.id);
                    toast(tr.t('ops.offline.downloaded'));
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            </Card>
          ))}
        </>
      ) : null}
      <Text muted size={12}>
        {tr.t('ops.offline.cap')}
      </Text>
    </Screen>
  );
}
