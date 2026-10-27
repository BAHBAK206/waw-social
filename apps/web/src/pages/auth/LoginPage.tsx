import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { afterSignIn } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { AuthLayout, PasswordInput } from './AuthLayout';

export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const tr = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api.auth.login({ email: email.trim(), password });
      void afterSignIn(me);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={tr.t('auth.loginTitle')}
      subtitle={tr.t('auth.loginSubtitle')}
      footer={
        <>
          {tr.t('auth.noAccount')}{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">
            {tr.t('auth.signUp')}
          </Link>
          <div className="mt-3">
            <Link to="/" className="muted hover:underline">
              {tr.t('auth.continueGuest')}
            </Link>
          </div>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <NoticeCard tone="err">{error}</NoticeCard>}
        <Input label={tr.t('auth.email')} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordInput label={tr.t('auth.password')} value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="text-end">
          <Link to="/forgot" className="link text-sm">
            {tr.t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy} disabled={!email || !password}>
          {tr.t('auth.signIn')}
        </Button>
      </form>
    </AuthLayout>
  );
}
