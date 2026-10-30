import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { AuthLayout } from './AuthLayout';

export default function ForgotPage() {
  const tr = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout
      title={tr.t('auth.forgotTitle')}
      subtitle={tr.t('auth.forgotSubtitle')}
      footer={
        <Link to="/login" className="link">
          {tr.t('common.back')}
        </Link>
      }
    >
      {sent ? (
        <div className="card flex items-start gap-3 p-4">
          <MailCheck className="size-6 shrink-0 text-ok" aria-hidden />
          <p className="font-bold">{tr.t('auth.linkSent')}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.auth.requestReset(email.trim());
              setSent(true);
            } catch (err) {
              setError(errorMessage(err, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <NoticeCard tone="err">{error}</NoticeCard>}
          <Input label={tr.t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" block loading={busy} disabled={!email}>
            {tr.t('auth.sendLink')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
