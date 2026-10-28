import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { errorMessage, useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function LoginScreen() {
  const tr = useT();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await api.auth.login({ email: email.trim(), password });
      useAppearance.getState().replace(me.appearance);
    } catch (e) {
      setError(errorMessage(e, tr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title={tr.t('auth.loginTitle')} subtitle={tr.t('auth.loginSubtitle')}>
      <Input
        label={tr.t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Input
        label={tr.t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text color={t.err} weight="bold" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title={tr.t('auth.signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
      <Link href="/forgot" style={{ alignSelf: 'center' }}>
        <Text weight="bold" color={t.primaryInk}>
          {tr.t('auth.forgot')}
        </Text>
      </Link>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text muted>{tr.t('auth.noAccount')}</Text>
        <Link href="/register">
          <Text weight="bold" color={t.primaryInk}>
            {tr.t('auth.signUp')}
          </Text>
        </Link>
      </View>
    </AuthShell>
  );
}
