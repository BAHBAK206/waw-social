import {
  LIMITS,
  type FormDto,
  type FormQuestion,
  type FormQuestionType,
  type FormSettings,
  blankFormQuestion,
  DEFAULT_FORM_SETTINGS,
  FORM_TYPES,
  FORM_TYPES_WITH_OPTIONS,
  formQuestionsBody,
  retypeFormQuestion,
  validForm,
} from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Link2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { PageHeader, Spinner } from '@/components/ui/States';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';

const TYPES = FORM_TYPES;
const WITH_OPTIONS = FORM_TYPES_WITH_OPTIONS;
const DEFAULT_SETTINGS = DEFAULT_FORM_SETTINGS;
const blank = blankFormQuestion;

function QuestionCard({
  q,
  i,
  total,
  quizMode,
  onChange,
  onRemove,
  onMove,
}: {
  q: FormQuestion;
  i: number;
  total: number;
  quizMode: boolean;
  onChange: (q: FormQuestion) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const tr = useT();
  const set = (patch: Partial<FormQuestion>) => onChange({ ...q, ...patch });
  const choice = WITH_OPTIONS.has(q.type);
  return (
    <fieldset className="card space-y-3 p-4" style={q.type === 'section' ? { borderInlineStartWidth: 6, borderInlineStartColor: 'var(--primary)' } : undefined}>
      <legend className="sr-only">{q.title || tr.t(`forms.questionTypes.${q.type}`)}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={tr.t('quiz.editor.type')}
          wrapperClassName="w-48"
          value={q.type}
          onChange={(e) => onChange(retypeFormQuestion(q, e.target.value as FormQuestionType))}
          options={TYPES.map((t) => ({ value: t, label: tr.t(`forms.questionTypes.${t}`) }))}
        />
        <span className="flex-1" />
        <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.previous')} disabled={i === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="size-4" />
        </button>
        <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.next')} disabled={i === total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="size-4" />
        </button>
        <button type="button" className="icon-btn icon-btn-sm text-err" aria-label={tr.t('common.delete')} onClick={onRemove}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <Input
        aria-label={tr.t('common.title')}
        placeholder={tr.t('common.title')}
        className={cx(q.type === 'section' && 'text-xl font-black')}
        value={q.title}
        maxLength={500}
        onChange={(e) => set({ title: e.target.value })}
      />
      <Input
        aria-label={tr.t('common.description')}
        placeholder={tr.t('common.description')}
        value={q.description}
        maxLength={2000}
        onChange={(e) => set({ description: e.target.value })}
      />
      {choice && (
        <div className="space-y-2">
          <p className="field-label">{tr.t('forms.options')}</p>
          {q.options.map((o, k) => {
            const correct = q.correct?.includes(o) && !!o;
            return (
              <div key={k} className="flex items-center gap-2">
                {quizMode && (
                  <input
                    type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                    className="size-5 accent-[var(--primary)]"
                    name={`c-${q.id}`}
                    checked={!!correct}
                    aria-label={tr.t('forms.correct')}
                    onChange={(e) => {
                      const cur = q.correct ?? [];
                      set({ correct: q.type === 'multiple' ? (e.target.checked ? [...cur, o] : cur.filter((x) => x !== o)) : [o] });
                    }}
                  />
                )}
                <input
                  className="input"
                  value={o}
                  maxLength={300}
                  aria-label={tr.t('quiz.editor.option', { n: k + 1 })}
                  placeholder={tr.t('quiz.editor.option', { n: k + 1 })}
                  onChange={(e) =>
                    set({ options: q.options.map((x, j) => (j === k ? e.target.value : x)), correct: q.correct?.map((c) => (c === o ? e.target.value : c)) })
                  }
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label={tr.t('common.remove')}
                    onClick={() => set({ options: q.options.filter((_, j) => j !== k), correct: q.correct?.filter((c) => c !== o) })}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => set({ options: [...q.options, ''] })}>
            {tr.t('forms.addOption')}
          </Button>
        </div>
      )}
      {q.type === 'scale' && (
        <div className="grid grid-cols-2 gap-3">
          <Input type="number" label={tr.t('forms.minLabel')} value={q.min ?? 1} min={0} max={1} onChange={(e) => set({ min: Number(e.target.value) })} />
          <Input type="number" label={tr.t('forms.maxLabel')} value={q.max ?? 5} min={2} max={10} onChange={(e) => set({ max: Number(e.target.value) })} />
        </div>
      )}
      {q.type !== 'section' && (
        <div className="flex flex-wrap items-center gap-x-6">
          <Switch className="flex-1" checked={q.required} onChange={(v) => set({ required: v })} label={tr.t('forms.required')} />
          {quizMode && (
            <Input
              type="number"
              min={0}
              max={100}
              wrapperClassName="w-28"
              label={tr.t('forms.pointsLabel')}
              value={q.points ?? 1}
              onChange={(e) => set({ points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          )}
        </div>
      )}
    </fieldset>
  );
}

/** Reads a spreadsheet (columns: question, type, options separated by |, required, correct, points) into questions. */
async function importXlsx(file: File): Promise<FormQuestion[]> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: FormQuestion[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const cell = (c: number) => String(row.getCell(c).text ?? '').trim();
    const title = cell(1);
    if (!title) return;
    const typeRaw = cell(2).toLowerCase();
    const type = (TYPES.includes(typeRaw as FormQuestionType) ? typeRaw : 'short') as FormQuestionType;
    const options = cell(3)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const correct = cell(5)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({
      ...blank(type),
      title,
      options: WITH_OPTIONS.has(type) ? (options.length >= 2 ? options : ['', '']) : [],
      required: /^(1|yes|true|نعم)$/i.test(cell(4)),
      ...(correct.length ? { correct } : {}),
      points: Number(cell(6)) || 1,
    });
  });
  return out.slice(0, LIMITS.formQuestions);
}

export default function FormBuilderPage() {
  const { id } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const existing = useQuery({ queryKey: ['form', id], queryFn: () => api.forms.get(id!), enabled: !!id, staleTime: 0 });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<FormSettings>(DEFAULT_SETTINGS);
  const [questions, setQuestions] = useState<FormQuestion[]>([blank()]);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FormDto | null>(null);

  useEffect(() => {
    const f = existing.data;
    if (!f) return;
    setTitle(f.title);
    setDescription(f.description);
    setSettings({ ...DEFAULT_SETTINGS, ...f.settings });
    setQuestions(f.questions.length ? f.questions : [blank()]);
    setPublished(f.published);
    setSaved(f);
  }, [existing.data]);

  if (id && existing.isPending) return <Spinner className="py-24" />;
  const set = (patch: Partial<FormSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const valid = validForm(title, questions);

  const save = async (publish?: boolean) => {
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        settings,
        published: publish ?? published,
        questions: formQuestionsBody(questions),
      };
      const res = id ? await api.forms.update(id, body) : await api.forms.create(body);
      setSaved(res);
      setPublished(res.published);
      toast(tr.t('common.saved'));
      void qc.invalidateQueries({ queryKey: qk.forms });
      if (!id) navigate(`/forms/${res.id}/edit`, { replace: true });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow space-y-5">
      <PageHeader
        title={id ? tr.t('forms.saveForm') : tr.t('forms.newForm')}
        actions={
          <>
            {saved && (
              <Button
                variant="outline"
                icon={<Link2 className="size-4" />}
                onClick={() => void navigator.clipboard.writeText(`${location.origin}/f/${saved.slug}`).then(() => toast(tr.t('common.copied')))}
              >
                {tr.t('forms.copyLink')}
              </Button>
            )}
            <Button variant="outline" loading={busy} disabled={!valid} onClick={() => void save()}>
              {tr.t('common.save')}
            </Button>
            <Button loading={busy} disabled={!valid} onClick={() => void save(!published)}>
              {published ? tr.t('common.unpublish') : tr.t('common.publish')}
            </Button>
          </>
        }
      />
      <section className="card overflow-hidden">
        <div className="h-2" style={{ background: settings.color }} />
        <div className="space-y-3 p-4">
          <Input
            aria-label={tr.t('common.title')}
            placeholder={tr.t('forms.untitled')}
            className="!text-2xl font-black"
            value={title}
            maxLength={LIMITS.formTitle}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            aria-label={tr.t('common.description')}
            placeholder={tr.t('common.description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          q={q}
          i={i}
          total={questions.length}
          quizMode={settings.quizMode}
          onChange={(nq) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? nq : x)))}
          onRemove={() => setQuestions((qs) => (qs.length > 1 ? qs.filter((x) => x.id !== q.id) : [blank()]))}
          onMove={(d) =>
            setQuestions((qs) => {
              const a = [...qs];
              [a[i], a[i + d]] = [a[i + d]!, a[i]!];
              return a;
            })
          }
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="soft"
          icon={<Plus className="size-4" />}
          disabled={questions.length >= LIMITS.formQuestions}
          onClick={() => setQuestions((q) => [...q, blank()])}
        >
          {tr.t('forms.addQuestion')}
        </Button>
        <Button
          variant="outline"
          icon={<FileSpreadsheet className="size-4" />}
          onClick={async () => {
            const f = await pickFile('.xlsx');
            if (!f) return;
            try {
              const imported = await importXlsx(f);
              if (!imported.length) return toast(tr.t('common.empty'), 'err');
              setQuestions((q) => [...(q.length === 1 && !q[0]!.title ? [] : q), ...imported].slice(0, LIMITS.formQuestions));
            } catch {
              toast(tr.t('common.errorGeneric'), 'err');
            }
          }}
        >
          {tr.t('forms.importXlsx')}
        </Button>
        <a className="btn btn-ghost" href="/templates/qubedu-forms-questions-template.xlsx" download>
          <Download className="size-4" /> Template
        </a>
      </div>

      <section className="card space-y-1 p-4">
        <h2 className="mb-2 font-black">{tr.t('forms.settings')}</h2>
        <Switch checked={settings.acceptingResponses} onChange={(v) => set({ acceptingResponses: v })} label={tr.t('forms.accepting')} />
        <Switch checked={settings.requireSignIn} onChange={(v) => set({ requireSignIn: v })} label={tr.t('forms.requireSignIn')} />
        <Switch
          checked={settings.oneResponsePerUser}
          onChange={(v) => set({ oneResponsePerUser: v, requireSignIn: v || settings.requireSignIn })}
          label={tr.t('forms.oneResponse')}
        />
        <Switch checked={settings.collectEmail} onChange={(v) => set({ collectEmail: v })} label={tr.t('forms.collectEmail')} />
        <Switch checked={settings.showResults} onChange={(v) => set({ showResults: v })} label={tr.t('forms.showResults')} />
        <Switch checked={settings.quizMode} onChange={(v) => set({ quizMode: v })} label={tr.t('forms.quizMode')} />
        <Switch checked={settings.shuffleQuestions} onChange={(v) => set({ shuffleQuestions: v })} label={tr.t('forms.shuffle')} />
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Input
            type="datetime-local"
            label={tr.t('forms.deadline')}
            value={toLocalInput(settings.deadline ?? null)}
            onChange={(e) => set({ deadline: fromLocalInput(e.target.value) })}
          />
          <div>
            <label className="field-label" htmlFor="form-color">
              {tr.t('forms.color')}
            </label>
            <input
              id="form-color"
              type="color"
              className="h-11 w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-transparent"
              value={settings.color}
              onChange={(e) => set({ color: e.target.value })}
            />
          </div>
        </div>
        <Textarea
          label={tr.t('forms.confirmation')}
          value={settings.confirmationMessage}
          maxLength={1000}
          onChange={(e) => set({ confirmationMessage: e.target.value })}
        />
      </section>
    </div>
  );
}
