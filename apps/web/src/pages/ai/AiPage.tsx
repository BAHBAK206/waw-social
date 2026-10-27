import { LIMITS, type AiAnswerDto, type EssayGradeDto } from '@qubedu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Layers, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

type Mode = 'solve' | 'explain' | 'summarize' | 'quiz';

function Quota() {
  const tr = useT();
  const q = useQuery({ queryKey: ['ai', 'quota'], queryFn: () => api.ai.quota(), staleTime: 30_000 });
  if (!q.data) return null;
  if (!q.data.enabled) return <NoticeCard tone="warn">{tr.t('errors.ai_disabled')}</NoticeCard>;
  return <p className="muted text-sm">{tr.t('ai.quota', { remaining: Math.max(0, q.data.limit - q.data.used) })}</p>;
}

function Answer({ a }: { a: AiAnswerDto }) {
  const tr = useT();
  const [saving, setSaving] = useState(false);
  return (
    <section className="card space-y-4 p-5" aria-live="polite" aria-label={tr.t('ai.answer')}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-black">{tr.t('ai.answer')}</h2>
        <span className={cx('badge', a.confidence === 'high' ? 'badge-ok' : a.confidence === 'medium' ? 'badge-warn' : 'badge-err')}>
          {tr.t(`ai.confidence.${a.confidence}`)}
        </span>
        <span className="badge">{a.provider}</span>
      </div>
      <p className="text-lg font-bold whitespace-pre-wrap" dir="auto">
        {a.answer}
      </p>
      {a.choice !== null && <p className="badge badge-primary">{tr.t('ai.choice', { choice: a.choice + 1 })}</p>}
      {a.steps.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">{tr.t('ai.steps')}</h3>
          <ol className="list-decimal space-y-1 ps-6" dir="auto">
            {a.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {a.generatedQuestions && a.generatedQuestions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">{tr.t('ai.generated')}</h3>
          <ol className="space-y-3">
            {a.generatedQuestions.map((g, i) => (
              <li key={i} className="rounded-[var(--radius-control)] border border-line p-3">
                <p className="font-bold" dir="auto">
                  {i + 1}. {g.prompt}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {g.options.map((o, k) => (
                    <li key={k} className={cx(k === g.answer && 'font-bold text-ok')} dir="auto">
                      {k === g.answer ? '✓ ' : '○ '}
                      {o}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <Button
            className="mt-3"
            variant="soft"
            loading={saving}
            icon={<Layers className="size-4" />}
            onClick={async () => {
              setSaving(true);
              try {
                const cards = a.generatedQuestions!.map((g) => ({
                  front: g.prompt,
                  back: `${g.options[g.answer] ?? ''}\n${g.explanation}`.trim(),
                  deck: 'AI',
                }));
                const res = await api.flashcards.create(cards);
                toast(tr.t('ai.savedCards', { count: res.items.length }));
              } catch (e) {
                toastError(e);
              } finally {
                setSaving(false);
              }
            }}
          >
            {tr.t('ai.toFlashcards')}
          </Button>
        </div>
      )}
      {a.sources.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">{tr.t('ai.sources')}</h3>
          <ul className="space-y-1.5">
            {a.sources.map((s, i) => (
              <li key={i} className="rounded-[var(--radius-control)] bg-bg-2 p-2 text-sm">
                <span className="font-bold">{s.title}</span>
                {s.heading && <span className="muted"> · {s.heading}</span>}
                {s.page && <span className="muted"> · {tr.t('ai.page', { page: s.page })}</span>}
                <p className="muted mt-0.5 line-clamp-2" dir="auto">
                  {s.snippet}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted text-xs">{tr.t('ai.disclaimer')}</p>
    </section>
  );
}

function Solver() {
  const tr = useT();
  const courses = useQuery({ queryKey: ['ai', 'courses'], queryFn: () => api.ai.courses() });
  const [mode, setMode] = useState<Mode>('solve');
  const [question, setQuestion] = useState('');
  const [material, setMaterial] = useState('');
  const [options, setOptions] = useState('');
  const [courseId, setCourseId] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.ai.solve({
        question: question.trim(),
        material: material.trim() || undefined,
        options: options
          .split('\n')
          .map((o) => o.trim())
          .filter(Boolean),
        courseId: courseId || null,
        mode,
      }),
    onError: toastError,
    onSuccess: () => void 0,
  });
  return (
    <div className="space-y-4">
      <div className="tabs" role="tablist">
        {(['solve', 'explain', 'summarize', 'quiz'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className="tab" onClick={() => setMode(k)}>
            {tr.t(`ai.modes.${k}`)}
          </button>
        ))}
      </div>
      <section className="card space-y-4 p-4">
        <Textarea
          label={tr.t('ai.question')}
          value={question}
          maxLength={LIMITS.aiQuestion}
          placeholder={tr.t('ai.questionPlaceholder')}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {(mode === 'summarize' || mode === 'quiz') && (
          <Textarea
            label={tr.t('ai.material')}
            value={material}
            maxLength={LIMITS.aiMaterial}
            placeholder={tr.t('ai.materialPlaceholder')}
            onChange={(e) => setMaterial(e.target.value)}
            className="min-h-40"
          />
        )}
        {mode === 'solve' && <Textarea label={tr.t('ai.options')} value={options} onChange={(e) => setOptions(e.target.value)} />}
        <Select
          label={tr.t('ai.course')}
          value={courseId}
          placeholder={tr.t('ai.anyCourse')}
          onChange={(e) => setCourseId(e.target.value)}
          options={(courses.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.title} (${c.materials})` }))}
        />
        <div className="flex items-center gap-3">
          <Button icon={<Sparkles className="size-4" />} loading={m.isPending} disabled={!question.trim() && !material.trim()} onClick={() => m.mutate()}>
            {tr.t('ai.ask')}
          </Button>
          <Quota />
        </div>
      </section>
      {m.data && <Answer a={m.data} />}
    </div>
  );
}

function Essay() {
  const tr = useT();
  const [answer, setAnswer] = useState('');
  const [points, setPoints] = useState('');
  const [model, setModel] = useState('');
  const m = useMutation<EssayGradeDto>({
    mutationFn: () =>
      api.ai.gradeEssay({
        answer: answer.trim(),
        modelAnswer: model.trim() || undefined,
        keyPoints: points
          .split('\n')
          .map((p) => p.trim())
          .filter(Boolean),
      }),
    onError: toastError,
  });
  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <Textarea label={tr.t('ai.essayAnswer')} value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-40" />
        <Textarea label={tr.t('ai.keyPoints')} value={points} onChange={(e) => setPoints(e.target.value)} />
        <Textarea label={tr.t('ai.modelAnswer')} value={model} onChange={(e) => setModel(e.target.value)} />
        <Button loading={m.isPending} disabled={!answer.trim() || (!points.trim() && !model.trim())} onClick={() => m.mutate()}>
          {tr.t('ai.grade')}
        </Button>
      </section>
      {m.data && (
        <section className="card space-y-3 p-5" aria-live="polite">
          <div className="flex items-center gap-3">
            <p className="text-4xl font-black tabular-nums">{m.data.score}%</p>
            <ProgressBar value={m.data.score} className="flex-1" label={tr.t('ai.grade')} />
          </div>
          <p dir="auto">{m.data.feedback}</p>
          <h3 className="text-sm font-bold">{tr.t('ai.coverage')}</h3>
          <ul className="space-y-1.5">
            {m.data.coverage.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {c.matched ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <X className="mt-0.5 size-4 shrink-0 text-err" />}
                <span dir="auto">{c.point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function AiPage() {
  const tr = useT();
  const [tab, setTab] = useState<'tutor' | 'essay'>('tutor');
  return (
    <div className="page-narrow space-y-4">
      <PageHeader title={tr.t('ai.title')} subtitle={tr.t('ai.subtitle')} icon={<Sparkles className="size-6" />} />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'tutor', label: tr.t('ai.title') },
          { key: 'essay', label: tr.t('ai.essay') },
        ]}
      />
      {tab === 'tutor' ? <Solver /> : <Essay />}
    </div>
  );
}
