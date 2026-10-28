import { Ionicons } from '@expo/vector-icons';
import type { ChildReportDto, RiskLevel, RiskReason, StudentInsightDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { formatDay, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';
import { Badge, Sheet } from './kit';
import { Avatar, Button, Card, Empty, Input, Loading, Text } from './ui';

export function RiskBadge({ level }: { level: RiskLevel }) {
  const tr = useT();
  return <Badge label={tr.t(`insights.level.${level}`)} tone={level === 'high' ? 'err' : level === 'watch' ? 'warn' : 'ok'} />;
}

export function Reasons({ reasons }: { reasons: RiskReason[] }) {
  const tr = useT();
  if (!reasons.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {reasons.map((r) => (
        <Badge key={r} label={tr.t(`insights.reason.${r}`)} />
      ))}
    </View>
  );
}

/** For students: a one-time code for a parent, and the parents who follow them. */
export function FamilyCodeCard() {
  const tr = useT();
  const qc = useQueryClient();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('family.studentTitle')}</Text>
      <Text muted size={13}>
        {tr.t('family.studentHint')}
      </Text>
      <Button
        small
        variant="soft"
        icon="key-outline"
        title={tr.t('family.makeCode')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            setCode((await api.family.code()).code);
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      {code ? (
        <Text weight="black" size={26} selectable style={{ letterSpacing: 6, textAlign: 'center' }}>
          {code}
        </Text>
      ) : null}
      {fam.data && !fam.data.guardians.length ? (
        <Text muted size={13}>
          {tr.t('family.noGuardians')}
        </Text>
      ) : null}
      {fam.data?.guardians.map((g) => (
        <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={g.displayName} url={g.avatarUrl} size={32} />
          <Text style={{ flex: 1 }}>{g.displayName}</Text>
          <Button
            small
            variant="ghost"
            icon="trash-outline"
            title={tr.t('family.remove')}
            onPress={async () => {
              try {
                await api.family.unlink(g.id);
                await qc.invalidateQueries({ queryKey: ['family'] });
              } catch (e) {
                toastError(e);
              }
            }}
          />
        </View>
      ))}
    </Card>
  );
}

function Bars({ days }: { days: ChildReportDto['days'] }) {
  const t = useTheme();
  const max = Math.max(30, ...days.map((d) => d.minutes));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 90 }}>
      {days.map((d) => (
        <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityLabel={`${d.day}: ${d.minutes}`}>
          <View style={{ width: '100%', height: Math.max(2, (d.minutes / max) * 70), backgroundColor: d.minutes ? t.primary : t.border, borderRadius: 4 }} />
          <Text size={9} muted>
            {d.day.slice(8)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ChildReport({ report }: { report: ChildReportDto }) {
  const tr = useT();
  const t = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={report.child.displayName} url={report.child.avatarUrl} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="black" size={17}>
              {report.child.displayName}
            </Text>
            <Text muted size={12}>
              🔥 {tr.t('family.streak', { count: report.streak })} · {tr.t('family.level', { level: report.level })}
            </Text>
          </View>
          <RiskBadge level={report.risk.level} />
        </View>
        <Reasons reasons={report.risk.reasons} />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text weight="bold">{tr.t('family.studyChart')}</Text>
        <Bars days={report.days} />
      </Card>
      <Card style={{ gap: 6 }}>
        <Text weight="bold">{tr.t('family.quizzes')}</Text>
        {!report.quizzes.length ? <Text muted>{tr.t('family.noQuizzes')}</Text> : null}
        {report.quizzes.map((q, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {q.title}
            </Text>
            <Badge label={`${q.pct}%`} tone={q.pct >= 75 ? 'ok' : q.pct >= 50 ? 'warn' : 'err'} />
            <Text muted size={11}>
              {relativeTime(q.at, tr)}
            </Text>
          </View>
        ))}
      </Card>
      <Text weight="black">{tr.t('family.courses')}</Text>
      {report.courses.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <Text weight="bold">{c.title}</Text>
          <Text muted size={12}>
            {c.teacher ? `${tr.t('family.teacher', { name: c.teacher })} · ` : ''}
            {tr.t('family.attendance', c.attendance)}
          </Text>
          {c.assignments.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text size={14}>{a.title}</Text>
                {a.dueAt ? (
                  <Text muted size={11}>
                    {tr.t('family.due', { date: formatDay(a.dueAt, tr) })}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={`${tr.t(`family.status.${a.status}`)}${a.grade !== null ? ` · ${a.grade}/${a.points}` : ''}`}
                tone={a.status === 'missing' ? 'err' : a.status === 'graded' ? 'ok' : a.status === 'submitted' ? 'primary' : 'neutral'}
              />
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

/** A student row for teachers: risk, reasons, numbers, encourage / message. */
export function InsightCard({ row, courseId, extra }: { row: StudentInsightDto; courseId?: string; extra?: string }) {
  const tr = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const s = row.signals;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={row.student.displayName} url={row.student.avatarUrl} size={36} />
        <Text weight="bold" style={{ flex: 1 }}>
          {row.student.displayName}
        </Text>
        <RiskBadge level={row.risk.level} />
      </View>
      {extra ? (
        <Text muted size={12}>
          {extra}
        </Text>
      ) : null}
      <Reasons reasons={row.risk.reasons} />
      <Text muted size={12}>
        {row.lastSeenAt ? tr.t('insights.lastSeen', { time: relativeTime(row.lastSeenAt, tr) }) : tr.t('insights.never')} ·{' '}
        {tr.t('insights.minutes', { minutes: s.minutesThisWeek })}
        {s.missing > 0 ? ` · ${tr.t('insights.missing', { count: s.missing })}` : ''}
        {s.gradeAvg !== null ? ` · ${tr.t('insights.grade', { pct: s.gradeAvg })}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {courseId ? <Button small variant="soft" icon="heart-outline" title={tr.t('insights.nudge')} onPress={() => setOpen(true)} /> : null}
        <Button
          small
          variant="outline"
          icon="chatbubble-outline"
          title={tr.t('insights.message')}
          onPress={async () => {
            try {
              const conv = await api.chat.direct(row.student.id);
              router.push(`/chat/${conv.id}` as never);
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </View>
      {courseId ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={tr.t('insights.nudgeTitle', { name: row.student.displayName })}
          footer={
            <Button
              title={tr.t('common.send')}
              loading={busy}
              disabled={!message.trim()}
              onPress={async () => {
                setBusy(true);
                try {
                  await api.school.nudge(courseId, row.student.id, message.trim());
                  toast(tr.t('insights.nudgeSent'));
                  setOpen(false);
                  setMessage('');
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          }
        >
          <Input label={tr.t('insights.message')} value={message} onChangeText={setMessage} maxLength={500} multiline />
        </Sheet>
      ) : null}
    </Card>
  );
}

export function CourseInsightsTab({ courseId }: { courseId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course-insights', courseId], queryFn: () => api.school.insights(courseId) });
  if (q.isPending) return <Loading />;
  if (!q.data) return null;
  const needs = q.data.students.some((s) => s.risk.level !== 'ok');
  return (
    <View style={{ gap: 10 }}>
      <Text muted size={13}>
        {tr.t('insights.subtitle')}
      </Text>
      {!needs ? <Empty icon="happy-outline" title={tr.t('insights.allGood')} /> : null}
      {q.data.students.map((s) => (
        <InsightCard key={s.student.id} row={s} courseId={courseId} />
      ))}
    </View>
  );
}

/** Teachers: students across their classes who need attention. */
export function AtRiskList({ limit }: { limit?: number }) {
  const tr = useT();
  const t = useTheme();
  const q = useQuery({ queryKey: ['at-risk'], queryFn: () => api.school.atRisk(), staleTime: 5 * 60_000 });
  if (!q.data?.items.length) return null;
  const items = limit ? q.data.items.slice(0, limit) : q.data.items;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="alert-circle-outline" size={18} color={t.warn} />
        <Text weight="black">{tr.t('insights.dashboard', { count: q.data.items.length })}</Text>
      </View>
      {items.map((r) => (
        <InsightCard key={r.student.id} row={r} extra={r.courses.join(' · ')} />
      ))}
    </View>
  );
}

export async function confirmUnlink(name: string) {
  const { currentT } = await import('@/lib/i18n');
  return confirm(currentT().t('family.unlinkConfirm', { name }), { danger: true });
}
