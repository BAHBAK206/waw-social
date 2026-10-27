import { LIMITS } from '@qubedu/shared';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button, ButtonLink } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { AuthLayout, PasswordInput } from './AuthLayout';

export default function ResetPage() {
  const tr = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : tr.t('auth.verifyFailed'));
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout
      title={tr.t('auth.resetTitle')}
      footer={
        <Link to="/login" className="link">
          {tr.t('auth.signIn')}
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4">
          <div className="card flex items-start gap-3 p-4">
            <CheckCircle2 className="size-6 shrink-0 text-ok" aria-hidden />
            <p className="font-bold">{tr.t('auth.resetDone')}</p>
          </div>
          <ButtonLink to="/login" block>
            {tr.t('auth.signIn')}
          </ButtonLink>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.auth.resetPassword(token, password);
              setDone(true);
            } catch (err) {
              setError(errorMessage(err, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <NoticeCard tone="err">{error}</NoticeCard>}
          <PasswordInput label={tr.t('auth.newPassword')} value={password} onChange={setPassword} autoComplete="new-password" showStrength />
          <Button type="submit" size="lg" block loading={busy} disabled={!token || password.length < LIMITS.password.min}>
            {tr.t('common.save')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
