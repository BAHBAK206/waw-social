import type { SchoolReportCardsDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api, fileUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** Official report cards, one page per student, ready to print or save as PDF (the browser keeps Arabic text right). */
export default function ReportCardsPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const [params] = useSearchParams();
  const section = params.get('section') ?? undefined;
  const studentId = params.get('studentId') ?? undefined;
  const term = params.get('term') ?? undefined;
  const q = useQuery({ queryKey: ['report-cards', id, section, studentId, term], queryFn: () => api.schools.reportCards(id, { section, studentId, term }) });
  return (
    <div className="page mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr.t('schools.card.heading')}</h1>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          {tr.t('schools.card.printSave')}
        </Button>
      </div>
      <QueryState query={q}>
        {(d) =>
          !d.cards.length ? (
            <EmptyState title={tr.t('schools.card.none')} />
          ) : (
            <div className="space-y-8 print:space-y-0">
              {d.cards.map((card) => (
                <Card key={card.student.id} data={d} card={card} />
              ))}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

function Card({ data, card }: { data: SchoolReportCardsDto; card: SchoolReportCardsDto['cards'][number] }) {
  const tr = useT();
  const { school } = data;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(n * 10) / 10));
  return (
    <article
      className="report-card rounded-[var(--radius-card)] border-2 border-[var(--line)] bg-[var(--card-solid)] p-6 print:rounded-none print:border-0 print:p-0"
      dir={tr.dir}
    >
      <header className="flex items-center gap-4 border-b-2 border-[var(--line)] pb-4">
        {school.logoUrl && <img src={fileUrl(school.logoUrl)} alt="" className="size-16 object-contain" />}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black" dir="auto">
            {school.name}
          </p>
          {(school.address || school.phone) && (
            <p className="muted text-sm" dir="auto">
              {[school.address, school.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="text-end">
          <p className="text-lg font-black">{tr.t('schools.card.heading')}</p>
          {data.term && <p className="text-sm">{data.term}</p>}
        </div>
      </header>
      <dl className="my-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div className="col-span-2">
          <dt className="muted">{tr.t('schools.card.student')}</dt>
          <dd className="font-black" dir="auto">
            {card.student.displayName}
          </dd>
        </div>
        <div>
          <dt className="muted">{tr.t('schools.card.grade')}</dt>
          <dd className="font-bold">{card.gradeLevel ? tr.t(`stages.grades.${card.gradeLevel}` as never) : '—'}</dd>
        </div>
        <div>
          <dt className="muted">{tr.t('schools.card.section')}</dt>
          <dd className="font-bold">{card.section ?? '—'}</dd>
        </div>
        <div>
          <dt className="muted">{tr.t('schools.card.number')}</dt>
          <dd className="font-bold tabular-nums">{card.studentNumber ?? '—'}</dd>
        </div>
      </dl>
      {!card.subjects.length ? (
        <p className="muted my-6 text-center">{tr.t('schools.card.noSubjects')}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--bg-2)] print:bg-transparent">
              {(['subject', 'code', 'marks', 'outOf', 'result'] as const).map((k) => (
                <th key={k} className="border border-[var(--line)] p-2 text-start">
                  {tr.t(`schools.card.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((s) => (
              <tr key={s.courseId}>
                <td className="border border-[var(--line)] p-2 font-bold" dir="auto">
                  {s.title}
                </td>
                <td className="border border-[var(--line)] p-2" dir="ltr">
                  {s.grading.subjectCode ?? '—'}
                </td>
                <td className="border border-[var(--line)] p-2 tabular-nums">{s.result.percent === null ? '—' : fmt(s.result.score)}</td>
                <td className="border border-[var(--line)] p-2 tabular-nums">{fmt(s.grading.maxMarks)}</td>
                <td className="border border-[var(--line)] p-2">
                  {s.result.passed === null ? '—' : s.result.passed ? tr.t('schools.card.pass') : tr.t('schools.card.fail')}
                  {s.result.rating && <span className="muted"> · {tr.t(`gradebook.ratings.${s.result.rating}`)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-black">
              <td className="border border-[var(--line)] p-2" colSpan={2}>
                {tr.t('schools.card.overall')}
              </td>
              <td className="border border-[var(--line)] p-2 tabular-nums">{fmt(card.overall.score)}</td>
              <td className="border border-[var(--line)] p-2 tabular-nums">{fmt(card.overall.fullMax)}</td>
              <td className="border border-[var(--line)] p-2">
                {card.overall.percent === null ? '—' : `${fmt(card.overall.percent)}%`}
                {card.overall.rating && <span> · {tr.t(`gradebook.ratings.${card.overall.rating}`)}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      <footer className="mt-10 grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
        {[
          [tr.t('schools.card.classTeacher'), ''],
          [tr.t('schools.card.principal'), school.principal ?? ''],
          [tr.t('schools.card.parent'), ''],
          [tr.t('schools.card.stamp'), ''],
        ].map(([label, name]) => (
          <div key={label} className="text-center">
            <div className="h-10 border-b border-dashed border-[var(--line)]" dir="auto">
              {name}
            </div>
            <p className="muted mt-1">{label}</p>
          </div>
        ))}
      </footer>
      <p className="muted mt-6 text-center text-xs">{tr.t('schools.card.issued', { date: formatDate(Date.now(), tr) })}</p>
    </article>
  );
}
