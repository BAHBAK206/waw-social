import type { TeacherVerificationDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { UserChip } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CardSkeletons, EmptyState, ErrorState } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { promptDialog, toast, toastError } from '@/lib/ui';

/** Teachers asking to be verified: check the school and proof link, then approve or reject with a reason. */
export function VerificationsTab() {
  const tr = useT();
  const [status, setStatus] = useState<TeacherVerificationDto['status']>('pending');
  const q = useQuery({ queryKey: ['admin', 'verifications', status], queryFn: () => api.admin.verifications(status) });
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(tr.t('common.saved'));
      await q.refetch();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-4">
      <p className="muted text-sm">{tr.t('verification.unlocks')}</p>
      <Tabs
        active={status}
        onChange={setStatus}
        tabs={(['pending', 'approved', 'rejected'] as const).map((k) => ({ key: k, label: tr.t(`verification.statuses.${k}`) }))}
      />
      {q.isPending ? (
        <CardSkeletons count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState title={tr.t('verification.empty')} />
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((v) => (
            <li key={v.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <UserChip user={v.user} className="flex-1" subtitle={<span dir="ltr">{v.user.email}</span>} />
                <span className="muted text-xs">{relativeTime(v.createdAt, tr)}</span>
              </div>
              <p className="text-sm">
                <b>{tr.t('verification.institution')}:</b> <span dir="auto">{v.institution}</span> · <b>{tr.t('verification.subject')}:</b>{' '}
                <span dir="auto">{v.subject}</span>
              </p>
              {v.proofUrl && (
                <a className="link inline-flex items-center gap-1 text-sm" href={v.proofUrl} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">
                  <ExternalLink className="size-4" aria-hidden /> {v.proofUrl}
                </a>
              )}
              {v.note && (
                <p className="rounded-lg bg-soft p-2 text-sm" dir="auto">
                  {v.note}
                </p>
              )}
              {v.status === 'rejected' && v.reason && <p className="muted text-sm">{v.reason}</p>}
              {v.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<BadgeCheck className="size-4" />} onClick={() => void act(() => api.admin.approveVerification(v.id))}>
                    {tr.t('verification.approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<X className="size-4" />}
                    onClick={async () => {
                      const reason = await promptDialog({ title: tr.t('verification.reject'), input: { label: tr.t('verification.rejectReason') } });
                      if (reason !== null) void act(() => api.admin.rejectVerification(v.id, reason));
                    }}
                  >
                    {tr.t('verification.reject')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
