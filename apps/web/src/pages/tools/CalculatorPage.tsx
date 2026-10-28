import { calculateGrade, type CalcPart } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RatingBadge } from '@/components/school/Gradebook';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

type Row = { name: string; max: string; earned: string };

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));

/** "What do I need on the final?" — works offline; students can start from their real marks in a class. */
export default function CalculatorPage() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [rows, setRows] = useState<Row[]>(() => [
    { name: tr.t('calculator.defaultParts.homework'), max: '10', earned: '' },
    { name: tr.t('calculator.defaultParts.tests'), max: '20', earned: '' },
    { name: tr.t('calculator.defaultParts.final'), max: '30', earned: '' },
  ]);
  const [pass, setPass] = useState('30');
  const [target, setTarget] = useState('');
  const report = useQuery({ queryKey: ['report-card', 'me', ''], queryFn: () => api.school.reportCard(), enabled: me?.accountType === 'student' });
  const subjects = report.data?.subjects.filter((s) => s.components.length > 0) ?? [];
  const parts: CalcPart[] = rows.map((r) => ({ name: r.name, max: num(r.max) ?? 0, earned: num(r.earned) }));
  const r = useMemo(() => calculateGrade(parts, { passMarks: num(pass) ?? 0, target: num(target) }), [parts, pass, target]);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const needLine = (need: number | null) =>
    need === null ? tr.t('calculator.impossible') : need === 0 ? tr.t('calculator.safe') : tr.t('calculator.need', { need, remaining: r.remaining });
  return (
    <div className="page mx-auto max-w-3xl space-y-4">
      <PageHeader title={tr.t('calculator.title')} subtitle={tr.t('features.calculator')} icon={<Calculator className="size-6" />} />
      <p className="muted text-sm">{tr.t('calculator.hint')}</p>
      {subjects.length > 0 && (
        <Select
          label={tr.t('calculator.fromClass')}
          value=""
          placeholder={tr.t('calculator.blank')}
          options={subjects.map((s) => ({ value: s.courseId, label: s.grading.subjectCode ? `${s.title} (${s.grading.subjectCode})` : s.title }))}
          onChange={(e) => {
            const s = subjects.find((x) => x.courseId === e.target.value);
            if (!s) return;
            setRows(s.components.map((c) => ({ name: c.name, max: String(c.maxMarks), earned: c.earned === null ? '' : String(c.earned) })));
            setPass(String(s.grading.passMarks));
          }}
        />
      )}
      <section className="card space-y-2 p-4" aria-label={tr.t('calculator.title')}>
        <div className="muted hidden grid-cols-[1fr_6rem_6rem_2.5rem] gap-2 text-xs font-bold sm:grid">
          <span>{tr.t('calculator.part')}</span>
          <span>{tr.t('calculator.mark')}</span>
          <span>{tr.t('calculator.outOf')}</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_5rem_2.5rem] items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_2.5rem]">
            <Input aria-label={tr.t('calculator.part')} value={row.name} onChange={(e) => set(i, { name: e.target.value })} />
            <Input
              aria-label={`${tr.t('calculator.mark')} — ${row.name}`}
              inputMode="decimal"
              dir="ltr"
              value={row.earned}
              placeholder="—"
              onChange={(e) => set(i, { earned: e.target.value })}
            />
            <Input
              aria-label={`${tr.t('calculator.outOf')} — ${row.name}`}
              inputMode="decimal"
              dir="ltr"
              value={row.max}
              onChange={(e) => set(i, { max: e.target.value })}
            />
            <IconButton label={tr.t('calculator.remove')} size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1}>
              <X className="size-4" />
            </IconButton>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { name: '', max: '10', earned: '' }])}>
            {tr.t('calculator.addPart')}
          </Button>
          <span className="font-bold">{tr.t('calculator.total', { total: r.total })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={tr.t('calculator.passMarks')} inputMode="decimal" dir="ltr" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Input label={tr.t('calculator.target')} inputMode="decimal" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </section>
      <section className="card space-y-3 p-4" aria-live="polite">
        {r.percentSoFar === null ? (
          <p className="muted">{tr.t('calculator.noMarks')}</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <b>{tr.t('calculator.soFar')}:</b> {tr.t('calculator.soFarValue', { earned: r.earned, max: r.gradedMax, percent: r.percentSoFar })}
              {r.ratingSoFar && <RatingBadge rating={r.ratingSoFar} />}
            </p>
            {r.remaining > 0 && (
              <>
                <p>
                  <b>{tr.t('calculator.toPass')}:</b> {needLine(r.neededToPass)}
                </p>
                {num(target) !== null && (
                  <p>
                    <b>{tr.t('calculator.toTarget')}:</b> {needLine(r.neededForTarget)}
                  </p>
                )}
              </>
            )}
            <p className="muted text-sm">{tr.t('calculator.range', { worst: r.worst, best: r.best, total: r.total })}</p>
          </>
        )}
      </section>
    </div>
  );
}
