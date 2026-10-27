import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { AuthLayout } from './AuthLayout';

export default function VerifyPage() {
  const tr = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'failed'>(token ? 'pending' : 'failed');
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setState('ok');
        useSession.getState().patchMe({ emailVerified: true });
      })
      .catch(() => setState('failed'));
  }, [token]);
  return (
    <AuthLayout title={tr.t('auth.verifyTitle')}>
      <div className="card flex items-center gap-3 p-5">
        {state === 'pending' && <Loader2 className="size-6 animate-spin text-ink" aria-hidden />}
        {state === 'ok' && <CheckCircle2 className="size-6 text-ok" aria-hidden />}
        {state === 'failed' && <XCircle className="size-6 text-err" aria-hidden />}
        <p className="font-bold" role="status">
          {state === 'pending' ? tr.t('auth.verifying') : state === 'ok' ? tr.t('auth.verified') : tr.t('auth.verifyFailed')}
        </p>
      </div>
      <ButtonLink to="/" className="mt-6" block>
        {tr.t('gate.goHome')}
      </ButtonLink>
    </AuthLayout>
  );
}
