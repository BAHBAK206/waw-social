import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast } from '@/lib/ui';

/** Opened from the reset email (qubedu://reset?token=…) or with the code from the email pasted in. */
export default function ResetScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanToken =
    token
      .trim()
      .replace(/^.*[?&]token=/, '')
      .split('&')[0] ?? '';
  return (
    <AuthShell title={tr.t('auth.resetTitle')} subtitle={tr.t('auth.forgotSubtitle')}>
      {!params.token && <Input label={tr.t('auth.resetCode')} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />}
      <Input label={tr.t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      {error ? <Text color={t.err}>{error}</Text> : null}
      <Button
        title={tr.t('common.save')}
        loading={busy}
        disabled={!cleanToken || password.length < 8}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.auth.resetPassword(cleanToken, password);
            toast(tr.t('auth.resetDone'));
            router.replace('/login' as never);
          } catch (e) {
            setError(errorMessage(e, tr));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Link href="/login" style={{ alignSelf: 'center' }}>
        <Text weight="bold" color={t.primaryInk}>
          {tr.t('auth.signIn')}
        </Text>
      </Link>
    </AuthShell>
  );
}
