import {
  BLOOM_LEVELS,
  blankBank,
  blankQuestion,
  blankQuiz,
  ITEM_DIFFICULTIES,
  LIMITS,
  quizBody,
  retypeQuestion,
  validQuizQuestions,
  type QuestionType,
  type QuizEditorDto,
} from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { CurriculumPicker } from '@/components/curriculum/CurriculumPicker';
import { AiGenerateDialog } from '@/components/quiz/AiGenerate';
import { BlueprintEditor } from '@/components/quiz/BlueprintEditor';
import { QUIZ_DRAFT_KEY } from '@/components/video/Captions';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { PageHeader, Spinner } from '@/components/ui/States';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

type Q = QuizEditorDto['questions'][number];

const blank = blankQuestion;
const validate = validQuizQuestions;

function QuestionEditor({
  q,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  q: Q;
  index: number;
  total: number;
  onChange: (q: Q) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const tr = useT();
  const set = (patch: Partial<Q>) => onChange({ ...q, ...patch });
  const changeType = (type: QuestionType) => onChange(retypeQuestion(q, type, tr.t('quiz.editor.true'), tr.t('quiz.editor.false')));
  return (
    <fieldset className="card space-y-4 p-4">
      <legend className="sr-only">{tr.t('quiz.editor.question', { n: index + 1 })}</legend>
      <div className="flex items-center gap-2">
        <span className="badge badge-primary">{tr.t('quiz.editor.question', { n: index + 1 })}</span>
        <span className="flex-1" />
        <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.previous')} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="size-4" />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.next')} disabled={index === total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="size-4" />
        </button>
        <button type="button" className="icon-btn icon-btn-sm text-err" aria-label={tr.t('quiz.editor.removeQuestion')} onClick={onRemove}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <Textarea label={tr.t('quiz.editor.prompt')} value={q.prompt} maxLength={LIMITS.questionText} onChange={(e) => set({ prompt: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label={tr.t('quiz.editor.type')}
          value={q.type}
          onChange={(e) => changeType(e.target.value as QuestionType)}
          options={(['mc', 'tf', 'multi', 'short'] as const).map((t) => ({ value: t, label: tr.t(`quiz.editor.types.${t}`) }))}
        />
        <Input label={tr.t('quiz.editor.topic')} value={q.topic ?? ''} maxLength={120} onChange={(e) => set({ topic: e.target.value || null })} />
        <Input
          type="number"
          min={1}
          max={100}
          label={tr.t('quiz.editor.pointsLabel')}
          value={q.points}
          onChange={(e) => set({ points: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <CurriculumPicker
          label={tr.t('curriculum.objective')}
          kinds={['objective', 'lesson']}
          value={q.objectiveId}
          onChange={(id) => set({ objectiveId: id })}
        />
        <Select
          label={tr.t('quiz.bank.levelLabel')}
          value={q.level ?? ''}
          placeholder="—"
          onChange={(e) => set({ level: (e.target.value || null) as Q['level'] })}
          options={ITEM_DIFFICULTIES.map((d) => ({ value: d, label: tr.t(`quiz.difficulties.${d}`) }))}
        />
        <Select
          label={tr.t('quiz.bank.bloomLabel')}
          value={q.bloom ?? ''}
          placeholder="—"
          onChange={(e) => set({ bloom: (e.target.value || null) as Q['bloom'] })}
          options={BLOOM_LEVELS.map((b) => ({ value: b, label: tr.t(`quiz.bank.bloom.${b}`) }))}
        />
      </div>

      {(q.type === 'mc' || q.type === 'multi') && (
        <div className="space-y-2">
          <p className="field-label">{tr.t('quiz.editor.correct')}</p>
          {q.options.map((opt, i) => {
            const multi = q.type === 'multi';
            const checked = multi ? Array.isArray(q.answer) && (q.answer as number[]).includes(i) : q.answer === i;
            return (
              <div key={i} className="flex items-center gap-2">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  className="size-5 shrink-0 accent-[var(--primary)]"
                  name={`correct-${index}`}
                  checked={checked}
                  aria-label={tr.t('quiz.editor.correct')}
                  onChange={(e) => {
                    if (!multi) return set({ answer: i });
                    const cur = Array.isArray(q.answer) ? (q.answer as number[]) : [];
                    set({ answer: e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i) });
                  }}
                />
                <input
                  className="input"
                  value={opt}
                  maxLength={LIMITS.optionText}
                  placeholder={tr.t('quiz.editor.option', { n: i + 1 })}
                  aria-label={tr.t('quiz.editor.option', { n: i + 1 })}
                  onChange={(e) => set({ options: q.options.map((o, k) => (k === i ? e.target.value : o)) })}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label={tr.t('common.remove')}
                    onClick={() => {
                      const options = q.options.filter((_, k) => k !== i);
                      const answer = multi
                        ? (q.answer as number[]).filter((a) => a !== i).map((a) => (a > i ? a - 1 : a))
                        : typeof q.answer === 'number'
                          ? q.answer === i
                            ? 0
                            : q.answer > i
                              ? q.answer - 1
                              : q.answer
                          : 0;
                      set({ options, answer: multi && !(answer as number[]).length ? [0] : answer });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
          {q.options.length < LIMITS.optionsPerQuestion && (
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => set({ options: [...q.options, ''] })}>
              {tr.t('quiz.editor.addOption')}
            </Button>
          )}
        </div>
      )}
      {q.type === 'tf' && (
        <div className="flex gap-3" role="radiogroup" aria-label={tr.t('quiz.editor.correct')}>
          {[tr.t('quiz.editor.true'), tr.t('quiz.editor.false')].map((label, i) => (
            <label key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`tf-${index}`}
                className="size-5 accent-[var(--primary)]"
                checked={q.answer === i}
                onChange={() => set({ answer: i, options: [tr.t('quiz.editor.true'), tr.t('quiz.editor.false')] })}
              />
              {label}
            </label>
          ))}
        </div>
      )}
      {q.type === 'short' && (
        <Textarea
          label={tr.t('quiz.editor.acceptedAnswers')}
          value={(q.answer as string[]).join('\n')}
          onChange={(e) => set({ answer: e.target.value.split('\n') })}
        />
      )}
      <Textarea
        label={tr.t('quiz.editor.explanation')}
        value={q.explanation ?? ''}
        maxLength={LIMITS.explanation}
        onChange={(e) => set({ explanation: e.target.value || null })}
      />
    </fieldset>
  );
}

export default function QuizEditorPage() {
  const { id } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const existing = useQuery({ queryKey: ['quiz-editor', id], queryFn: () => api.quizzes.editor(id!), enabled: !!id, staleTime: 0 });
  const courses = useQuery({ queryKey: qk.courses, queryFn: () => api.school.courses(false) });
  const [params] = useSearchParams();
  // A draft made by the lesson tools ("Make a checkpoint quiz"): questions to review, then link to the lesson.
  const [draft] = useState(() => {
    if (id || params.get('draft') !== '1') return null;
    try {
      const raw = sessionStorage.getItem(QUIZ_DRAFT_KEY);
      sessionStorage.removeItem(QUIZ_DRAFT_KEY);
      return raw ? (JSON.parse(raw) as { title: string; questions: Q[]; videoId?: string }) : null;
    } catch {
      return null;
    }
  });
  const [form, setForm] = useState<Omit<QuizEditorDto, 'id'>>(() =>
    draft
      ? { ...blankQuiz(), title: draft.title.slice(0, LIMITS.quizTitle), questions: draft.questions.length ? draft.questions : blankQuiz().questions }
      : params.get('kind') === 'bank'
        ? blankBank()
        : blankQuiz(),
  );
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const teacher = useSession((s) => s.me?.accountType === 'teacher' || (s.me?.role ?? 'user') !== 'user');
  const addQuestions = (list: Q[]) => {
    setForm((cur) => ({
      ...cur,
      questions: [...(cur.questions.length === 1 && !cur.questions[0]!.prompt ? [] : cur.questions), ...list].slice(0, LIMITS.questionsPerQuiz),
    }));
    toast(tr.t('quiz.editor.generated', { count: list.length }));
  };

  useEffect(() => {
    if (existing.data) {
      const { id: _id, ...rest } = existing.data;
      setForm(rest);
    }
  }, [existing.data]);

  if (id && existing.isPending) return <Spinner className="py-24" />;
  const materials = taxonomy.data?.sections.find((s) => s.id === form.sectionId)?.materials ?? [];
  const bank = form.kind === 'bank';
  const fromBanks = !!form.blueprint;
  const valid =
    form.title.trim().length >= 2 && (fromBanks ? form.blueprint!.bankIds.length > 0 && form.blueprint!.rules.length > 0 : validate(form.questions));

  const importJson = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as { questions?: Partial<Q>[] } | Partial<Q>[];
      const list = Array.isArray(data) ? data : (data.questions ?? []);
      const parsed = list.slice(0, LIMITS.questionsPerQuiz).map((x) => ({ ...blank((x.type as QuestionType) ?? 'mc'), ...x }) as Q);
      if (!parsed.length) throw new Error('empty');
      setForm((cur) => ({ ...cur, questions: [...(cur.questions.length === 1 && !cur.questions[0]!.prompt ? [] : cur.questions), ...parsed] }));
    } catch {
      toast(tr.t('common.errorGeneric'), 'err');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = quizBody(form);
      if (id) await api.quizzes.update(id, body);
      else {
        const created = await api.quizzes.create(body);
        // Made from a lesson: it becomes that lesson's checkpoint quiz.
        if (draft?.videoId && body.published) await api.videos.update(draft.videoId, { quizId: created.id }).catch(() => undefined);
        if (draft?.videoId) {
          toast(tr.t('common.saved'));
          navigate(`/watch/${draft.videoId}`);
          return;
        }
      }
      toast(tr.t('common.saved'));
      navigate(bank ? '/quiz?tab=banks' : '/quiz?mine=1');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow space-y-5">
      <AiGenerateDialog open={aiOpen} onClose={() => setAiOpen(false)} onAdd={addQuestions} />
      <PageHeader
        title={bank ? (id ? form.title || tr.t('quiz.bank.banks') : tr.t('quiz.bank.newBank')) : id ? tr.t('quiz.edit') : tr.t('quiz.create')}
        subtitle={bank ? tr.t('quiz.bank.hint') : undefined}
        actions={
          <>
            {teacher && (
              <Button variant="soft" icon={<Sparkles className="size-4" />} onClick={() => setAiOpen(true)}>
                {tr.t('quiz.editor.generate')}
              </Button>
            )}
            <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => void importJson()}>
              {tr.t('quiz.editor.importJson')}
            </Button>
            <Button loading={busy} disabled={!valid} onClick={() => void save()}>
              {tr.t('quiz.editor.saveQuiz')}
            </Button>
          </>
        }
      />
      <section className="card space-y-4 p-4">
        <Input
          label={tr.t('quiz.editor.titleLabel')}
          value={form.title}
          maxLength={LIMITS.quizTitle}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Textarea label={tr.t('quiz.editor.descriptionLabel')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={tr.t('quiz.section')}
            value={form.sectionId ?? ''}
            placeholder="—"
            onChange={(e) => setForm({ ...form, sectionId: e.target.value || null, materialId: null })}
            options={(taxonomy.data?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label={tr.t('quiz.material')}
            value={form.materialId ?? ''}
            placeholder="—"
            disabled={!materials.length}
            onChange={(e) => setForm({ ...form, materialId: e.target.value || null })}
            options={materials.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Select
            label={tr.t('quiz.kind')}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
            options={(bank ? (['bank'] as const) : (['quiz', 'test', 'exam'] as const)).map((k) => ({ value: k, label: tr.t(`quiz.kinds.${k}`) }))}
          />
          <Select
            label={tr.t('quiz.difficulty')}
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value as typeof form.difficulty })}
            options={(['easy', 'medium', 'hard'] as const).map((k) => ({ value: k, label: tr.t(`quiz.difficulties.${k}`) }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            type="number"
            min={1}
            max={360}
            label={tr.t('quiz.editor.durationLabel')}
            value={Math.round(form.durationSec / 60)}
            onChange={(e) => setForm({ ...form, durationSec: Math.max(30, Math.min(21600, (Number(e.target.value) || 10) * 60)) })}
          />
          <Input
            type="datetime-local"
            label={tr.t('quiz.editor.scheduleLabel')}
            value={toLocalInput(form.scheduledAt)}
            onChange={(e) => setForm({ ...form, scheduledAt: fromLocalInput(e.target.value) })}
          />
          <Select
            label={tr.t('quiz.editor.course')}
            value={form.courseId ?? ''}
            placeholder="—"
            onChange={(e) => setForm({ ...form, courseId: e.target.value || null })}
            options={(courses.data?.items ?? []).filter((c) => c.myRole !== 'student').map((c) => ({ value: c.id, label: c.title }))}
          />
        </div>
        {!bank && (
          <CurriculumPicker
            label={tr.t('curriculum.place')}
            kinds={['unit', 'lesson', 'objective']}
            value={form.curriculumId}
            onChange={(curriculumId) => setForm({ ...form, curriculumId })}
          />
        )}
        {bank ? (
          <Switch
            checked={form.published}
            onChange={(v) => setForm({ ...form, published: v })}
            label={tr.t('quiz.bank.share')}
            description={tr.t('quiz.bank.shareHint')}
          />
        ) : (
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Switch checked={form.shuffle} onChange={(v) => setForm({ ...form, shuffle: v })} label={tr.t('quiz.editor.shuffle')} />
            <Switch checked={form.published} onChange={(v) => setForm({ ...form, published: v })} label={tr.t('quiz.editor.publishedLabel')} />
            <Switch checked={form.shuffleOptions} onChange={(v) => setForm({ ...form, shuffleOptions: v })} label={tr.t('quiz.bank.shuffleOptions')} />
            <Switch checked={form.integrity} onChange={(v) => setForm({ ...form, integrity: v })} label={tr.t('quiz.bank.integrity')} />
            <Switch
              checked={fromBanks}
              onChange={(v) => setForm({ ...form, blueprint: v ? { bankIds: [], rules: [{ count: 10 }] } : null })}
              label={tr.t('quiz.bank.fromBanks')}
            />
          </div>
        )}
      </section>
      {fromBanks && <BlueprintEditor value={form.blueprint!} onChange={(blueprint) => setForm({ ...form, blueprint })} />}
      {!fromBanks &&
        form.questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            total={form.questions.length}
            onChange={(nq) => setForm({ ...form, questions: form.questions.map((x, k) => (k === i ? nq : x)) })}
            onRemove={() => setForm({ ...form, questions: form.questions.length > 1 ? form.questions.filter((_, k) => k !== i) : [blank()] })}
            onMove={(d) => {
              const arr = [...form.questions];
              [arr[i], arr[i + d]] = [arr[i + d]!, arr[i]!];
              setForm({ ...form, questions: arr });
            }}
          />
        ))}
      {!fromBanks && form.questions.length < LIMITS.questionsPerQuiz && (
        <Button variant="soft" block icon={<Plus className="size-4" />} onClick={() => setForm({ ...form, questions: [...form.questions, blank()] })}>
          {tr.t('quiz.editor.addQuestion')}
        </Button>
      )}
      {!valid && <p className="text-sm text-err">{tr.t('quiz.editor.validation')}</p>}
    </div>
  );
}
