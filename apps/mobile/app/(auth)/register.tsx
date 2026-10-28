import { LIMITS, birthYearChoices } from '@qubedu/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { SelectField } from '@/components/kit';
import { Button, Chip, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { errorMessage, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function RegisterScreen() {
  const tr = useT();
  const t = useTheme();
  const open = useSession((s) => s.config?.registrationOpen ?? true);
  const [f, setF] = useState({ displayName: '', email: '', password: '', accountType: 'student' as 'student' | 'teacher' | 'parent', birthYear: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = f.displayName.trim().length >= LIMITS.displayName.min && /.+@.+\..+/.test(f.email) && f.password.length >= LIMITS.password.min;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.register({
        ...f,
        birthYear: f.birthYear ? Number(f.birthYear) : undefined,
        displayName: f.displayName.trim(),
        email: f.email.trim(),
        language: useAppearance.getState().appearance.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (e) {
      setError(errorMessage(e, tr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title={tr.t('auth.registerTitle')} subtitle={tr.t('auth.registerSubtitle')}>
      {!open ? (
        <Text color={t.warn} weight="bold">
          {tr.t('errors.registration_closed')}
        </Text>
      ) : (
        <>
          <Input
            label={tr.t('auth.displayName')}
            value={f.displayName}
            onChangeText={(v) => setF({ ...f, displayName: v })}
            autoComplete="name"
            maxLength={LIMITS.displayName.max}
          />
          <Input
            label={tr.t('auth.email')}
            value={f.email}
            onChangeText={(v) => setF({ ...f, email: v })}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Input
            label={tr.t('auth.password')}
            value={f.password}
            onChangeText={(v) => setF({ ...f, password: v })}
            secureTextEntry
            autoComplete="new-password"
            error={f.password && f.password.length < LIMITS.password.min ? tr.t('errors.invalid_input') : null}
          />
          <View style={{ gap: 6 }}>
            <Text weight="bold" size={13} muted>
              {tr.t('auth.accountType')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={tr.t('auth.student')} active={f.accountType === 'student'} onPress={() => setF({ ...f, accountType: 'student' })} />
              <Chip label={tr.t('auth.teacher')} active={f.accountType === 'teacher'} onPress={() => setF({ ...f, accountType: 'teacher' })} />
              <Chip label={tr.t('auth.parent')} active={f.accountType === 'parent'} onPress={() => setF({ ...f, accountType: 'parent' })} />
            </View>
          </View>
          <SelectField
            label={tr.t('auth.birthYear')}
            value={f.birthYear}
            placeholder="—"
            onChange={(v) => setF({ ...f, birthYear: v })}
            options={birthYearChoices().map((y) => ({ value: String(y), label: String(y) }))}
          />
          <Text muted size={12}>
            {tr.t('auth.birthYearHint')}
          </Text>
          {error ? (
            <Text color={t.err} weight="bold" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button title={tr.t('auth.signUp')} onPress={submit} loading={busy} disabled={!valid} />
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text muted>{tr.t('auth.haveAccount')}</Text>
        <Link href="/login">
          <Text weight="bold" color={t.primaryInk}>
            {tr.t('auth.signIn')}
          </Text>
        </Link>
      </View>
    </AuthShell>
  );
}
