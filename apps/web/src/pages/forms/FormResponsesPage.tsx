import type { FormResponseDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { EmptyState, ErrorState, LoadMore, PageHeader, QueryState, Spinner } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api, downloadBlob, downloadResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { confirmDialog, toastError } from '@/lib/ui';

const TABS = ['summary', 'individual'] as const;

const cellValue = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));

export default function FormResponsesPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useTabParam(TABS, 'summary');
  const form = useQuery({ queryKey: ['form', id], queryFn: () => api.forms.get(id) });
  const analytics = useQuery({ queryKey: ['form-analytics', id], queryFn: () => api.forms.analytics(id) });
  const list = usePaged<FormResponseDto>(['form-responses', id], (cursor) => api.forms.responses(id, { cursor, limit: 25 }), tab === 'individual');

  const exportXlsx = async () => {
    if (!form.data) return;
    const all: FormResponseDto[] = [];
    let cursor: string | undefined;
    do {
      const page = await api.forms.responses(id, { cursor, limit: 100 });
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && all.length < 5000);
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Responses');
    const qs = form.data.questions.filter((q) => q.type !== 'section');
    ws.addRow(['Date', 'Name', 'Email', ...qs.map((q) => q.title), 'Score']);
    ws.getRow(1).font = { bold: true };
    for (const r of all) {
      // Prefix formula-looking text so spreadsheet apps never evaluate user input.
      const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
      ws.addRow([
        new Date(r.createdAt),
        safe(r.respondent?.displayName ?? ''),
        safe(r.email ?? ''),
        ...qs.map((q) => safe(cellValue(r.answers[q.id]))),
        r.score ?? '',
      ]);
    }
    downloadBlob(
      new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `form-${form.data.slug}.xlsx`,
    );
  };

  return (
    <div className="page-narrow !max-w-5xl space-y-5">
      <Link to="/forms" className="link inline-flex items-center gap-1">
        <ArrowLeft className="size-4 flip-rtl" /> {tr.t('forms.title')}
      </Link>
      <PageHeader
        title={form.data?.title ?? tr.t('forms.analytics')}
        subtitle={analytics.data ? tr.t('forms.responses', { count: analytics.data.total }) : undefined}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="size-4" />}
              onClick={async () => downloadResponse(await api.forms.exportCsv(id), 'responses.csv').catch(toastError)}
            >
              {tr.t('forms.exportCsv')}
            </Button>
            <Button variant="outline" icon={<FileSpreadsheet className="size-4" />} onClick={() => void exportXlsx().catch(toastError)}>
              {tr.t('forms.exportXlsx')}
            </Button>
          </>
        }
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'summary', label: tr.t('forms.analytics') },
          { key: 'individual', label: tr.t('forms.respondent') },
        ]}
      />
      {tab === 'summary' ? (
        <QueryState query={analytics} isEmpty={(d) => d.total === 0} empty={<EmptyState title={tr.t('common.empty')} />}>
          {(a) => (
            <div className="space-y-4">
              {a.questions.map((q) => {
                const entries = Object.entries(q.counts).sort((x, y) => y[1] - x[1]);
                const max = Math.max(1, ...entries.map(([, n]) => n));
                return (
                  <section key={q.id} className="card p-4">
                    <h2 className="font-black" dir="auto">
                      {q.title}
                    </h2>
                    {q.average !== null && (
                      <p className="muted text-sm">
                        {tr.t('common.average')}: <span className="font-bold tabular-nums">{q.average.toFixed(2)}</span>
                      </p>
                    )}
                    {entries.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {entries.map(([k, n]) => (
                          <li key={k}>
                            <div className="mb-1 flex justify-between text-sm">
                              <span dir="auto">{k}</span>
                              <span className="tabular-nums">{n}</span>
                            </div>
                            <ProgressBar value={n} max={max} label={k} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.textAnswers.length > 0 && (
                      <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto">
                        {q.textAnswers.map((t, i) => (
                          <li key={i} className="rounded-lg bg-bg-2 px-3 py-1.5 text-sm" dir="auto">
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </QueryState>
      ) : list.isPending ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('common.empty')} />
      ) : (
        <div className="space-y-3">
          {list.items.map((r) => (
            <article key={r.id} className="card p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold">{r.respondent?.displayName ?? tr.t('forms.anonymous')}</span>
                {r.email && <span className="muted">· {r.email}</span>}
                <span className="muted">· {formatDateTime(r.createdAt, tr)}</span>
                {r.score !== null && <span className="badge badge-primary ms-auto">{r.score}</span>}
                <IconButton
                  label={tr.t('forms.deleteResponse')}
                  size="sm"
                  className={r.score === null ? 'ms-auto' : ''}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                    try {
                      await api.forms.deleteResponse(id, r.id);
                      await qc.invalidateQueries({ queryKey: ['form-responses', id] });
                      void qc.invalidateQueries({ queryKey: ['form-analytics', id] });
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <dl className="mt-2 space-y-1.5 text-sm">
                {form.data?.questions
                  .filter((q) => q.type !== 'section')
                  .map((q) => (
                    <div key={q.id}>
                      <dt className="muted" dir="auto">
                        {q.title}
                      </dt>
                      <dd className="font-bold" dir="auto">
                        {cellValue(r.answers[q.id]) || '—'}
                      </dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
        </div>
      )}
    </div>
  );
}
