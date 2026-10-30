import { addDays, daysBetween, type ExamDto, type MasteryDto, type PomodoroSessionDto, type StudySessionDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, DateField, Progress, Row, Sheet, toDay } from '@/components/kit';
import { Button, Card, Chip, Empty, Input, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatClock, formatDay } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { appPath } from '@/lib/links';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

const today = () => toDay(new Date());

export function TodayTab() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.academic.dashboard() });
  if (q.isPending) return <Loading />;
  const d = q.data;
  if (!d) return null;
  const max = Math.max(d.dailyGoalMinutes, ...d.weeklyMinutes.map((w) => w.minutes), 1);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text weight="black" style={{ flex: 1 }}>
            {tr.t('home.dailyGoal')}
          </Text>
          <Text weight="bold">🔥 {tr.t('home.streakDays', { count: d.streak })}</Text>
        </View>
        <Progress value={d.studyMinutesToday} max={d.dailyGoalMinutes} />
        <Text muted size={13}>
          {tr.t('home.goalProgress', { done: d.studyMinutesToday, goal: d.dailyGoalMinutes })}
        </Text>
      </Card>
      <SectionTitle>{tr.t('home.inbox')}</SectionTitle>
      {!d.inbox.length ? (
        <Text muted>{tr.t('home.inboxEmpty')}</Text>
      ) : (
        d.inbox.map((i, k) => {
          const href = appPath(i.link);
          return (
            <Row
              key={k}
              title={`${i.title}${i.count ? ` (${i.count})` : ''}`}
              subtitle={tr.tDyn(`academic.inboxKinds.${i.kind}`, undefined, i.kind)}
              onPress={href ? () => router.push(href as never) : undefined}
            />
          );
        })
      )}
      <SectionTitle>{tr.t('home.weekActivity')}</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {d.weeklyMinutes.map((w) => (
            <View key={w.day} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${formatDay(w.day, tr)}: ${w.minutes}`}>
              <Text size={10} muted>
                {w.minutes || ''}
              </Text>
              <View
                style={{
                  width: '70%',
                  height: Math.max(3, (w.minutes / max) * 90),
                  borderRadius: 4,
                  backgroundColor: w.day === d.today ? t.primary : t.primarySoft,
                }}
              />
              <Text size={10} muted>
                {formatDay(w.day, tr, { weekday: 'narrow' })}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      {d.upcomingExams.length > 0 && (
        <>
          <SectionTitle>{tr.t('home.upcomingExams')}</SectionTitle>
          {d.upcomingExams.map((e) => (
            <Row
              key={e.id}
              icon="calendar-outline"
              title={e.subject}
              subtitle={`${formatDay(e.day, tr)} · ${tr.t('academic.countdown', { count: daysBetween(d.today, e.day) })}`}
            />
          ))}
        </>
      )}
    </View>
  );
}

const KIND_TONE = { exam: 'err', assignment: 'warn', task: 'primary', review: 'ok', session: 'neutral' } as const;

export function PlanTab() {
  const tr = useT();
  const router = useRouter();
  const [budget, setBudget] = useState(90);
  const q = useQuery({ queryKey: ['weekly-plan', budget], queryFn: () => api.academic.weeklyPlan({ budget, days: 7 }) });
  const link = (b: { kind: string; refId?: string }) =>
    b.kind === 'assignment' && b.refId
      ? `/assignment/${b.refId}`
      : b.kind === 'task'
        ? '/organizer'
        : b.kind === 'review'
          ? '/study?tab=cards'
          : b.kind === 'exam'
            ? '/study?tab=exams'
            : '/study?tab=sessions';
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text weight="bold" style={{ flex: 1 }}>
          {tr.t('academic.plan.budget')}
        </Text>
        <Button small variant="outline" title="−" onPress={() => setBudget((b) => Math.max(30, b - 15))} />
        <Text weight="black" style={{ minWidth: 40, textAlign: 'center' }}>
          {budget}
        </Text>
        <Button small variant="outline" title="+" onPress={() => setBudget((b) => Math.min(360, b + 15))} />
      </Card>
      {q.isPending ? (
        <Loading />
      ) : !q.data?.days.some((d) => d.blocks.length) ? (
        <Empty icon="calendar-outline" title={tr.t('academic.plan.empty')} />
      ) : (
        q.data.days.map((d) => (
          <Card key={d.day} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text weight="black" style={{ flex: 1 }}>
                {formatDay(d.day, tr, { weekday: 'long', day: 'numeric', month: 'short' })}
              </Text>
              <Text muted size={12}>
                {d.minutes}/{q.data.budget}
              </Text>
            </View>
            <Progress value={d.minutes} max={q.data.budget} />
            {d.blocks.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => router.push(link(b) as never)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}
              >
                <Badge label={tr.tDyn(`academic.plan.kinds.${b.kind}`, undefined, b.kind)} tone={KIND_TONE[b.kind as keyof typeof KIND_TONE] ?? 'neutral'} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text muted size={12}>
                  {b.minutes}′
                </Text>
              </Pressable>
            ))}
          </Card>
        ))
      )}
      {!!q.data?.overflow.length && (
        <Card style={{ gap: 6 }}>
          <Text weight="black">{tr.t('academic.plan.overflow')}</Text>
          {q.data.overflow.map((b, i) => (
            <Text key={i} muted>
              {b.title} · {b.minutes}′
            </Text>
          ))}
        </Card>
      )}
    </View>
  );
}

export function SessionsTab() {
  const tr = useT();
  const qc = useQueryClient();
  const from = today();
  const q = useQuery({ queryKey: ['study-sessions', from], queryFn: () => api.sessions.list({ from: addDays(from, -7), to: addDays(from, 30) }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', subject: '', day: from, startTime: '', minutes: '45' });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['study-sessions'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
  const save = async () => {
    if (!form.title.trim()) return;
    try {
      await api.sessions.create({
        title: form.title.trim(),
        subject: form.subject.trim() || null,
        day: form.day,
        startTime: form.startTime || null,
        minutes: Math.max(5, Math.min(600, Number(form.minutes) || 45)),
        notes: null,
        completed: false,
      });
      setOpen(false);
      setForm({ title: '', subject: '', day: from, startTime: '', minutes: '45' });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  const items = (q.data?.items ?? []).slice().sort((a, b) => (a.day + (a.startTime ?? '')).localeCompare(b.day + (b.startTime ?? '')));
  return (
    <View style={{ gap: 12 }}>
      <Button icon="add" title={tr.t('academic.addSession')} onPress={() => setOpen(true)} />
      {q.isPending ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="time-outline" title={tr.t('common.empty')} />
      ) : (
        items.map((s: StudySessionDto) => (
          <Card key={s.id} style={{ gap: 6, opacity: s.completed ? 0.6 : 1 }}>
            <Text weight="bold">{s.title}</Text>
            <Text muted size={12}>
              {formatDay(s.day, tr)}
              {s.startTime ? ` · ${s.startTime}` : ''} · {tr.t('common.minutes', { count: s.minutes })}
              {s.subject ? ` · ${s.subject}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!s.completed && (
                <Button
                  small
                  variant="soft"
                  icon="checkmark"
                  title={tr.t('academic.markDone')}
                  onPress={async () => {
                    try {
                      await api.sessions.update(s.id, { completed: true });
                      toast(tr.t('academic.completed'));
                      await refresh();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                />
              )}
              <Button
                small
                variant="ghost"
                title={tr.t('common.delete')}
                onPress={async () => {
                  if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                  try {
                    await api.sessions.remove(s.id);
                    await refresh();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            </View>
          </Card>
        ))
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('academic.addSession')}
        footer={<Button title={tr.t('common.save')} onPress={() => void save()} disabled={!form.title.trim()} />}
      >
        <Input label={tr.t('academic.sessionTitle')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <Input label={tr.t('academic.subject')} value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} />
        <DateField label={tr.t('common.date')} value={form.day} onChange={(v) => setForm({ ...form, day: v })} />
        <DateField label={tr.t('academic.startTime')} mode="time" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
        <Input
          label={tr.t('academic.length')}
          keyboardType="number-pad"
          value={form.minutes}
          onChangeText={(v) => setForm({ ...form, minutes: v.replace(/\D/g, '') })}
        />
      </Sheet>
    </View>
  );
}

export function ExamsTab() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['exams'], queryFn: () => api.exams.list() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', day: addDays(today(), 7), time: '', place: '' });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['exams'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
  const now = today();
  const items = (q.data?.items ?? []).slice().sort((a, b) => a.day.localeCompare(b.day));
  return (
    <View style={{ gap: 12 }}>
      <Button icon="add" title={tr.t('academic.addExam')} onPress={() => setOpen(true)} />
      {q.isPending ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="calendar-outline" title={tr.t('home.noExams')} />
      ) : (
        items.map((e: ExamDto) => {
          const days = daysBetween(now, e.day);
          return (
            <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: days < 0 ? 0.55 : 1 }}>
              <View
                style={{ width: 64, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: days <= 3 && days >= 0 ? t.errFill : t.primarySoft }}
              >
                <Text weight="black" size={20} color={days <= 3 && days >= 0 ? '#fff' : t.primaryInk}>
                  {days < 0 ? '✓' : days}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text weight="bold">{e.subject}</Text>
                <Text muted size={12}>
                  {formatDay(e.day, tr, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {e.time ? ` · ${e.time}` : ''}
                  {e.place ? ` · ${e.place}` : ''}
                </Text>
                <Text size={12} weight="bold" color={t.primaryInk}>
                  {days < 0 ? tr.t('academic.passed') : days === 0 ? tr.t('academic.examToday') : tr.t('academic.countdown', { count: days })}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={tr.t('common.delete')}
                onPress={async () => {
                  if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                  try {
                    await api.exams.remove(e.id);
                    await refresh();
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                <Text color={t.err} size={12} weight="bold">
                  {tr.t('common.delete')}
                </Text>
              </Pressable>
            </Card>
          );
        })
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('academic.addExam')}
        footer={
          <Button
            title={tr.t('common.save')}
            disabled={!form.subject.trim()}
            onPress={async () => {
              try {
                await api.exams.create({ subject: form.subject.trim(), day: form.day, time: form.time || null, place: form.place.trim() || null });
                setOpen(false);
                setForm({ subject: '', day: addDays(today(), 7), time: '', place: '' });
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        }
      >
        <Input label={tr.t('academic.subject')} value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} />
        <DateField label={tr.t('common.date')} value={form.day} onChange={(v) => setForm({ ...form, day: v })} />
        <DateField label={tr.t('common.time')} mode="time" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
        <Input label={tr.t('common.place')} value={form.place} onChangeText={(v) => setForm({ ...form, place: v })} />
      </Sheet>
    </View>
  );
}

const PRESETS = [25, 45, 15, 5];

export function FocusTab() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ['pomodoro', 'active'], queryFn: () => api.pomodoro.active() });
  const stats = useQuery({ queryKey: ['pomodoro', 'stats'], queryFn: () => api.pomodoro.stats() });
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const session: PomodoroSessionDto | null = active.data?.session ?? null;
  const left = session ? Math.max(0, Math.round((session.endsAt - now) / 1000)) : minutes * 60;

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [session]);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['pomodoro'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
  const complete = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await api.pomodoro.complete(session.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast(tr.t('academic.focus.completed', { xp: res.xpEarned }));
      await refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // Finish automatically when the timer runs out while the screen is open.
  useEffect(() => {
    if (session && left === 0 && !busy) void complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0, session?.id]);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
        <Text weight="black" size={56} style={{ writingDirection: 'ltr' }} accessibilityRole="timer">
          {formatClock(left)}
        </Text>
        {session?.label ? <Text muted>{session.label}</Text> : null}
        {session ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              variant="outline"
              title={tr.t('common.cancel')}
              onPress={async () => {
                try {
                  await api.pomodoro.cancel(session.id);
                  await refresh();
                } catch (e) {
                  toastError(e);
                }
              }}
            />
            <Button title={tr.t('academic.markDone')} loading={busy} disabled={left > 0} onPress={() => void complete()} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {PRESETS.map((m) => (
                <Chip key={m} label={tr.t('common.minutes', { count: m })} active={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
            <View style={{ alignSelf: 'stretch' }}>
              <Input placeholder={tr.t('academic.focus.label')} value={label} onChangeText={setLabel} maxLength={80} />
            </View>
            <Button
              icon="play"
              title={tr.t('academic.focus.start')}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api.pomodoro.start(minutes, label.trim() || undefined);
                  setNow(Date.now());
                  await qc.invalidateQueries({ queryKey: ['pomodoro', 'active'] });
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
      </Card>
      {stats.data && (
        <Card style={{ gap: 4 }}>
          <Text weight="bold">{tr.t('academic.focus.week', { minutes: stats.data.weekMinutes })}</Text>
          <Text muted size={13}>
            {tr.t('academic.focus.todaySessions', { count: stats.data.weekSessions })}
          </Text>
        </Card>
      )}
      <Text muted size={12} style={{ color: t.text3 }}>
        {tr.t('features.pomodoro')}
      </Text>
    </View>
  );
}

const LEVEL_TONE = { needs_review: 'err', developing: 'warn', proficient: 'primary', strong: 'ok' } as const;

export function MasteryTab() {
  const tr = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ['mastery'], queryFn: () => api.quizzes.mastery() });
  if (q.isPending) return <Loading />;
  if (!q.data?.items.length) return <Empty icon="analytics-outline" title={tr.t('academic.mastery.empty')} />;
  return (
    <View style={{ gap: 10 }}>
      {q.data.items.map((m: MasteryDto) => (
        <Card key={m.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text weight="bold" style={{ flex: 1 }}>
              {m.topic}
            </Text>
            <Badge label={tr.t(`academic.mastery.levels.${m.level}`)} tone={LEVEL_TONE[m.level]} />
          </View>
          <Progress value={m.mastery} />
          <Text muted size={12}>
            {Math.round(m.mastery)}% · {tr.t(`academic.mastery.trend.${m.trend}`)} · {tr.t('academic.mastery.evidence', { count: m.evidenceQuestions })}
          </Text>
          {(m.level === 'needs_review' || m.level === 'developing') && (
            <Button
              small
              variant="soft"
              icon="refresh"
              title={tr.t('academic.mastery.practice')}
              onPress={() => router.push(`/quiz/adaptive?topic=${encodeURIComponent(m.topic)}` as never)}
            />
          )}
        </Card>
      ))}
    </View>
  );
}
