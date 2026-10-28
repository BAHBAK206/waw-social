import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Text } from '@/components/ui';
import { TwoFactorRequiredError } from '@qubedu/api-client';
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
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = ticket ? await api.auth.loginTwoFactor(ticket, code.trim()) : await api.auth.login({ email: email.trim(), password });
      useAppearance.getState().replace(me.appearance);
    } catch (e) {
      if (e instanceof TwoFactorRequiredError) setTicket(e.ticket);
      else {
        setError(errorMessage(e, tr));
        if (ticket && (e as { code?: string }).code === 'two_factor_expired') setTicket(null);
      }
    } finally {
      setBusy(false);
    }
  };
  if (ticket)
    return (
      <AuthShell title={tr.t('twoFactor.loginTitle')} subtitle={tr.t('twoFactor.loginHint')}>
        <Input
          label={tr.t('twoFactor.code')}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={12}
          autoFocus
          onSubmitEditing={submit}
        />
        {error ? (
          <Text color={t.err} weight="bold" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button title={tr.t('twoFactor.verify')} onPress={submit} loading={busy} disabled={code.trim().length < 6} />
      </AuthShell>
    );
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
