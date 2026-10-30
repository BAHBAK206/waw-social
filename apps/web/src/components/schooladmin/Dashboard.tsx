import type { SchoolDashboardRow } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const num = (v: number | null) => (v === null ? '—' : String(v));

function Cells({ r }: { r: SchoolDashboardRow }) {
  return (
    <>
      <td className="p-2 tabular-nums">{r.students}</td>
      <td className="p-2 tabular-nums">{pct(r.attendance)}</td>
      <td className="p-2 tabular-nums">{num(r.average)}</td>
      <td className="p-2 tabular-nums">{pct(r.passRate)}</td>
    </>
  );
}

/** Attendance, marks and pass rates per class and subject, for the principal (print or save as PDF). */
export function SchoolDashboard({ schoolId, name }: { schoolId: string; name: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['school', schoolId, 'dashboard'], queryFn: () => api.schoolAdmin.dashboard(schoolId) });
  return (
    <QueryState query={q}>
      {(d) =>
        !d.classes.length ? (
          <EmptyState title={tr.t('schoolAdmin.dashboard.empty')} />
        ) : (
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black" dir="auto">
                  {name} — {tr.t('schoolAdmin.dashboard.title')}
                </h2>
                <p className="muted text-sm">
                  {tr.t('schoolAdmin.dashboard.hint')} {tr.t('schoolAdmin.dashboard.generated', { when: formatDateTime(d.generatedAt, tr) })}
                </p>
              </div>
              <Button variant="soft" icon={<Printer className="size-4" />} className="print:hidden" onClick={() => window.print()}>
                {tr.t('schoolAdmin.dashboard.print')}
              </Button>
            </header>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ['students', String(d.totals.students)],
                  ['classes', String(d.totals.classes)],
                  ['attendance', pct(d.totals.attendance)],
                  ['average', num(d.totals.average)],
                  ['passRate', pct(d.totals.passRate)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="card p-3 text-center">
                  <p className="text-2xl font-black tabular-nums">{v}</p>
                  <p className="muted text-xs">{tr.t(`schoolAdmin.dashboard.${k}`)}</p>
                </div>
              ))}
            </div>
            <section className="card overflow-x-auto p-4">
              <h3 className="mb-2 font-black">{tr.t('schoolAdmin.dashboard.bySubject')}</h3>
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="text-start">
                    {(['subject', 'classes', 'students', 'attendance', 'average', 'passRate'] as const).map((h) => (
                      <th key={h} className="p-2 text-start font-bold">
                        {tr.t(`schoolAdmin.dashboard.${h}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.subjects.map((s) => (
                    <tr key={s.subject} className="border-t border-line">
                      <th className="p-2 text-start font-black" dir="auto">
                        {s.subject}
                      </th>
                      <td className="p-2 tabular-nums">{s.classes}</td>
                      <Cells r={s} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card overflow-x-auto p-4">
              <h3 className="mb-2 font-black">{tr.t('schoolAdmin.dashboard.byClass')}</h3>
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr>
                    {(['class', 'section', 'teacher', 'students', 'attendance', 'average', 'passRate'] as const).map((h) => (
                      <th key={h} className="p-2 text-start font-bold">
                        {tr.t(`schoolAdmin.dashboard.${h}`)}
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
                      <td className="p-2">{c.section ?? '—'}</td>
                      <td className="p-2" dir="auto">
                        {c.teacher}
                      </td>
                      <Cells r={c} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )
      }
    </QueryState>
  );
}
