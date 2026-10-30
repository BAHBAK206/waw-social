import { COMPONENT_SOURCES, round1, type ComponentSource, type CourseDto, type GradeRating, type ReportCardDto, type SubjectResult } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';
import { downloadCsv } from '@/lib/download';

const TONE: Record<GradeRating, string> = { excellent: 'badge-ok', veryGood: 'badge-ok', good: 'badge-info', pass: 'badge-warn', fail: 'badge-err' };
const fmt = (n: number) => String(round1(n));

export function RatingBadge({ rating }: { rating: GradeRating | null }) {
  const tr = useT();
  if (!rating) return <span className="badge">{tr.t('gradebook.notGraded')}</span>;
  return <span className={cx('badge', TONE[rating])}>{tr.t(`gradebook.ratings.${rating}`)}</span>;
}

/** "50 / 60 · 83.3% · Very good", with a note when only part of the term is graded. */
export function ResultLine({ result }: { result: SubjectResult }) {
  const tr = useT();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <b className="tabular-nums" dir="ltr">
        {tr.t('gradebook.outOf', { score: fmt(result.score), max: fmt(result.max) })}
      </b>
      {result.percent !== null && <span className="muted tabular-nums">{result.percent}%</span>}
      <RatingBadge rating={result.rating} />
      {!result.complete && result.percent !== null && (
        <span className="muted text-xs">{tr.t('gradebook.soFar', { graded: fmt(result.gradedMax), max: fmt(result.max) })}</span>
      )}
    </span>
  );
}

/** Teacher settings: subject code, total, pass mark, term, and how the total is split into parts. */
export function GradingSettings({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const g = course.grading;
  const [f, setF] = useState({
    subjectCode: g.subjectCode ?? '',
    maxMarks: g.maxMarks,
    passMarks: g.passMarks,
    term: g.term ?? '',
    countsInTotal: g.countsInTotal,
  });
  const comps = useQuery({ queryKey: ['course', course.id, 'components'], queryFn: () => api.school.components(course.id) });
  const [rows, setRows] = useState<{ id?: string; name: string; maxMarks: number; source: ComponentSource }[] | null>(null);
  const list =
    rows ?? comps.data?.items.filter((c) => c.id !== 'coursework').map((c) => ({ id: c.id, name: c.name, maxMarks: c.maxMarks, source: c.source })) ?? [];
  const used = round1(list.reduce((n, c) => n + (Number(c.maxMarks) || 0), 0));
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="text-lg font-black">{tr.t('gradebook.grading')}</h2>
        <p className="muted text-sm">{tr.t('gradebook.gradingHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={tr.t('gradebook.subjectCode')}
          value={f.subjectCode}
          maxLength={32}
          dir="ltr"
          onChange={(e) => setF({ ...f, subjectCode: e.target.value })}
        />
        <Input
          label={tr.t('gradebook.term')}
          placeholder={tr.t('gradebook.termPlaceholder')}
          value={f.term}
          maxLength={80}
          onChange={(e) => setF({ ...f, term: e.target.value })}
        />
        <Input
          type="number"
          min={1}
          max={1000}
          label={tr.t('gradebook.maxMarks')}
          value={f.maxMarks}
          onChange={(e) => setF({ ...f, maxMarks: Number(e.target.value) || 0 })}
        />
        <Input
          type="number"
          min={0}
          max={f.maxMarks}
          label={tr.t('gradebook.passMarks')}
          value={f.passMarks}
          onChange={(e) => setF({ ...f, passMarks: Number(e.target.value) || 0 })}
        />
      </div>
      <Switch checked={f.countsInTotal} onChange={(v) => setF({ ...f, countsInTotal: v })} label={tr.t('gradebook.countsInTotal')} />
      <p className="muted -mt-2 text-xs">{tr.t('gradebook.countsHint')}</p>

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-black">{tr.t('gradebook.components')}</h3>
        <p className="muted text-sm">{tr.t('gradebook.componentsHint')}</p>
        {list.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="grid grid-cols-[1fr_6rem_10rem_auto] items-end gap-2">
            <Input
              label={i === 0 ? tr.t('gradebook.componentName') : undefined}
              aria-label={tr.t('gradebook.componentName')}
              value={c.name}
              maxLength={80}
              onChange={(e) => setRows(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              type="number"
              min={0.5}
              label={i === 0 ? tr.t('gradebook.componentMarks') : undefined}
              aria-label={tr.t('gradebook.componentMarks')}
              value={c.maxMarks}
              onChange={(e) => setRows(list.map((x, j) => (j === i ? { ...x, maxMarks: Number(e.target.value) || 0 } : x)))}
            />
            <Select
              label={i === 0 ? tr.t('gradebook.source') : undefined}
              aria-label={tr.t('gradebook.source')}
              value={c.source}
              onChange={(e) => setRows(list.map((x, j) => (j === i ? { ...x, source: e.target.value as ComponentSource } : x)))}
              options={COMPONENT_SOURCES.map((s) => ({ value: s, label: tr.t(`gradebook.sources.${s}`) }))}
            />
            <IconButton label={tr.t('common.remove')} onClick={() => setRows(list.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="soft"
            icon={<Plus className="size-4" />}
            onClick={() => setRows([...list, { name: '', maxMarks: Math.max(1, round1(f.maxMarks - used)), source: 'manual' }])}
          >
            {tr.t('gradebook.addComponent')}
          </Button>
          <span className={cx('text-sm tabular-nums', used > f.maxMarks ? 'text-err' : 'muted')}>
            {used > f.maxMarks ? tr.t('gradebook.overTotal') : tr.t('gradebook.distributed', { used: fmt(used), total: fmt(f.maxMarks) })}
          </span>
        </div>
      </div>
      <Button
        icon={<Save className="size-4" />}
        loading={busy}
        disabled={f.passMarks > f.maxMarks || used > f.maxMarks || list.some((c) => !c.name.trim() || c.maxMarks <= 0)}
        onClick={async () => {
          setBusy(true);
          try {
            await api.school.update(course.id, {
              subjectCode: f.subjectCode.trim() || null,
              maxMarks: f.maxMarks,
              passMarks: f.passMarks,
              term: f.term.trim() || null,
              countsInTotal: f.countsInTotal,
            });
            await api.school.saveComponents(
              course.id,
              list.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name.trim(), maxMarks: c.maxMarks, source: c.source })),
            );
            setRows(null);
            void qc.invalidateQueries({ queryKey: qk.course(course.id) });
            void qc.invalidateQueries({ queryKey: ['course', course.id] });
            toast(tr.t('common.saved'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr.t('common.save')}
      </Button>
    </section>
  );
}

/** Staff view: students × parts, marks typed in for manual parts, totals out of the subject total. */
export function ClassGradebook({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'gradebook'], queryFn: () => api.school.gradebook(course.id) });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = Object.keys(edits).length > 0;
  return (
    <QueryState query={q}>
      {(d) => {
        const name = (c: { name: string }) => c.name || tr.t('gradebook.coursework');
        const exportCsv = () => {
          const head = [
            tr.t('school.roles.student'),
            ...d.components.map((c) => `${name(c)} (${c.maxMarks})`),
            `${tr.t('gradebook.total')} (${d.grading.maxMarks})`,
            '%',
            tr.t('gradebook.rating'),
          ];
          const lines = d.rows.map((r) => [
            r.student.displayName,
            ...d.components.map((c) => (r.marks[c.id] ?? '') as string | number),
            r.result.score,
            r.result.percent ?? '',
            r.result.rating ? tr.t(`gradebook.ratings.${r.result.rating}`) : '',
          ]);
          downloadCsv(`${d.grading.subjectCode || course.title}-grades.csv`, [head, ...lines]);
        };
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="muted min-w-0 flex-1 text-sm">
                {[d.grading.subjectCode, tr.t('gradebook.outOf', { score: tr.t('gradebook.total'), max: fmt(d.grading.maxMarks) }), d.grading.term]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!d.rows.length}>
                {tr.t('gradebook.export')}
              </Button>
              {dirty && (
                <Button
                  size="sm"
                  icon={<Save className="size-4" />}
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.school.saveMarks(
                        course.id,
                        Object.entries(edits).map(([key, v]) => {
                          const [componentId, studentId] = key.split(':') as [string, string];
                          return { componentId, studentId, marks: v.trim() === '' ? null : Number(v) };
                        }),
                      );
                      setEdits({});
                      await q.refetch();
                      toast(tr.t('gradebook.marksSaved'));
                    } catch (e) {
                      toastError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {tr.t('common.save')}
                </Button>
              )}
            </div>
            {d.componentsTotal !== d.grading.maxMarks && (
              <p className="badge badge-warn">{tr.t('gradebook.distributed', { used: fmt(d.componentsTotal), total: fmt(d.grading.maxMarks) })}</p>
            )}
            {!d.rows.length ? (
              <EmptyState title={tr.t('gradebook.noStudents')} />
            ) : (
              <div className="card scroll-thin overflow-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="bg-bg-2">
                    <tr>
                      <th className="sticky start-0 bg-bg-2 p-3 text-start">{tr.t('school.roles.student')}</th>
                      {d.components.map((c) => (
                        <th key={c.id} className="p-3 text-start">
                          {name(c)}
                          <span className="muted block text-xs">
                            /{fmt(c.maxMarks)} · {tr.t(`gradebook.sources.${c.source}`)}
                          </span>
                        </th>
                      ))}
                      <th className="p-3 text-start">
                        {tr.t('gradebook.total')}
                        <span className="muted block text-xs">/{fmt(d.grading.maxMarks)}</span>
                      </th>
                      <th className="p-3 text-start">{tr.t('gradebook.rating')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.student.id} className="border-t border-line">
                        <td className="sticky start-0 bg-card p-3 font-bold" dir="auto">
                          {r.student.displayName}
                        </td>
                        {d.components.map((c) => {
                          const key = `${c.id}:${r.student.id}`;
                          const v = r.marks[c.id];
                          return (
                            <td key={c.id} className="p-2 tabular-nums">
                              {c.source === 'manual' ? (
                                <input
                                  className="input w-20 py-1"
                                  type="number"
                                  min={0}
                                  max={c.maxMarks}
                                  step={0.5}
                                  aria-label={`${name(c)} — ${r.student.displayName}`}
                                  value={edits[key] ?? v ?? ''}
                                  onChange={(e) => setEdits({ ...edits, [key]: e.target.value })}
                                />
                              ) : v === null || v === undefined ? (
                                '—'
                              ) : (
                                fmt(v)
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 font-bold tabular-nums">
                          {fmt(r.result.score)}
                          {r.result.percent !== null && <span className="muted text-xs"> ({r.result.percent}%)</span>}
                        </td>
                        <td className="p-3">
                          <RatingBadge rating={r.result.rating} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted text-xs">{tr.t('gradebook.explain')}</p>
          </div>
        );
      }}
    </QueryState>
  );
}

function SubjectRow({ s }: { s: ReportCardDto['subjects'][number] }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <li className="card p-3">
      <button type="button" className="flex w-full flex-wrap items-center gap-3 text-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1">
          <b dir="auto">{s.title}</b>
          <span className="muted block text-xs">
            {[s.grading.subjectCode, tr.t('gradebook.teacher', { name: s.teacher }), !s.grading.countsInTotal && tr.t('gradebook.notCounted')]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <ResultLine result={s.result} />
        <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {s.components.map((c) => (
            <li key={c.id} className="flex justify-between gap-3">
              <span>{c.name || tr.t('gradebook.coursework')}</span>
              <span className="tabular-nums" dir="ltr">
                {c.earned === null ? '—' : fmt(c.earned)} / {fmt(c.maxMarks)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A student's report card (their own, or a linked child's for parents). */
export function ReportCard({ studentId, compact }: { studentId?: string; compact?: boolean }) {
  const tr = useT();
  const [term, setTerm] = useState('');
  const q = useQuery({
    queryKey: ['report-card', studentId ?? 'me', term],
    queryFn: () => api.school.reportCard({ ...(studentId ? { studentId } : {}), ...(term ? { term } : {}) }),
  });
  return (
    <QueryState query={q}>
      {(d) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {d.terms.length > 0 && (
              <Select
                label={tr.t('gradebook.term')}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                options={[{ value: '', label: tr.t('gradebook.allTerms') }, ...d.terms.map((t) => ({ value: t, label: t }))]}
              />
            )}
            <span className="flex-1" />
            {!compact && (
              <Button size="sm" variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                {tr.t('gradebook.print')}
              </Button>
            )}
          </div>
          {!d.subjects.length ? (
            <EmptyState title={tr.t('gradebook.noSubjects')} />
          ) : (
            <>
              <ul className="space-y-2">
                {d.subjects.map((s) => (
                  <SubjectRow key={s.courseId} s={s} />
                ))}
              </ul>
              <div className="card flex flex-wrap items-center gap-3 p-4">
                <b className="flex-1">{tr.t('gradebook.overall')}</b>
                <b className="tabular-nums" dir="ltr">
                  {tr.t('gradebook.outOf', { score: fmt(d.overall.score), max: fmt(d.overall.max) })}
                </b>
                {d.overall.percent !== null && <span className="muted tabular-nums">{d.overall.percent}%</span>}
                <RatingBadge rating={d.overall.rating} />
                <span className={cx('text-sm', d.overall.failed ? 'text-err' : 'muted')}>{tr.t('gradebook.failed', { count: d.overall.failed })}</span>
              </div>
            </>
          )}
          <p className="muted text-xs">{tr.t('gradebook.explain')}</p>
        </div>
      )}
    </QueryState>
  );
}

/** A student's own result in one class (shown in the class's Grades tab). */
export function MyCourseResult({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['report-card', 'me', ''], queryFn: () => api.school.reportCard() });
  const s = q.data?.subjects.find((x) => x.courseId === course.id);
  if (!s) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black">{tr.t('gradebook.myResult')}</h2>
      <ul>
        <SubjectRow s={s} />
      </ul>
      <p className="muted text-xs">{tr.t('gradebook.explain')}</p>
    </section>
  );
}
