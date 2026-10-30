import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { confirmDialog, toastError } from '@/lib/ui';
import { AuthLayout } from './AuthLayout';

/** A parent approves (or declines) an under-13 account from the emailed link. */
export default function ConsentPage() {
  const tr = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const q = useQuery({ queryKey: ['consent', token], queryFn: () => api.auth.consentInfo(token), enabled: !!token, retry: false });
  const [done, setDone] = useState<'approved' | 'declined' | null>(null);
  const [busy, setBusy] = useState(false);
  const name = q.data?.childName ?? '';
  const decide = async (approve: boolean) => {
    if (!approve && !(await confirmDialog({ title: tr.t('consent.confirmDecline', { name }), danger: true }))) return;
    setBusy(true);
    try {
      await api.auth.consent(token, approve);
      setDone(approve ? 'approved' : 'declined');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={name ? tr.t('consent.pageTitle', { name }) : tr.t('consent.bannerTitle')}>
      <div className="space-y-4">
        {q.error ? (
          <NoticeCard tone="err">{errorMessage(q.error, tr)}</NoticeCard>
        ) : !q.data ? null : done ? (
          <>
            <NoticeCard tone="info">{tr.t(done === 'approved' ? 'consent.approved' : 'consent.declined', { name })}</NoticeCard>
            {done === 'approved' && (
              <Link to="/register?type=parent" className="btn btn-soft w-full justify-center">
                {tr.t('consent.parentAccount')}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="flex gap-3">
              <ShieldCheck className="size-6 shrink-0 text-ok" aria-hidden />
              <span>{tr.t('consent.pageHint', { name })}</span>
            </p>
            <Button size="lg" block loading={busy} onClick={() => void decide(true)}>
              {tr.t('consent.approve')}
            </Button>
            <Button variant="ghost" block className="text-err" disabled={busy} onClick={() => void decide(false)}>
              {tr.t('consent.decline')}
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
