import type { ClassComparisonDto, CourseDto, LessonPlanDto, PaperGradeDto, WorksheetDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPen, Plus, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CurriculumPicker } from '@/components/curriculum/CurriculumPicker';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { useUpload } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const TABS = ['plan', 'paper', 'compare', 'worksheet', 'templates', 'comments'] as const;

function useCourses() {
  return useQuery({ queryKey: ['teacher-courses'], queryFn: () => api.school.courses(false) });
}
const staffOf = (courses: CourseDto[]) => courses.filter((c) => c.myRole === 'teacher' || c.myRole === 'assistant');

function CourseAndStudent({
  courseId,
  studentId,
  setCourse,
  setStudent,
}: {
  courseId: string;
  studentId: string;
  setCourse: (v: string) => void;
  setStudent: (v: string) => void;
}) {
  const tr = useT();
  const courses = useCourses();
  const members = useQuery({ queryKey: ['course-members', courseId], queryFn: () => api.school.members(courseId), enabled: !!courseId });
  const students = members.data?.items.filter((m) => m.role === 'student') ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={tr.t('teacherTools.paper.class')}
        value={courseId}
        onChange={(e) => {
          setCourse(e.target.value);
          setStudent('');
        }}
        options={[{ value: '', label: '—' }, ...staffOf(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))]}
      />
      <Select
        label={tr.t('teacherTools.paper.student')}
        value={studentId}
        disabled={!courseId}
        onChange={(e) => setStudent(e.target.value)}
        options={[{ value: '', label: '—' }, ...students.map((s) => ({ value: s.user.id, label: s.user.displayName }))]}
      />
    </div>
  );
}

/* ───────── Lesson plan ───────── */
function Plan() {
  const tr = useT();
  const [objective, setObjective] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(45);
  const make = useMutation({ mutationFn: () => api.teacherTools.lessonPlan(objective!, minutes), onError: toastError });
  const p: LessonPlanDto | undefined = make.data;
  return (
    <div className="space-y-4">
      <div className="card grid items-end gap-3 p-4 sm:grid-cols-[1fr_10rem_auto] print:hidden">
        <CurriculumPicker label={tr.t('teacherTools.plan.objective')} kinds={['objective']} value={objective} onChange={setObjective} />
        <Input
          type="number"
          min={20}
          max={180}
          label={tr.t('teacherTools.plan.minutes')}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          dir="ltr"
        />
        <Button loading={make.isPending} disabled={!objective} onClick={() => make.mutate()}>
          {tr.t('teacherTools.plan.make')}
        </Button>
      </div>
      {p && (
        <article className="card space-y-4 p-5">
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="muted text-sm" dir="auto">
                {p.path.join(' › ')}
              </p>
              <h2 className="text-xl font-black" dir="auto">
                {p.objective.title}
              </h2>
            </div>
            <Button variant="soft" icon={<Printer className="size-4" />} className="print:hidden" onClick={() => window.print()}>
              {tr.t('teacherTools.plan.print')}
            </Button>
          </header>
          <ol className="space-y-3">
            {p.sections.map((s, i) => (
              <li key={s.key} className="rounded-xl border border-line p-3">
                <p className="flex items-baseline justify-between font-black">
                  <span>
                    {i + 1}. {tr.t(`teacherTools.plan.sections.${s.key}`)}
                  </span>
                  <span className="muted text-sm tabular-nums">{tr.t('focus.minutes', { count: s.minutes })}</span>
                </p>
                <p className="mt-1 text-sm">{tr.t(`teacherTools.plan.ideas.${s.key}`)}</p>
                {s.key === 'practice' && p.questions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm" dir="auto">
                    {p.questions.slice(0, 4).map((q, j) => (
                      <li key={j}>{q.prompt}</li>
                    ))}
                  </ul>
                )}
                {s.key === 'assess' && p.questions.length > 4 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm" dir="auto">
                    {p.questions.slice(4, 6).map((q, j) => (
                      <li key={j}>{q.prompt}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <section>
            <h3 className="font-black">{tr.t('teacherTools.plan.differentiation')}</h3>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
              <li>{tr.t('teacherTools.plan.support')}</li>
              <li>{tr.t('teacherTools.plan.challenge')}</li>
            </ul>
          </section>
          <section>
            <h3 className="font-black">{tr.t('teacherTools.plan.resources')}</h3>
            {!p.resources.length ? (
              <p className="muted text-sm">{tr.t('teacherTools.plan.noResources')}</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
                {p.resources.map((r) => (
                  <li key={r.id}>
                    <Link
                      className="link"
                      to={r.kind === 'quiz' ? `/quiz?q=${encodeURIComponent(r.title)}` : r.kind === 'video' ? `/watch/${r.id}` : `/library?item=${r.id}`}
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      )}
    </div>
  );
}

/* ───────── Grade a paper from a photo ───────── */
interface KeyRow {
  label: string;
  accepted: string;
  points: number;
}
const blankKey = (n: number): KeyRow => ({ label: String(n), accepted: '', points: 1 });

function Paper() {
  const tr = useT();
  const [courseId, setCourse] = useState('');
  const [studentId, setStudent] = useState('');
  const [text, setText] = useState('');
  const [key, setKey] = useState<KeyRow[]>([blankKey(1)]);
  const [grade, setGrade] = useState<PaperGradeDto | null>(null);
  const [marks, setMarks] = useState<number[]>([]);
  const [componentId, setComponentId] = useState('');
  const { upload, busy } = useUpload();
  const components = useQuery({ queryKey: ['components', courseId], queryFn: () => api.school.components(courseId), enabled: !!courseId });
  const manual = components.data?.items.filter((c) => c.source === 'manual') ?? [];
  const read = async (file: File) => {
    const up = await upload(file, 'assignment', true);
    if (!up) return;
    try {
      setText((await api.teacherTools.readPaper(up.url)).text);
    } catch (e) {
      toastError(e);
    }
  };
  const suggest = useMutation({
    mutationFn: () =>
      api.teacherTools.suggestPaper(
        text,
        key
          .filter((k) => k.accepted.trim())
          .map((k) => ({
            label: k.label || '?',
            accepted: k.accepted
              .split(/[,،]/)
              .map((s) => s.trim())
              .filter(Boolean),
            points: k.points,
          })),
      ),
    onSuccess: (g) => {
      setGrade(g);
      setMarks(g.items.map((i) => i.awarded));
    },
    onError: toastError,
  });
  const total = marks.reduce((a, b) => a + b, 0);
  const max = grade?.max ?? 0;
  const comp = manual.find((c) => c.id === componentId);
  const scaled = comp && max ? Math.round((total / max) * comp.maxMarks * 10) / 10 : null;
  const save = useMutation({
    mutationFn: () => api.school.saveMarks(courseId, [{ componentId, studentId, marks: scaled }]),
    onSuccess: () => toast(tr.t('teacherTools.paper.saved')),
    onError: toastError,
  });
  const setRow = (i: number, patch: Partial<KeyRow>) => setKey(key.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <CourseAndStudent courseId={courseId} studentId={studentId} setCourse={setCourse} setStudent={setStudent} />
          <label className="block text-sm font-bold">
            {tr.t('teacherTools.paper.photo')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              className="input mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
                e.target.value = '';
              }}
            />
          </label>
          <Textarea label={tr.t('teacherTools.paper.text')} value={text} rows={7} onChange={(e) => setText(e.target.value)} dir="auto" />
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('teacherTools.paper.key')}</h3>
          {key.map((k, i) => (
            <div key={i} className="grid grid-cols-[4rem_1fr_5rem_auto] items-end gap-2">
              <Input
                aria-label={tr.t('teacherTools.paper.label')}
                placeholder={tr.t('teacherTools.paper.label')}
                value={k.label}
                onChange={(e) => setRow(i, { label: e.target.value })}
              />
              <Input
                aria-label={tr.t('teacherTools.paper.accepted')}
                placeholder={tr.t('teacherTools.paper.accepted')}
                value={k.accepted}
                onChange={(e) => setRow(i, { accepted: e.target.value })}
                dir="auto"
              />
              <Input
                type="number"
                min={0}
                step={0.5}
                aria-label={tr.t('teacherTools.paper.points')}
                value={k.points}
                onChange={(e) => setRow(i, { points: Number(e.target.value) })}
                dir="ltr"
              />
              <IconButton label={tr.t('common.delete')} size="sm" disabled={key.length === 1} onClick={() => setKey(key.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={() => setKey([...key, blankKey(key.length + 1)])}>
              {tr.t('teacherTools.paper.addItem')}
            </Button>
            <Button loading={suggest.isPending} disabled={!text.trim() || !key.some((k) => k.accepted.trim())} onClick={() => suggest.mutate()}>
              {tr.t('teacherTools.paper.suggest')}
            </Button>
          </div>
        </section>
      </div>
      {grade && (
        <section className="card space-y-3 self-start p-4">
          <p className="muted text-sm">{tr.t('teacherTools.paper.review')}</p>
          <ul className="space-y-2">
            {grade.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-10 font-black">{it.label}</span>
                <span className="muted min-w-0 flex-1 truncate text-xs" dir="auto">
                  {it.matched.join(', ')}
                </span>
                <input
                  type="number"
                  min={0}
                  max={it.points}
                  step={0.5}
                  aria-label={`${tr.t('teacherTools.paper.awarded')} ${it.label}`}
                  className="input w-20"
                  value={marks[i] ?? 0}
                  onChange={(e) => setMarks(marks.map((m, j) => (j === i ? Math.max(0, Math.min(it.points, Number(e.target.value))) : m)))}
                />
                <span className="muted text-xs">/ {it.points}</span>
              </li>
            ))}
          </ul>
          <p className="text-lg font-black tabular-nums">{tr.t('teacherTools.paper.total', { total, max })}</p>
          {components.data && !manual.length ? (
            <p className="muted text-sm">{tr.t('teacherTools.paper.noComponents')}</p>
          ) : (
            <>
              <Select
                label={tr.t('teacherTools.paper.component')}
                value={componentId}
                onChange={(e) => setComponentId(e.target.value)}
                options={[{ value: '', label: '—' }, ...manual.map((c) => ({ value: c.id, label: `${c.name} (/${c.maxMarks})` }))]}
              />
              <Button loading={save.isPending} disabled={!componentId || !studentId || scaled === null} onClick={() => save.mutate()}>
                {tr.t('teacherTools.paper.save')}
                {scaled !== null ? ` · ${scaled}` : ''}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/* ───────── Compare classes ───────── */
function Compare() {
  const tr = useT();
  const courses = useCourses();
  const [picked, setPicked] = useState<string[]>([]);
  const run = useMutation({ mutationFn: () => api.teacherTools.compare(picked), onError: toastError });
  const d: ClassComparisonDto | undefined = run.data;
  const mine = staffOf(courses.data?.items ?? []);
  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <h3 className="font-black">{tr.t('teacherTools.compare.pick')}</h3>
        <div className="flex flex-wrap gap-2">
          {mine.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                className={cx('chip', on && 'is-active')}
                onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id].slice(0, 8))}
              >
                {c.title}
              </button>
            );
          })}
        </div>
        <Button loading={run.isPending} disabled={picked.length < 2} onClick={() => run.mutate()}>
          {tr.t('teacherTools.compare.run')}
        </Button>
      </section>
      {d &&
        (!d.objectives.length ? (
          <EmptyState title={tr.t('teacherTools.compare.empty')} />
        ) : (
          <section className="card overflow-x-auto p-4">
            <p className="muted mb-2 text-sm">{tr.t('teacherTools.compare.hint')}</p>
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">&nbsp;</th>
                  {d.objectives.map((o) => (
                    <th key={o.id} className="max-w-40 p-2 text-start font-bold" dir="auto">
                      {o.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.classes.map((c) => (
                  <tr key={c.courseId} className="border-t border-line">
                    <th className="p-2 text-start font-black" dir="auto">
                      {c.title}
                    </th>
                    {d.objectives.map((o) => {
                      const cell = c.cells[o.id];
                      return (
                        <td key={o.id} className="p-2">
                          {cell ? (
                            <span
                              className={cx('badge tabular-nums', cell.pct >= 75 ? 'badge-ok' : cell.pct >= 50 ? 'badge-warn' : 'badge-err')}
                              title={tr.t('teacherTools.compare.questions', { count: cell.questions })}
                            >
                              {cell.pct}%
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </div>
  );
}

/* ───────── Tiered worksheets ───────── */
function Worksheets() {
  const tr = useT();
  const [objective, setObjective] = useState<string | null>(null);
  const [perTier, setPerTier] = useState(5);
  const [save, setSave] = useState(false);
  const make = useMutation({
    mutationFn: () => api.teacherTools.worksheet({ objectiveId: objective!, perTier, save, title: 'Worksheet' }),
    onSuccess: (w) => save && Object.keys(w.quizIds).length && toast(tr.t('teacherTools.worksheet.saved')),
    onError: toastError,
  });
  const w: WorksheetDto | undefined = make.data;
  return (
    <div className="space-y-4">
      <div className="card grid items-end gap-3 p-4 sm:grid-cols-[1fr_9rem_auto]">
        <CurriculumPicker label={tr.t('teacherTools.worksheet.objective')} kinds={['objective']} value={objective} onChange={setObjective} />
        <Input
          type="number"
          min={1}
          max={20}
          label={tr.t('teacherTools.worksheet.perTier')}
          value={perTier}
          onChange={(e) => setPerTier(Number(e.target.value))}
          dir="ltr"
        />
        <Button loading={make.isPending} disabled={!objective} onClick={() => make.mutate()}>
          {tr.t('teacherTools.worksheet.make')}
        </Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={save} onChange={(e) => setSave(e.target.checked)} />
          {tr.t('teacherTools.worksheet.save')}
        </label>
      </div>
      {w && (
        <div className="grid gap-4 lg:grid-cols-3">
          {(['easy', 'medium', 'advanced'] as const).map((t) => (
            <section key={t} className="card space-y-2 p-4">
              <h3 className="flex items-center justify-between font-black">
                {tr.t(`teacherTools.worksheet.${t}`)}
                {w.quizIds[t] && (
                  <Link to={`/quiz/${w.quizIds[t]}/edit`} className="link text-sm font-bold">
                    {tr.t('teacherTools.worksheet.openQuiz')}
                  </Link>
                )}
              </h3>
              {!w.tiers[t].length ? (
                <p className="muted text-sm">{tr.t('teacherTools.worksheet.empty')}</p>
              ) : (
                <ol className="list-decimal space-y-2 ps-5 text-sm">
                  {w.tiers[t].map((q, i) => (
                    <li key={i} dir="auto">
                      {q.prompt}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Shared templates ───────── */
function Templates() {
  const tr = useT();
  const qc = useQueryClient();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() });
  const mySchools = (schools.data?.items ?? []).filter((s) => s.myStatus === 'active' && (s.myRole === 'teacher' || s.myRole === 'admin'));
  const [schoolId, setSchoolId] = useState('');
  const sid = schoolId || mySchools[0]?.id || '';
  const list = useQuery({ queryKey: ['templates', sid], queryFn: () => api.teacherTools.templates(sid), enabled: !!sid });
  const quizzes = useQuery({ queryKey: ['my-quizzes'], queryFn: () => api.quizzes.list({ mine: true, limit: 100 }), enabled: !!sid });
  const courses = useCourses();
  const [quizId, setQuizId] = useState('');
  const [asg, setAsg] = useState({ title: '', description: '', points: 100 });
  const [useCourse, setUseCourse] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['templates', sid] });
  const shareQuiz = useMutation({
    mutationFn: () => api.teacherTools.shareTemplate(sid, { kind: 'quiz', quizId }),
    onSuccess: () => {
      setQuizId('');
      void refresh();
    },
    onError: toastError,
  });
  const shareAsg = useMutation({
    mutationFn: () => api.teacherTools.shareTemplate(sid, { kind: 'assignment', ...asg }),
    onSuccess: () => {
      setAsg({ title: '', description: '', points: 100 });
      void refresh();
    },
    onError: toastError,
  });
  const use = useMutation({
    mutationFn: (v: { id: string; kind: 'quiz' | 'assignment' }) => api.teacherTools.useTemplate(sid, v.id, useCourse || null),
    onSuccess: () => {
      toast(tr.t('teacherTools.templates.created'));
      void refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.teacherTools.removeTemplate(sid, id), onSuccess: refresh, onError: toastError });
  if (schools.isSuccess && !mySchools.length) return <EmptyState title={tr.t('teacherTools.templates.noSchool')} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-3">
        {mySchools.length > 1 && (
          <Select
            label={tr.t('teacherTools.templates.school')}
            value={sid}
            onChange={(e) => setSchoolId(e.target.value)}
            options={mySchools.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        <Select
          label={tr.t('teacherTools.templates.useIn')}
          value={useCourse}
          onChange={(e) => setUseCourse(e.target.value)}
          options={[{ value: '', label: '—' }, ...staffOf(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))]}
        />
        <QueryState query={list}>
          {(d) =>
            !d.items.length ? (
              <EmptyState title={tr.t('teacherTools.templates.empty')} />
            ) : (
              <ul className="space-y-2">
                {d.items.map((t) => (
                  <li key={t.id} className="card flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold" dir="auto">
                        <span className="badge me-2">{tr.t(`teacherTools.templates.${t.kind}`)}</span>
                        {t.title}
                      </p>
                      <p className="muted text-xs">
                        {[
                          tr.t('teacherTools.templates.by', { name: t.authorName ?? '—', count: t.uses }),
                          t.questionCount !== null ? tr.t('teacherTools.templates.questions', { count: t.questionCount }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="soft"
                      loading={use.isPending && use.variables?.id === t.id}
                      disabled={t.kind === 'assignment' && !useCourse}
                      onClick={() => use.mutate({ id: t.id, kind: t.kind })}
                    >
                      {tr.t('teacherTools.templates.use')}
                    </Button>
                    {t.mine && (
                      <IconButton label={tr.t('common.delete')} size="sm" onClick={() => remove.mutate(t.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
      <div className="space-y-4 self-start">
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('teacherTools.templates.shareQuiz')}</h3>
          <Select
            aria-label={tr.t('teacherTools.templates.shareQuiz')}
            value={quizId}
            onChange={(e) => setQuizId(e.target.value)}
            options={[{ value: '', label: '—' }, ...(quizzes.data?.items ?? []).filter((q) => q.kind !== 'bank').map((q) => ({ value: q.id, label: q.title }))]}
          />
          <Button loading={shareQuiz.isPending} disabled={!quizId} onClick={() => shareQuiz.mutate()}>
            {tr.t('teacherTools.templates.share')}
          </Button>
        </section>
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('teacherTools.templates.shareAssignment')}</h3>
          <Input label={tr.t('teacherTools.templates.title')} value={asg.title} onChange={(e) => setAsg({ ...asg, title: e.target.value })} dir="auto" />
          <Textarea
            label={tr.t('teacherTools.templates.description')}
            value={asg.description}
            rows={3}
            onChange={(e) => setAsg({ ...asg, description: e.target.value })}
            dir="auto"
          />
          <Button loading={shareAsg.isPending} disabled={!asg.title.trim()} onClick={() => shareAsg.mutate()}>
            {tr.t('teacherTools.templates.share')}
          </Button>
        </section>
      </div>
    </div>
  );
}

/* ───────── Notes to students ───────── */
function Comments() {
  const tr = useT();
  const [courseId, setCourse] = useState('');
  const [studentId, setStudent] = useState('');
  const [text, setText] = useState('');
  const [facts, setFacts] = useState<{ percent: number | null; attendance: number | null; missing: number } | null>(null);
  const suggest = useMutation({
    mutationFn: () => api.teacherTools.suggestComment(courseId, studentId),
    onSuccess: (r) => {
      setText(r.text);
      setFacts(r.facts);
    },
    onError: toastError,
  });
  const send = useMutation({
    mutationFn: () => api.teacherTools.sendComment(courseId, studentId, text),
    onSuccess: () => {
      toast(tr.t('teacherTools.comments.sent'));
      setText('');
      setFacts(null);
    },
    onError: toastError,
  });
  return (
    <section className="card mx-auto max-w-2xl space-y-3 p-4">
      <CourseAndStudent courseId={courseId} studentId={studentId} setCourse={setCourse} setStudent={setStudent} />
      <Button variant="soft" loading={suggest.isPending} disabled={!courseId || !studentId} onClick={() => suggest.mutate()}>
        {tr.t('teacherTools.comments.suggest')}
      </Button>
      {facts && (
        <p className="muted text-xs">
          {tr.t('teacherTools.comments.facts', { percent: facts.percent ?? '—', attendance: facts.attendance ?? '—', missing: facts.missing })}
        </p>
      )}
      <Textarea label={tr.t('teacherTools.comments.text')} value={text} rows={5} maxLength={1500} onChange={(e) => setText(e.target.value)} dir="auto" />
      <Button loading={send.isPending} disabled={!courseId || !studentId || text.trim().length < 5} onClick={() => send.mutate()}>
        {tr.t('teacherTools.comments.send')}
      </Button>
    </section>
  );
}

export default function TeacherToolsPage() {
  const tr = useT();
  const [tab, setTab] = useTabParam(TABS, 'plan');
  return (
    <div className="page">
      <PageHeader title={tr.t('teacherTools.title')} subtitle={tr.t('teacherTools.subtitle')} icon={<ClipboardPen className="size-6" />} />
      <Tabs className="mb-5 print:hidden" active={tab} onChange={setTab} tabs={TABS.map((k) => ({ key: k, label: tr.t(`teacherTools.tabs.${k}`) }))} />
      {tab === 'plan' && <Plan />}
      {tab === 'paper' && <Paper />}
      {tab === 'compare' && <Compare />}
      {tab === 'worksheet' && <Worksheets />}
      {tab === 'templates' && <Templates />}
      {tab === 'comments' && <Comments />}
    </div>
  );
}
