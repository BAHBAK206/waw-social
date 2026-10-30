import type { SchoolDto, SurveyDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

function Answer({ school, s }: { school: SchoolDto; s: SurveyDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const send = useMutation({
    mutationFn: () => api.schoolAdmin.answerSurvey(school.id, s.id, answers),
    onSuccess: () => {
      toast(tr.t('schoolAdmin.surveys.thanks'));
      void qc.invalidateQueries({ queryKey: ['school', school.id, 'surveys'] });
    },
    onError: toastError,
  });
  return (
    <div className="mt-3 space-y-3">
      <p className="muted text-xs">{tr.t('schoolAdmin.surveys.anonymous')}</p>
      {s.questions.map((q) => (
        <div key={q.id}>
          <p className="font-bold" dir="auto">
            {q.text}
          </p>
          {q.kind === 'rating' ? (
            <div className="mt-1 flex gap-2" role="radiogroup" aria-label={q.text}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={answers[q.id] === n}
                  className={cx('chip !min-w-10 justify-center', answers[q.id] === n && 'is-active')}
                  onClick={() => setAnswers({ ...answers, [q.id]: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <Textarea
              aria-label={q.text}
              rows={2}
              value={String(answers[q.id] ?? '')}
              maxLength={1000}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              dir="auto"
            />
          )}
        </div>
      ))}
      <Button loading={send.isPending} disabled={!Object.values(answers).some((v) => v !== '')} onClick={() => send.mutate()}>
        {tr.t('schoolAdmin.surveys.submit')}
      </Button>
    </div>
  );
}

function Results({ school, s }: { school: SchoolDto; s: SurveyDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['school', school.id, 'survey', s.id], queryFn: () => api.schoolAdmin.surveyResults(school.id, s.id) });
  return (
    <QueryState query={q}>
      {(r) => (
        <div className="mt-3 space-y-3">
          {r.questions.map((x) => (
            <div key={x.id}>
              <p className="font-bold" dir="auto">
                {x.text}
              </p>
              {x.kind === 'rating' ? (
                <p className="text-sm">
                  {x.average === null ? '—' : tr.t('schoolAdmin.surveys.average', { value: x.average })}{' '}
                  <span className="muted tabular-nums">({x.counts.join(' · ')})</span>
                </p>
              ) : (
                <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
                  {x.texts.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}

export function SchoolSurveys({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const admin = school.myRole === 'admin';
  const q = useQuery({ queryKey: ['school', school.id, 'surveys'], queryFn: () => api.schoolAdmin.surveys(school.id) });
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', audience: 'students', questions: [{ text: '', kind: 'rating' as 'rating' | 'text' }] });
  const refresh = () => qc.invalidateQueries({ queryKey: ['school', school.id, 'surveys'] });
  const create = useMutation({
    mutationFn: () =>
      api.schoolAdmin.createSurvey(school.id, {
        title: f.title.trim(),
        audience: f.audience,
        questions: f.questions.filter((x) => x.text.trim().length >= 2).map((x) => ({ text: x.text.trim(), kind: x.kind })),
      }),
    onSuccess: () => {
      toast(tr.t('schoolAdmin.surveys.created'));
      setF({ title: '', audience: 'students', questions: [{ text: '', kind: 'rating' }] });
      void refresh();
    },
    onError: toastError,
  });
  const close = useMutation({ mutationFn: (id: string) => api.schoolAdmin.closeSurvey(school.id, id), onSuccess: refresh, onError: toastError });
  const setQ = (i: number, patch: Partial<(typeof f.questions)[number]>) =>
    setF({ ...f, questions: f.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <p className="muted">{tr.t('schoolAdmin.surveys.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {d.items.map((s) => (
                <li key={s.id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 font-black" dir="auto">
                      {s.title}
                    </h3>
                    {s.closed && <span className="badge">{tr.t('schoolAdmin.surveys.closed')}</span>}
                    {s.answered && <span className="badge badge-ok">{tr.t('schoolAdmin.surveys.answered')}</span>}
                    {admin && s.responses !== null && <span className="muted text-xs">{tr.t('schoolAdmin.surveys.responses', { count: s.responses })}</span>}
                    {admin ? (
                      <>
                        <Button size="sm" variant="soft" onClick={() => setOpen(open === s.id ? null : s.id)}>
                          {tr.t('schoolAdmin.surveys.results')}
                        </Button>
                        {!s.closed && (
                          <Button size="sm" variant="ghost" onClick={() => close.mutate(s.id)}>
                            {tr.t('schoolAdmin.surveys.close')}
                          </Button>
                        )}
                      </>
                    ) : (
                      !s.answered &&
                      !s.closed && (
                        <Button size="sm" onClick={() => setOpen(open === s.id ? null : s.id)}>
                          {tr.t('schoolAdmin.surveys.answer')}
                        </Button>
                      )
                    )}
                  </div>
                  {open === s.id && (admin ? <Results school={school} s={s} /> : <Answer school={school} s={s} />)}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {admin && (
        <section className="card space-y-3 self-start p-4">
          <h3 className="font-black">{tr.t('schoolAdmin.surveys.new')}</h3>
          <Input label={tr.t('schoolAdmin.surveys.name')} value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" />
          <Select
            label={tr.t('schoolAdmin.surveys.audience')}
            value={f.audience}
            onChange={(e) => setF({ ...f, audience: e.target.value })}
            options={['all', 'students', 'teachers', 'parents'].map((v) => ({ value: v, label: tr.t(`schoolAdmin.news.${v}` as 'schoolAdmin.news.all') }))}
          />
          {f.questions.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <Input
                aria-label={tr.t('schoolAdmin.surveys.question')}
                placeholder={tr.t('schoolAdmin.surveys.question')}
                value={x.text}
                maxLength={200}
                onChange={(e) => setQ(i, { text: e.target.value })}
                dir="auto"
              />
              <Select
                aria-label={tr.t('schoolAdmin.surveys.question')}
                value={x.kind}
                onChange={(e) => setQ(i, { kind: e.target.value as 'rating' | 'text' })}
                options={[
                  { value: 'rating', label: tr.t('schoolAdmin.surveys.rating') },
                  { value: 'text', label: tr.t('schoolAdmin.surveys.text') },
                ]}
              />
              <IconButton
                label={tr.t('common.delete')}
                size="sm"
                disabled={f.questions.length === 1}
                onClick={() => setF({ ...f, questions: f.questions.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            variant="soft"
            size="sm"
            icon={<Plus className="size-4" />}
            disabled={f.questions.length >= 15}
            onClick={() => setF({ ...f, questions: [...f.questions, { text: '', kind: 'rating' }] })}
          >
            {tr.t('schoolAdmin.surveys.addQuestion')}
          </Button>
          <Button
            loading={create.isPending}
            disabled={f.title.trim().length < 2 || !f.questions.some((x) => x.text.trim().length >= 2)}
            onClick={() => create.mutate()}
          >
            {tr.t('schoolAdmin.surveys.create')}
          </Button>
        </section>
      )}
    </div>
  );
}
