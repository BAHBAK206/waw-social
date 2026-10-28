import type { AssignmentDto, Attachment, SubmissionDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Files } from '@/components/Files';
import { VoiceAttach, VoiceCard } from '@/components/Voice';
import { Screen } from '@/components/Screen';
import { Badge, FeatureGate, pickDocument } from '@/components/kit';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { formatDay, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

async function attach(): Promise<Attachment | null> {
  const f = await pickDocument();
  if (!f) return null;
  const up = await uploadFile(f, 'assignment');
  return { url: up.url, name: up.name, mime: up.mime, size: up.size, kind: up.kind };
}

function StudentPanel({ a, onChanged }: { a: AssignmentDto; onChanged: () => void }) {
  const tr = useT();
  const t = useTheme();
  const sub = a.mySubmission;
  const [text, setText] = useState(sub?.text ?? '');
  const [files, setFiles] = useState<Attachment[]>(sub?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const closed = a.state === 'closed' || (!!a.dueAt && a.dueAt < Date.now() && !a.allowLate);
  const locked = !!sub && sub.status !== 'submitted';
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text weight="black" style={{ flex: 1 }}>
          {tr.t('school.assignment.yourWork')}
        </Text>
        {sub && <Badge tone={sub.status === 'submitted' ? 'primary' : 'ok'} label={tr.t(`school.assignment.${sub.status}`)} />}
        {sub?.late && <Badge tone="warn" label={tr.t('school.assignment.late')} />}
      </View>
      {sub && sub.grade !== null && (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.primarySoft, gap: 4 }}>
          <Text weight="black" size={28}>
            {sub.grade}
            <Text muted size={16}>
              /{a.points}
            </Text>
          </Text>
          {sub.feedback ? <Text>{sub.feedback}</Text> : null}
          {sub.feedbackAudio ? <VoiceCard a={sub.feedbackAudio} label={tr.t('voice.feedback')} /> : null}
        </View>
      )}
      {closed && !sub && <Text color={t.err}>{tr.t('errors.deadline_passed')}</Text>}
      <Input
        value={text}
        onChangeText={setText}
        editable={!locked && !closed}
        multiline
        placeholder={tr.t('school.assignment.yourWork')}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      <Files files={files} onRemove={!locked && !closed ? (i) => setFiles((x) => x.filter((_, k) => k !== i)) : undefined} />
      {!locked && !closed && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            small
            variant="outline"
            icon="attach"
            title={tr.t('school.assignment.addFile')}
            loading={busy}
            onPress={async () => {
              try {
                setBusy(true);
                const f = await attach();
                if (f) setFiles((x) => [...x, f].slice(0, 10));
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            small
            icon="checkmark"
            title={sub ? tr.t('common.save') : tr.t('school.assignment.turnIn')}
            loading={busy}
            disabled={!text.trim() && !files.length}
            onPress={async () => {
              setBusy(true);
              try {
                await api.school.submit(a.id, { text, attachments: files });
                toast(tr.t('school.assignment.submitted'));
                onChanged();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
          {sub && (
            <Button
              small
              variant="ghost"
              title={tr.t('school.assignment.unsubmit')}
              onPress={async () => {
                try {
                  await api.school.unsubmit(a.id);
                  onChanged();
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          )}
        </View>
      )}
    </Card>
  );
}

function GradeForm({ s, a, onSaved }: { s: SubmissionDto; a: AssignmentDto; onSaved: () => void }) {
  const tr = useT();
  const [grade, setGrade] = useState(s.grade !== null ? String(s.grade) : '');
  const [feedback, setFeedback] = useState(s.feedback);
  const [voice, setVoice] = useState<Attachment | null>(s.feedbackAudio);
  const [busy, setBusy] = useState(false);
  const save = async (returned: boolean) => {
    const g = Number(grade.replace(',', '.'));
    if (!Number.isFinite(g)) return;
    setBusy(true);
    try {
      await api.school.grade(s.id, { grade: Math.max(0, Math.min(a.points, g)), feedback: feedback.trim(), feedbackAudio: voice, returned });
      toast(tr.t('common.saved'));
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Input label={`${tr.t('school.assignment.gradeLabel')} (/${a.points})`} keyboardType="decimal-pad" value={grade} onChangeText={setGrade} />
      <Input label={tr.t('school.assignment.feedback')} value={feedback} onChangeText={setFeedback} multiline />
      <VoiceAttach value={voice} onChange={setVoice} purpose="assignment" label={tr.t('voice.feedbackByVoice')} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small variant="outline" title={tr.t('common.save')} loading={busy} disabled={!grade.trim()} onPress={() => void save(false)} />
        <Button small title={tr.t('school.assignment.return')} loading={busy} disabled={!grade.trim()} onPress={() => void save(true)} />
      </View>
    </View>
  );
}

function Submissions({ a }: { a: AssignmentDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['assignment', a.id, 'submissions'], queryFn: () => api.school.submissions(a.id) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <Text weight="black" size={17}>
        {tr.t('school.assignment.submissions')}
        {a.stats ? ` · ${tr.t('school.assignment.stats', { submitted: a.stats.submitted, total: a.stats.total })}` : ''}
      </Text>
      {q.isPending ? (
        <Loading />
      ) : !q.data?.items.length ? (
        <Empty icon="file-tray-outline" title={tr.t('common.empty')} />
      ) : (
        q.data.items.map((s) => (
          <Card key={s.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={s.student.displayName} url={s.student.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text weight="bold">{s.student.displayName}</Text>
                <Text muted size={12}>
                  {relativeTime(s.submittedAt, tr)}
                  {s.late ? ` · ${tr.t('school.assignment.late')}` : ''}
                </Text>
              </View>
              <Badge tone={s.grade !== null ? 'ok' : 'primary'} label={s.grade !== null ? `${s.grade}/${a.points}` : tr.t(`school.assignment.${s.status}`)} />
            </View>
            {s.text ? <Text>{s.text}</Text> : null}
            <Files files={s.attachments} />
            {open === s.id ? (
              <GradeForm
                s={s}
                a={a}
                onSaved={() => {
                  setOpen(null);
                  void q.refetch();
                }}
              />
            ) : (
              <Button small variant="soft" title={tr.t('school.assignment.gradeLabel')} onPress={() => setOpen(s.id)} />
            )}
          </Card>
        ))
      )}
    </View>
  );
}

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assignment', id], queryFn: () => api.school.assignment(id!) });
  const course = useQuery({ queryKey: ['course', q.data?.courseId], queryFn: () => api.school.get(q.data!.courseId), enabled: !!q.data });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const a = q.data;
  const staff = course.data?.myRole === 'teacher' || course.data?.myRole === 'assistant';
  return (
    <FeatureGate id="school">
      <Stack.Screen options={{ title: a.title }} />
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Card style={{ gap: 6 }}>
          <Text weight="black" size={20}>
            {a.title}
          </Text>
          <Text muted size={12}>
            {a.dueAt
              ? tr.t('school.assignment.dueAt', {
                  date: formatDay(a.dueAt, tr, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                })
              : tr.t('school.assignment.noDue')}{' '}
            · {tr.t('school.assignment.points')}: {a.points}
          </Text>
          {a.description ? <Text>{a.description}</Text> : null}
          <Files files={a.attachments} />
        </Card>
        {course.isPending ? (
          <Loading />
        ) : staff ? (
          <Submissions a={a} />
        ) : (
          <StudentPanel
            key={a.mySubmission?.id ?? 'new'}
            a={a}
            onChanged={() => {
              void q.refetch();
              void qc.invalidateQueries({ queryKey: ['course', a.courseId, 'assignments'] });
              void qc.invalidateQueries({ queryKey: ['dashboard'] });
            }}
          />
        )}
      </Screen>
    </FeatureGate>
  );
}
