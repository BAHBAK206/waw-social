import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function ForgotScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell title={tr.t('auth.forgotTitle')} subtitle={tr.t('auth.forgotSubtitle')}>
      {sent ? (
        <>
          <Text weight="bold">{tr.t('auth.linkSent')}</Text>
          <Button title={tr.t('auth.resetTitle')} variant="soft" onPress={() => router.push('/reset' as never)} />
        </>
      ) : (
        <>
          <Input label={tr.t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {error ? <Text color={t.err}>{error}</Text> : null}
          <Button
            title={tr.t('auth.sendLink')}
            loading={busy}
            disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.auth.requestReset(email.trim());
                setSent(true);
              } catch (e) {
                setError(errorMessage(e, tr));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      <Link href="/login" style={{ alignSelf: 'center' }}>
        <Text weight="bold" color={t.primaryInk}>
          {tr.t('common.back')}
        </Text>
      </Link>
    </AuthShell>
  );
}
