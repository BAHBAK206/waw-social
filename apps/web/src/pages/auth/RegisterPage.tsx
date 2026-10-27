import { LIMITS } from '@qubedu/shared';
import { GraduationCap, School } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { afterSignIn } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { errorMessage, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { AuthLayout, PasswordInput } from './AuthLayout';
import { safeNext } from './LoginPage';

export default function RegisterPage() {
  const tr = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const open = useSession((s) => s.config?.registrationOpen ?? true);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', accountType: 'student' as 'student' | 'teacher' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.displayName.trim().length >= LIMITS.displayName.min && /.+@.+\..+/.test(form.email) && form.password.length >= LIMITS.password.min;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api.auth.register({
        ...form,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        language: useAppearance.getState().appearance.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      void afterSignIn(me);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err, tr));
    } finally {
      setBusy(false);
    }
  };

  const types = [
    { key: 'student' as const, label: tr.t('auth.student'), icon: GraduationCap },
    { key: 'teacher' as const, label: tr.t('auth.teacher'), icon: School },
  ];

  return (
    <AuthLayout
      title={tr.t('auth.registerTitle')}
      subtitle={tr.t('auth.registerSubtitle')}
      footer={
        <>
          {tr.t('auth.haveAccount')}{' '}
          <Link to="/login" className="link">
            {tr.t('auth.signIn')}
          </Link>
        </>
      }
    >
      {!open ? (
        <NoticeCard tone="warn">{tr.t('errors.registration_closed')}</NoticeCard>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <NoticeCard tone="err">{error}</NoticeCard>}
          <Input
            label={tr.t('auth.displayName')}
            autoComplete="name"
            value={form.displayName}
            onChange={(e) => set('displayName')(e.target.value)}
            maxLength={LIMITS.displayName.max}
            required
          />
          <Input
            label={tr.t('auth.email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            required
          />
          <PasswordInput label={tr.t('auth.password')} value={form.password} onChange={set('password')} autoComplete="new-password" showStrength />
          <fieldset>
            <legend className="field-label">{tr.t('auth.accountType')}</legend>
            <div className="grid grid-cols-2 gap-3">
              {types.map((t) => (
                <label
                  key={t.key}
                  className={cx(
                    'card flex cursor-pointer items-center gap-3 p-3 transition-colors',
                    form.accountType === t.key ? 'border-primary bg-soft text-ink' : 'hover:border-primary',
                  )}
                >
                  <input type="radio" name="accountType" className="sr-only" checked={form.accountType === t.key} onChange={() => set('accountType')(t.key)} />
                  <t.icon className="size-5" aria-hidden />
                  <span className="font-bold">{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="muted text-xs">
            {tr.t('auth.agree')}{' '}
            <Link to="/terms" className="link">
              {tr.t('nav.terms')}
            </Link>{' '}
            ·{' '}
            <Link to="/privacy" className="link">
              {tr.t('nav.privacy')}
            </Link>
          </p>
          <Button type="submit" size="lg" block loading={busy} disabled={!valid}>
            {tr.t('auth.signUp')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
