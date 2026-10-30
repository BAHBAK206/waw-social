import { BLOOM_LEVELS, ITEM_DIFFICULTIES, type QuizEditorDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { CurriculumPicker } from '@/components/curriculum/CurriculumPicker';
import { ButtonLink, Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

type Blueprint = NonNullable<QuizEditorDto['blueprint']>;
type Rule = Blueprint['rules'][number];

/** Exam rules: which banks, and how many questions per objective / difficulty / level of thinking. */
export function BlueprintEditor({ value, onChange }: { value: Blueprint; onChange: (b: Blueprint) => void }) {
  const tr = useT();
  const banks = useQuery({ queryKey: ['quizzes', 'banks'], queryFn: () => api.quizzes.list({ kind: 'bank', mine: true, limit: 100 }) });
  const list = banks.data?.items ?? [];
  const setRule = (i: number, patch: Partial<Rule>) => onChange({ ...value, rules: value.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const total = value.rules.reduce((n, r) => n + (r.count || 0), 0);
  return (
    <section className="card space-y-4 p-4" aria-labelledby="blueprint">
      <div>
        <h2 id="blueprint" className="font-black">
          {tr.t('quiz.bank.fromBanks')}
        </h2>
        <p className="muted text-sm">{tr.t('quiz.bank.fromBanksHint')}</p>
      </div>
      <fieldset>
        <legend className="field-label">{tr.t('quiz.bank.banksLabel')}</legend>
        {!list.length ? (
          <p className="muted text-sm">
            {tr.t('quiz.bank.noBanks')}{' '}
            <ButtonLink to="/quiz/new?kind=bank" variant="ghost" size="sm">
              {tr.t('quiz.bank.newBank')}
            </ButtonLink>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {list.map((b) => {
              const on = value.bankIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, bankIds: on ? value.bankIds.filter((x) => x !== b.id) : [...value.bankIds, b.id] })}
                >
                  {b.title} · {b.questionCount}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="field-label">{tr.t('quiz.bank.rules')}</legend>
        {value.rules.map((r, i) => (
          <div key={i} className="grid items-end gap-2 rounded-[var(--radius-control)] border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_6rem_auto]">
            <CurriculumPicker label={tr.t('curriculum.place')} value={r.objectiveId} onChange={(id) => setRule(i, { objectiveId: id })} />
            <Select
              label={tr.t('quiz.bank.levelLabel')}
              value={r.difficulty ?? ''}
              onChange={(e) => setRule(i, { difficulty: (e.target.value || null) as Rule['difficulty'] })}
              options={[{ value: '', label: tr.t('quiz.bank.any') }, ...ITEM_DIFFICULTIES.map((d) => ({ value: d, label: tr.t(`quiz.difficulties.${d}`) }))]}
            />
            <Select
              label={tr.t('quiz.bank.bloomLabel')}
              value={r.bloom ?? ''}
              onChange={(e) => setRule(i, { bloom: (e.target.value || null) as Rule['bloom'] })}
              options={[{ value: '', label: tr.t('quiz.bank.any') }, ...BLOOM_LEVELS.map((b) => ({ value: b, label: tr.t(`quiz.bank.bloom.${b}`) }))]}
            />
            <Input
              type="number"
              min={1}
              max={100}
              label={tr.t('quiz.bank.count')}
              value={r.count}
              onChange={(e) => setRule(i, { count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
            />
            <IconButton
              label={tr.t('quiz.bank.removeRule')}
              size="sm"
              disabled={value.rules.length <= 1}
              onClick={() => onChange({ ...value, rules: value.rules.filter((_, k) => k !== i) })}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange({ ...value, rules: [...value.rules, { count: 5 }] })}>
            {tr.t('quiz.bank.addRule')}
          </Button>
          <span className="font-bold">{tr.t('quiz.bank.total', { count: total })}</span>
        </div>
      </fieldset>
    </section>
  );
}
