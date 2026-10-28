import type { AssignmentDto, Attachment } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Files } from '@/components/Files';
import { VoiceAttach } from '@/components/Voice';
import { Screen } from '@/components/Screen';
import { CourseInsightsTab } from '@/components/Family';
import { RosterImport } from '@/components/Roster';
import { ClassGradebook, MyCourseResult } from '@/components/Gradebook';
import { Badge, DateField, FeatureGate, Row, Segmented, Sheet, SwitchRow } from '@/components/kit';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDay, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Tab = 'stream' | 'assignments' | 'people' | 'grades' | 'materials' | 'insights';

function Stream({ courseId, staff }: { courseId: string; staff: boolean }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', courseId, 'announcements'], queryFn: () => api.school.announcements(courseId) });
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      {staff && (
        <Card style={{ gap: 8 }}>
          <Input value={text} onChangeText={setText} placeholder={tr.t('school.announce')} multiline />
          <VoiceAttach value={voice} onChange={setVoice} purpose="course" label={tr.t('voice.announceByVoice')} />
          <Button
            small
            title={tr.t('feed.post')}
            loading={busy}
            disabled={!text.trim() && !voice}
            onPress={async () => {
              setBusy(true);
              try {
                await api.school.announce(courseId, { text: text.trim(), attachments: voice ? [voice] : [] });
                setText('');
                setVoice(null);
                await q.refetch();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      )}
      {q.isPending ? (
        <Loading />
      ) : !q.data?.items.length ? (
        <Empty icon="megaphone-outline" title={tr.t('common.empty')} />
      ) : (
        q.data.items.map((a) => (
          <Card key={a.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={a.author.displayName} url={a.author.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text weight="bold">{a.author.displayName}</Text>
                <Text muted size={12}>
                  {relativeTime(a.createdAt, tr)}
                </Text>
              </View>
            </View>
            {a.text ? <Text>{a.text}</Text> : null}
            <Files files={a.attachments} />
          </Card>
        ))
      )}
    </View>
  );
}

function statusOf(a: AssignmentDto) {
  const s = a.mySubmission;
  if (s) return s.status;
  if (a.dueAt && a.dueAt < Date.now()) return 'missing';
  return null;
}

function Classwork({ courseId, staff }: { courseId: string; staff: boolean }) {
  const tr = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ['course', courseId, 'assignments'], queryFn: () => api.school.assignments(courseId) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', points: '100', dueDay: '', dueTime: '23:59', allowLate: true });
  const [voice, setVoice] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const dueAt = form.dueDay ? new Date(`${form.dueDay}T${form.dueTime || '23:59'}:00`).getTime() : null;
      const a = await api.school.createAssignment(courseId, {
        title: form.title.trim(),
        description: form.description.trim(),
        points: Math.max(1, Math.min(1000, Number(form.points) || 100)),
        dueAt,
        allowLate: form.allowLate,
        state: 'published',
        attachments: voice ? [voice] : [],
      });
      setVoice(null);
      setOpen(false);
      setForm({ title: '', description: '', points: '100', dueDay: '', dueTime: '23:59', allowLate: true });
      await q.refetch();
      router.push(`/assignment/${a.id}` as never);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {staff && <Button icon="add" title={tr.t('school.assignment.new')} onPress={() => setOpen(true)} />}
      {q.isPending ? (
        <Loading />
      ) : !q.data?.items.length ? (
        <Empty icon="document-text-outline" title={tr.t('common.empty')} />
      ) : (
        q.data.items.map((a) => {
          const st = statusOf(a);
          return (
            <Row
              key={a.id}
              icon="document-text-outline"
              title={a.title}
              subtitle={[
                a.dueAt
                  ? tr.t('school.assignment.dueAt', { date: formatDay(a.dueAt, tr, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
                  : tr.t('school.assignment.noDue'),
                staff && a.stats ? tr.t('school.assignment.stats', { submitted: a.stats.submitted, total: a.stats.total }) : '',
                a.mySubmission?.grade != null ? `${a.mySubmission.grade}/${a.points}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                st ? (
                  <Badge label={tr.t(`school.assignment.${st}`)} tone={st === 'missing' ? 'err' : st === 'graded' || st === 'returned' ? 'ok' : 'primary'} />
                ) : undefined
              }
              onPress={() => router.push(`/assignment/${a.id}` as never)}
            />
          );
        })
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('school.assignment.new')}
        footer={<Button title={tr.t('common.create')} loading={busy} disabled={!form.title.trim()} onPress={() => void create()} />}
      >
        <Input label={tr.t('school.assignment.title')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <Input
          label={tr.t('school.assignment.instructions')}
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />
        <VoiceAttach value={voice} onChange={setVoice} purpose="course" label={tr.t('voice.explainByVoice')} />
        <Input
          label={tr.t('school.assignment.points')}
          keyboardType="number-pad"
          value={form.points}
          onChangeText={(v) => setForm({ ...form, points: v.replace(/\D/g, '') })}
        />
        <DateField label={tr.t('school.assignment.due')} value={form.dueDay} onChange={(v) => setForm({ ...form, dueDay: v })} />
        {!!form.dueDay && <DateField label={tr.t('common.time')} mode="time" value={form.dueTime} onChange={(v) => setForm({ ...form, dueTime: v })} />}
        <SwitchRow label={tr.t('school.assignment.allowLate')} value={form.allowLate} onChange={(v) => setForm({ ...form, allowLate: v })} />
      </Sheet>
    </View>
  );
}

function People({ courseId, staff }: { courseId: string; staff: boolean }) {
  const tr = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ['course', courseId, 'members'], queryFn: () => api.school.members(courseId) });
  if (q.isPending) return <Loading />;
  return (
    <View style={{ gap: 8 }}>
      {staff ? (
        <View style={{ alignItems: 'flex-end' }}>
          <RosterImport courseId={courseId} />
        </View>
      ) : null}
      {(q.data?.items ?? []).map((m) => (
        <Card key={m.user.id} onPress={() => router.push(`/user/${m.user.id}` as never)} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={m.user.displayName} url={m.user.avatarUrl} size={36} />
            <Text weight="bold" style={{ flex: 1 }}>
              {m.user.displayName}
            </Text>
            <Badge label={tr.t(`school.roles.${m.role}`)} tone={m.role === 'teacher' ? 'primary' : 'neutral'} />
          </View>
          {staff && m.role !== 'teacher' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                small
                variant="ghost"
                icon="swap-horizontal-outline"
                title={m.role === 'assistant' ? tr.t('school.roles.student') : tr.t('school.roles.assistant')}
                onPress={async () => {
                  try {
                    await api.school.setMemberRole(courseId, m.user.id, m.role === 'assistant' ? 'student' : 'assistant');
                    await q.refetch();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
              <Button
                small
                variant="ghost"
                icon="trash-outline"
                title={tr.t('common.remove')}
                onPress={async () => {
                  if (!(await confirm(tr.t('common.confirmTitle'), { danger: true }))) return;
                  try {
                    await api.school.removeMember(courseId, m.user.id);
                    await q.refetch();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

function Grades({ courseId, staff }: { courseId: string; staff: boolean }) {
  const tr = useT();
  const t = useTheme();
  const mine = useQuery({ queryKey: ['course', courseId, 'assignments'], queryFn: () => api.school.assignments(courseId), enabled: !staff });
  const all = useQuery({ queryKey: ['course', courseId, 'grades'], queryFn: () => api.school.grades(courseId), enabled: staff });
  if (staff) {
    if (all.isPending) return <Loading />;
    const d = all.data;
    if (!d?.rows.length) return <Empty icon="school-outline" title={tr.t('common.empty')} />;
    return (
      <View style={{ gap: 8 }}>
        {d.rows.map((r) => {
          const graded = d.assignments.map((a) => ({ a, g: r.grades[a.id] })).filter((x) => x.g?.grade != null);
          const avg = graded.length ? Math.round((graded.reduce((n, x) => n + x.g!.grade! / x.a.points, 0) / graded.length) * 100) : null;
          const missing = d.assignments.filter((a) => !r.grades[a.id] && a.dueAt && a.dueAt < Date.now()).length;
          return (
            <Card key={r.student.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={r.student.displayName} url={r.student.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text weight="bold">{r.student.displayName}</Text>
                <Text muted size={12}>
                  {graded.length}/{d.assignments.length} {tr.t('school.assignment.graded')}
                  {missing ? ` · ${missing} ${tr.t('school.assignment.missing')}` : ''}
                </Text>
              </View>
              <Text weight="black" color={avg === null ? t.text3 : avg >= 50 ? t.ok : t.err}>
                {avg === null ? '—' : `${avg}%`}
              </Text>
            </Card>
          );
        })}
      </View>
    );
  }
  if (mine.isPending) return <Loading />;
  const items = (mine.data?.items ?? []).filter((a) => a.mySubmission?.grade != null);
  if (!items.length) return <Empty icon="school-outline" title={tr.t('common.empty')} />;
  return (
    <View style={{ gap: 8 }}>
      {items.map((a) => (
        <Card key={a.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text weight="bold" style={{ flex: 1 }}>
              {a.title}
            </Text>
            <Text weight="black">
              {a.mySubmission!.grade}/{a.points}
            </Text>
          </View>
          {a.mySubmission!.feedback ? <Text muted>{a.mySubmission!.feedback}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

function Materials({ courseId }: { courseId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', courseId, 'materials'], queryFn: () => api.school.materials(courseId) });
  if (q.isPending) return <Loading />;
  if (!q.data?.items.length) return <Empty icon="folder-open-outline" title={tr.t('common.empty')} />;
  return (
    <View style={{ gap: 8 }}>
      {q.data.items.map((m) => (
        <Card key={m.id} style={{ gap: 6 }}>
          <Text weight="bold">{m.title}</Text>
          <Text muted size={12}>
            {m.topic ? `${m.topic} · ` : ''}
            {tr.t('school.materials.chunks', { count: m.chunkCount })}
          </Text>
          {m.fileUrl ? <Files files={[{ url: m.fileUrl, name: m.title, mime: 'application/octet-stream', size: 0, kind: 'file' }]} /> : null}
        </Card>
      ))}
    </View>
  );
}

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const q = useQuery({ queryKey: ['course', id], queryFn: () => api.school.get(id!) });
  const [tab, setTab] = useState<Tab>('stream');
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const c = q.data;
  const staff = c.myRole === 'teacher' || c.myRole === 'assistant';
  return (
    <FeatureGate id="school">
      <Stack.Screen options={{ title: c.title }} />
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Card style={{ gap: 6, borderTopWidth: 4, borderTopColor: c.color ?? t.primary }}>
          <Text weight="black" size={20}>
            {c.title}
          </Text>
          {c.description ? <Text muted>{c.description}</Text> : null}
          {staff && c.joinCode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text weight="bold">
                {tr.t('school.code')}: <Text weight="black">{c.joinCode}</Text>
              </Text>
              <Button
                small
                variant="ghost"
                icon="copy-outline"
                title={tr.t('school.copyCode')}
                onPress={async () => {
                  await Clipboard.setStringAsync(c.joinCode!);
                  toast(tr.t('common.copied'));
                }}
              />
            </View>
          )}
        </Card>
        <Segmented
          tabs={(staff
            ? (['stream', 'assignments', 'people', 'grades', 'materials', 'insights'] as const)
            : (['stream', 'assignments', 'people', 'grades', 'materials'] as const)
          ).map((k) => ({ key: k, label: tr.t(`school.tabs.${k}`) }))}
          value={tab}
          onChange={setTab}
        />
        {tab === 'stream' && <Stream courseId={c.id} staff={staff} />}
        {tab === 'assignments' && <Classwork courseId={c.id} staff={staff} />}
        {tab === 'people' && <People courseId={c.id} staff={staff} />}
        {tab === 'grades' &&
          (staff ? (
            <ClassGradebook course={c} />
          ) : (
            <View style={{ gap: 12 }}>
              <MyCourseResult courseId={c.id} />
              <Grades courseId={c.id} staff={false} />
            </View>
          ))}
        {tab === 'materials' && <Materials courseId={c.id} />}
        {tab === 'insights' && staff && <CourseInsightsTab courseId={c.id} />}
      </Screen>
    </FeatureGate>
  );
}
