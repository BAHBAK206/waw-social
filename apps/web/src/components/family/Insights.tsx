import type { RiskLevel, RiskReason, StudentInsightDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Heart, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

export function RiskBadge({ level }: { level: RiskLevel }) {
  const tr = useT();
  return <span className={cx('badge', level === 'high' ? 'badge-err' : level === 'watch' ? 'badge-warn' : 'badge-ok')}>{tr.t(`insights.level.${level}`)}</span>;
}

export function ReasonChips({ reasons }: { reasons: RiskReason[] }) {
  const tr = useT();
  if (!reasons.length) return null;
  return (
    <p className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className="badge">
          {tr.t(`insights.reason.${r}`)}
        </span>
      ))}
    </p>
  );
}

/** One student row: risk, reasons, numbers behind them, and the teacher's actions. */
export function InsightRow({ row, courseId, extra }: { row: StudentInsightDto; courseId?: string; extra?: string }) {
  const tr = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const s = row.signals;
  return (
    <li className="card flex flex-wrap items-start gap-3 p-3">
      <Avatar name={row.student.displayName} url={row.student.avatarUrl} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <b dir="auto">{row.student.displayName}</b>
          <RiskBadge level={row.risk.level} />
        </p>
        {extra && <p className="muted text-xs">{extra}</p>}
        <ReasonChips reasons={row.risk.reasons} />
        <p className="muted text-xs">
          {row.lastSeenAt ? tr.t('insights.lastSeen', { time: relativeTime(row.lastSeenAt, tr) }) : tr.t('insights.never')}
          {' · '}
          {tr.t('insights.minutes', { minutes: s.minutesThisWeek })}
          {s.missing > 0 && ` · ${tr.t('insights.missing', { count: s.missing })}`}
          {s.gradeAvg !== null && ` · ${tr.t('insights.grade', { pct: s.gradeAvg })}`}
        </p>
      </div>
      <div className="flex gap-2">
        {courseId && (
          <Button size="sm" variant="soft" icon={<Heart className="size-4" />} onClick={() => setOpen(true)}>
            {tr.t('insights.nudge')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          icon={<MessageCircle className="size-4" />}
          onClick={async () => {
            try {
              const conv = await api.chat.direct(row.student.id);
              navigate(`/chat/${conv.id}`);
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('insights.message')}
        </Button>
      </div>
      {courseId && (
        <Modal
          open={open}
          size="sm"
          onClose={() => setOpen(false)}
          title={tr.t('insights.nudgeTitle', { name: row.student.displayName })}
          footer={
            <Button
              loading={busy}
              disabled={!message.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.school.nudge(courseId, row.student.id, message.trim());
                  toast(tr.t('insights.nudgeSent'));
                  setOpen(false);
                  setMessage('');
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr.t('common.send')}
            </Button>
          }
        >
          <Textarea label={tr.t('insights.message')} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} dir="auto" />
        </Modal>
      )}
    </li>
  );
}

/** Course tab: every student, who needs help first. */
export function CourseInsights({ courseId }: { courseId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course-insights', courseId], queryFn: () => api.school.insights(courseId) });
  if (q.isPending) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const needs = q.data.students.filter((s) => s.risk.level !== 'ok');
  return (
    <div className="space-y-3">
      <p className="muted text-sm">{tr.t('insights.subtitle')}</p>
      {!needs.length && <EmptyState title={tr.t('insights.allGood')} />}
      <ul className="space-y-2">
        {q.data.students.map((s) => (
          <InsightRow key={s.student.id} row={s} courseId={courseId} />
        ))}
      </ul>
    </div>
  );
}

/** Teachers: students across all their classes who need attention (shown on the classes page). */
export function AtRiskSection({ limit }: { limit?: number }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['at-risk'], queryFn: () => api.school.atRisk(), staleTime: 5 * 60_000 });
  if (!q.data?.items.length) return null;
  const items = limit ? q.data.items.slice(0, limit) : q.data.items;
  return (
    <section id="help" className="mb-6 space-y-2" aria-label={tr.t('insights.title')}>
      <h2 className="text-lg font-black">{tr.t('insights.dashboard', { count: q.data.items.length })}</h2>
      <ul className="space-y-2">
        {items.map((r) => (
          <InsightRow key={r.student.id} row={r} extra={r.courses.join(' · ')} />
        ))}
      </ul>
    </section>
  );
}
