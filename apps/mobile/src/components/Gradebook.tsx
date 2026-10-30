import { Ionicons } from '@expo/vector-icons';
import {
  COMPONENT_SOURCES,
  round1,
  type ComponentSource,
  type CourseDto,
  type GradeRating,
  type GradebookRowDto,
  type ReportCardDto,
  type SubjectResult,
} from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, SelectField, Sheet, SwitchRow } from './kit';
import { Avatar, Button, Card, Chip, Empty, Input, Loading, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

const TONE: Record<GradeRating, 'ok' | 'primary' | 'warn' | 'err'> = { excellent: 'ok', veryGood: 'ok', good: 'primary', pass: 'warn', fail: 'err' };
const fmt = (n: number) => String(round1(n));

export function RatingBadge({ rating }: { rating: GradeRating | null }) {
  const tr = useT();
  if (!rating) return <Badge label={tr.t('gradebook.notGraded')} />;
  return <Badge label={tr.t(`gradebook.ratings.${rating}`)} tone={TONE[rating]} />;
}

export function ResultLine({ result }: { result: SubjectResult }) {
  const tr = useT();
  return (
    <View style={{ gap: 2, alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text weight="black">{tr.t('gradebook.outOf', { score: fmt(result.score), max: fmt(result.max) })}</Text>
        <RatingBadge rating={result.rating} />
      </View>
      {result.percent !== null ? (
        <Text muted size={11}>
          {result.percent}%{!result.complete ? ` · ${tr.t('gradebook.soFar', { graded: fmt(result.gradedMax), max: fmt(result.max) })}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

/** Teacher: subject code, total, pass mark, term, and how the total is split. */
export function GradingSettingsSheet({ course, open, onClose }: { course: CourseDto; open: boolean; onClose: () => void }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const g = course.grading;
  const [f, setF] = useState({
    subjectCode: g.subjectCode ?? '',
    maxMarks: String(g.maxMarks),
    passMarks: String(g.passMarks),
    term: g.term ?? '',
    countsInTotal: g.countsInTotal,
  });
  const comps = useQuery({ queryKey: ['course', course.id, 'components'], queryFn: () => api.school.components(course.id), enabled: open });
  const [rows, setRows] = useState<{ id?: string; name: string; maxMarks: string; source: ComponentSource }[] | null>(null);
  const list =
    rows ??
    comps.data?.items.filter((c) => c.id !== 'coursework').map((c) => ({ id: c.id, name: c.name, maxMarks: String(c.maxMarks), source: c.source })) ??
    [];
  const max = Number(f.maxMarks) || 0;
  const used = round1(list.reduce((n, c) => n + (Number(c.maxMarks) || 0), 0));
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr.t('gradebook.grading')}
      footer={
        <Button
          title={tr.t('common.save')}
          loading={busy}
          disabled={max <= 0 || Number(f.passMarks) > max || used > max || list.some((c) => !c.name.trim() || !(Number(c.maxMarks) > 0))}
          onPress={async () => {
            setBusy(true);
            try {
              await api.school.update(course.id, {
                subjectCode: f.subjectCode.trim() || null,
                maxMarks: max,
                passMarks: Number(f.passMarks) || 0,
                term: f.term.trim() || null,
                countsInTotal: f.countsInTotal,
              });
              await api.school.saveComponents(
                course.id,
                list.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name.trim(), maxMarks: Number(c.maxMarks), source: c.source })),
              );
              setRows(null);
              await qc.invalidateQueries({ queryKey: ['course', course.id] });
              toast(tr.t('common.saved'));
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <Text muted size={13}>
        {tr.t('gradebook.gradingHint')}
      </Text>
      <Input
        label={tr.t('gradebook.subjectCode')}
        value={f.subjectCode}
        onChangeText={(v) => setF({ ...f, subjectCode: v })}
        maxLength={32}
        autoCapitalize="characters"
      />
      <Input
        label={tr.t('gradebook.term')}
        placeholder={tr.t('gradebook.termPlaceholder')}
        value={f.term}
        onChangeText={(v) => setF({ ...f, term: v })}
        maxLength={80}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input label={tr.t('gradebook.maxMarks')} keyboardType="decimal-pad" value={f.maxMarks} onChangeText={(v) => setF({ ...f, maxMarks: v })} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label={tr.t('gradebook.passMarks')} keyboardType="decimal-pad" value={f.passMarks} onChangeText={(v) => setF({ ...f, passMarks: v })} />
        </View>
      </View>
      <SwitchRow label={tr.t('gradebook.countsInTotal')} value={f.countsInTotal} onChange={(v) => setF({ ...f, countsInTotal: v })} />
      <Text muted size={12}>
        {tr.t('gradebook.countsHint')}
      </Text>
      <Text weight="black">{tr.t('gradebook.components')}</Text>
      <Text muted size={12}>
        {tr.t('gradebook.componentsHint')}
      </Text>
      {list.map((c, i) => (
        <Card key={c.id ?? `new-${i}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 2 }}>
              <Input
                label={tr.t('gradebook.componentName')}
                value={c.name}
                maxLength={80}
                onChangeText={(v) => setRows(list.map((x, j) => (j === i ? { ...x, name: v } : x)))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={tr.t('gradebook.componentMarks')}
                keyboardType="decimal-pad"
                value={c.maxMarks}
                onChangeText={(v) => setRows(list.map((x, j) => (j === i ? { ...x, maxMarks: v } : x)))}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr.t('common.remove')}
              hitSlop={8}
              onPress={() => setRows(list.filter((_, j) => j !== i))}
              style={{ paddingBottom: 14 }}
            >
              <Ionicons name="trash-outline" size={20} color={t.err} />
            </Pressable>
          </View>
          <SelectField
            label={tr.t('gradebook.source')}
            value={c.source}
            onChange={(v) => v && setRows(list.map((x, j) => (j === i ? { ...x, source: v } : x)))}
            options={COMPONENT_SOURCES.map((s) => ({ value: s, label: tr.t(`gradebook.sources.${s}`) }))}
          />
        </Card>
      ))}
      <Button
        small
        variant="soft"
        icon="add"
        title={tr.t('gradebook.addComponent')}
        onPress={() => setRows([...list, { name: '', maxMarks: String(Math.max(1, round1(max - used))), source: 'manual' }])}
      />
      <Text size={12} color={used > max ? t.err : t.text3}>
        {used > max ? tr.t('gradebook.overTotal') : tr.t('gradebook.distributed', { used: fmt(used), total: fmt(max) })}
      </Text>
    </Sheet>
  );
}

function StudentMarksSheet({
  course,
  row,
  components,
  onClose,
  onSaved,
}: {
  course: CourseDto;
  row: GradebookRowDto | null;
  components: { id: string; name: string; maxMarks: number; source: ComponentSource }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useT();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const manual = components.filter((c) => c.source === 'manual');
  return (
    <Sheet
      open
      onClose={onClose}
      title={row.student.displayName}
      footer={
        manual.length ? (
          <Button
            title={tr.t('common.save')}
            loading={busy}
            disabled={!Object.keys(edits).length}
            onPress={async () => {
              setBusy(true);
              try {
                await api.school.saveMarks(
                  course.id,
                  Object.entries(edits).map(([componentId, v]) => ({ componentId, studentId: row.student.id, marks: v.trim() === '' ? null : Number(v) })),
                );
                toast(tr.t('gradebook.marksSaved'));
                onSaved();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : undefined
      }
    >
      <ResultLine result={row.result} />
      {components.map((c) => {
        const v = row.marks[c.id];
        return c.source === 'manual' ? (
          <Input
            key={c.id}
            label={`${c.name} (/${fmt(c.maxMarks)})`}
            keyboardType="decimal-pad"
            value={edits[c.id] ?? (v === null || v === undefined ? '' : String(v))}
            onChangeText={(x) => setEdits({ ...edits, [c.id]: x })}
          />
        ) : (
          <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>
              {c.name || tr.t('gradebook.coursework')} · {tr.t(`gradebook.sources.${c.source}`)}
            </Text>
            <Text weight="bold">
              {v === null || v === undefined ? '—' : fmt(v)} / {fmt(c.maxMarks)}
            </Text>
          </View>
        );
      })}
      <Text muted size={12}>
        {tr.t('gradebook.explain')}
      </Text>
    </Sheet>
  );
}

/** Staff: one card per student with the subject total; tap to see parts and type marks. */
export function ClassGradebook({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'gradebook'], queryFn: () => api.school.gradebook(course.id) });
  const [settings, setSettings] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  const d = q.data;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text muted size={12} style={{ flex: 1 }}>
          {[d?.grading.subjectCode, d ? tr.t('gradebook.outOf', { score: tr.t('gradebook.total'), max: fmt(d.grading.maxMarks) }) : null, d?.grading.term]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {course.myRole === 'teacher' ? (
          <Button small variant="soft" icon="options-outline" title={tr.t('gradebook.grading')} onPress={() => setSettings(true)} />
        ) : null}
      </View>
      {d && d.componentsTotal !== d.grading.maxMarks ? (
        <Badge tone="warn" label={tr.t('gradebook.distributed', { used: fmt(d.componentsTotal), total: fmt(d.grading.maxMarks) })} />
      ) : null}
      {!d?.rows.length ? <Empty icon="school-outline" title={tr.t('gradebook.noStudents')} /> : null}
      {d?.rows.map((r) => (
        <Card key={r.student.id} onPress={() => setOpen(r.student.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={r.student.displayName} url={r.student.avatarUrl} size={34} />
          <Text weight="bold" style={{ flex: 1 }} numberOfLines={1}>
            {r.student.displayName}
          </Text>
          <ResultLine result={r.result} />
        </Card>
      ))}
      {course.myRole === 'teacher' ? <GradingSettingsSheet course={course} open={settings} onClose={() => setSettings(false)} /> : null}
      {d && open ? (
        <StudentMarksSheet
          course={course}
          row={d.rows.find((r) => r.student.id === open) ?? null}
          components={d.components.map((c) => ({ ...c, name: c.name || tr.t('gradebook.coursework') }))}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void q.refetch();
          }}
        />
      ) : null}
    </View>
  );
}

function SubjectCard({ s }: { s: ReportCardDto['subjects'][number] }) {
  const tr = useT();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card onPress={() => setOpen(!open)} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text weight="bold">{s.title}</Text>
          <Text muted size={11}>
            {[s.grading.subjectCode, tr.t('gradebook.teacher', { name: s.teacher }), !s.grading.countsInTotal && tr.t('gradebook.notCounted')]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <ResultLine result={s.result} />
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.text3} />
      </View>
      {open
        ? s.components.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.border, paddingTop: 6 }}>
              <Text size={13}>{c.name || tr.t('gradebook.coursework')}</Text>
              <Text size={13} weight="bold">
                {c.earned === null ? '—' : fmt(c.earned)} / {fmt(c.maxMarks)}
              </Text>
            </View>
          ))
        : null}
    </Card>
  );
}

/** Report card for the signed-in student, or a linked child (parents). */
export function ReportCard({ studentId }: { studentId?: string }) {
  const tr = useT();
  const t = useTheme();
  const [term, setTerm] = useState('');
  const q = useQuery({
    queryKey: ['report-card', studentId ?? 'me', term],
    queryFn: () => api.school.reportCard({ ...(studentId ? { studentId } : {}), ...(term ? { term } : {}) }),
  });
  if (q.isPending) return <Loading />;
  const d = q.data;
  if (!d) return null;
  return (
    <View style={{ gap: 8 }}>
      {d.terms.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={tr.t('gradebook.allTerms')} active={!term} onPress={() => setTerm('')} />
          {d.terms.map((x) => (
            <Chip key={x} label={x} active={term === x} onPress={() => setTerm(x)} />
          ))}
        </View>
      ) : null}
      {!d.subjects.length ? <Empty icon="ribbon-outline" title={tr.t('gradebook.noSubjects')} /> : null}
      {d.subjects.map((s) => (
        <SubjectCard key={s.courseId} s={s} />
      ))}
      {d.subjects.length ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text weight="black" style={{ flex: 1 }}>
              {tr.t('gradebook.overall')}
            </Text>
            <Text weight="black">{tr.t('gradebook.outOf', { score: fmt(d.overall.score), max: fmt(d.overall.max) })}</Text>
            <RatingBadge rating={d.overall.rating} />
          </View>
          <Text size={12} color={d.overall.failed ? t.err : t.text3}>
            {d.overall.percent !== null ? `${d.overall.percent}% · ` : ''}
            {tr.t('gradebook.failed', { count: d.overall.failed })}
          </Text>
        </Card>
      ) : null}
      <Text muted size={12}>
        {tr.t('gradebook.explain')}
      </Text>
    </View>
  );
}

/** A student's own result in one class. */
export function MyCourseResult({ courseId }: { courseId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['report-card', 'me', ''], queryFn: () => api.school.reportCard() });
  const s = q.data?.subjects.find((x) => x.courseId === courseId);
  if (!s) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text weight="black">{tr.t('gradebook.myResult')}</Text>
      <SubjectCard s={s} />
    </View>
  );
}
