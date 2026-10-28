import type { ChildReportDto } from '@qubedu/shared';
import { ReportCard } from '@/components/school/Gradebook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Link2, MessageCircle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ColumnChart } from '@/components/ui/Charts';
import { ReasonChips, RiskBadge } from '@/components/family/Insights';
import { FamilyCode } from '@/components/family/FamilyCode';
import { ControlsEditor, FamilyRequests, InviteParent, MyControls, RequestChild } from '@/components/family/Linking';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confirmDialog, toast, toastError } from '@/lib/ui';

function MessageTeacher({ teacherId }: { teacherId: string }) {
  const tr = useT();
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<MessageCircle className="size-4" />}
      onClick={async () => {
        try {
          const conv = await api.chat.direct(teacherId);
          navigate(`/chat/${conv.id}`);
        } catch (e) {
          toastError(e);
        }
      }}
    >
      {tr.t('family.messageTeacher')}
    </Button>
  );
}

function ChildReport({ report }: { report: ChildReportDto }) {
  const tr = useT();
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-3 p-4">
        <Avatar name={report.child.displayName} url={report.child.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-lg font-black">
            <span dir="auto">{report.child.displayName}</span> <RiskBadge level={report.risk.level} />
          </p>
          <p className="muted text-sm">
            <Flame className="inline size-4 text-warn" aria-hidden /> {tr.t('family.streak', { count: report.streak })} ·{' '}
            {tr.t('family.level', { level: report.level })}
          </p>
          <ReasonChips reasons={report.risk.reasons} />
        </div>
      </section>
      <ControlsEditor key={report.child.id} report={report} />
      <section className="card p-4">
        <ColumnChart
          title={tr.t('family.studyChart')}
          data={report.days.map((d) => ({ label: d.day.slice(8), value: d.minutes, title: `${d.day}: ${d.minutes}` }))}
        />
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-black">{tr.t('family.quizzes')}</h2>
        {!report.quizzes.length && <p className="muted text-sm">{tr.t('family.noQuizzes')}</p>}
        <ul className="divide-y divide-line">
          {report.quizzes.map((q, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {q.title}
              </span>
              <span className={cx('badge tabular-nums', q.pct >= 75 ? 'badge-ok' : q.pct >= 50 ? 'badge-warn' : 'badge-err')}>{q.pct}%</span>
              <span className="muted text-xs">{relativeTime(q.at, tr)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-black">{tr.t('gradebook.reportCard')}</h2>
        <ReportCard studentId={report.child.id} compact />
      </section>
      <section className="space-y-3">
        <h2 className="font-black">{tr.t('family.courses')}</h2>
        {report.courses.map((c) => (
          <article key={c.id} className="card space-y-2 p-4">
            <p className="font-bold" dir="auto">
              {c.title}
            </p>
            <p className="muted flex flex-wrap items-center gap-2 text-xs">
              <span>
                {c.teacher && `${tr.t('family.teacher', { name: c.teacher })} · `}
                {tr.t('family.attendance', c.attendance)}
              </span>
              {c.teacherId && <MessageTeacher teacherId={c.teacherId} />}
            </p>
            <ul className="divide-y divide-line">
              {c.assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1" dir="auto">
                    {a.title}
                  </span>
                  {a.dueAt && <span className="muted text-xs">{tr.t('family.due', { date: formatDate(a.dueAt, tr) })}</span>}
                  <span
                    className={cx(
                      'badge',
                      a.status === 'missing' ? 'badge-err' : a.status === 'graded' ? 'badge-ok' : a.status === 'submitted' ? 'badge-primary' : '',
                    )}
                  >
                    {tr.t(`family.status.${a.status}`)}
                    {a.grade !== null ? ` · ${a.grade}/${a.points}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

export default function FamilyPage() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const [params, setParams] = useSearchParams();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = params.get('child') ?? fam.data?.children[0]?.id ?? null;
  const report = useQuery({ queryKey: ['family-child', selected], queryFn: () => api.family.child(selected!), enabled: !!selected });
  const parent = me.accountType === 'parent';
  // A parent opens the link a child sent by email (/family?invite=…).
  const invite = params.get('invite');
  const used = useRef(false);
  useEffect(() => {
    if (!invite || used.current) return;
    used.current = true;
    if (!parent) {
      toast(tr.t('family.inviteNeedsParent'), 'err');
      return;
    }
    void api.family
      .acceptInvite(invite)
      .then(async (r) => {
        toast(tr.t('family.inviteLinked', { name: r.child?.displayName ?? '' }));
        await qc.invalidateQueries({ queryKey: ['family'] });
        setParams(r.child ? { child: r.child.id } : {}, { replace: true });
      })
      .catch((e: unknown) => {
        toastError(e);
        setParams({}, { replace: true });
      });
  }, [invite, parent, qc, setParams, tr]);

  return (
    <div className="page-narrow space-y-5">
      <PageHeader title={tr.t('family.title')} subtitle={tr.t('family.subtitle')} />
      <FamilyRequests />
      {me.accountType === 'student' && (
        <>
          <MyControls />
          <FamilyCode />
          <InviteParent />
        </>
      )}
      {parent && (
        <section className="card space-y-3 p-4">
          <h2 className="font-black">{tr.t('family.linkTitle')}</h2>
          <p className="muted text-sm">{tr.t('family.linkHint')}</p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const res = await api.family.link(code.trim());
                toast(tr.t('family.linked', { name: res.child?.displayName ?? '' }));
                setCode('');
                await qc.invalidateQueries({ queryKey: ['family'] });
                if (res.child) setParams({ child: res.child.id });
              } catch (err) {
                toastError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              label={tr.t('family.code')}
              value={code}
              maxLength={8}
              dir="ltr"
              className="font-mono tracking-widest uppercase"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              wrapperClassName="w-48"
            />
            <Button type="submit" icon={<Link2 className="size-4" />} loading={busy} disabled={code.trim().length !== 8}>
              {tr.t('family.link')}
            </Button>
          </form>
        </section>
      )}
      {parent && <RequestChild />}
      {fam.isPending ? (
        <CardSkeletons count={2} />
      ) : fam.error ? (
        <ErrorState error={fam.error} onRetry={() => void fam.refetch()} />
      ) : (
        parent && (
          <>
            {!fam.data.children.length ? (
              <EmptyState title={tr.t('family.noChildren')} />
            ) : (
              <ul className="flex flex-wrap gap-2" role="tablist">
                {fam.data.children.map((c) => (
                  <li key={c.id} className="flex items-center">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selected === c.id}
                      className={cx('card flex items-center gap-2 px-3 py-2', selected === c.id && 'border-primary bg-soft')}
                      onClick={() => setParams({ child: c.id })}
                    >
                      <Avatar name={c.displayName} url={c.avatarUrl} size="sm" />
                      <span className="text-start">
                        <b className="block text-sm" dir="auto">
                          {c.displayName}
                        </b>
                        <span className="muted text-xs">{tr.t('family.thisWeek', { minutes: c.minutesThisWeek })}</span>
                      </span>
                      <RiskBadge level={c.risk} />
                    </button>
                    <IconButton
                      size="sm"
                      label={tr.t('family.unlink')}
                      onClick={async () => {
                        if (!(await confirmDialog({ title: tr.t('family.unlinkConfirm', { name: c.displayName }), danger: true }))) return;
                        try {
                          await api.family.unlink(c.id);
                          setParams({});
                          await qc.invalidateQueries({ queryKey: ['family'] });
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            {selected &&
              (report.isPending ? (
                <CardSkeletons count={3} />
              ) : report.error ? (
                <ErrorState error={report.error} onRetry={() => void report.refetch()} />
              ) : (
                <ChildReport report={report.data} />
              ))}
          </>
        )
      )}
    </div>
  );
}
