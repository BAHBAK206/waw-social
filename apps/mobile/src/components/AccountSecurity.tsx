import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Badge } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

/** Settings → Account: two-step sign-in with an authenticator app on this phone. */
export function TwoFactorCard() {
  const tr = useT();
  const t = useTheme();
  const q = useQuery({ queryKey: ['me', '2fa'], queryFn: () => api.twoFactor.get() });
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text weight="black" style={{ flex: 1 }}>
          {tr.t('twoFactor.title')}
        </Text>
        <Badge tone={q.data?.enabled ? 'ok' : 'neutral'} label={q.data?.enabled ? tr.t('twoFactor.on') : tr.t('twoFactor.off')} />
      </View>
      <Text muted size={13}>
        {tr.t('twoFactor.hint')}
      </Text>
      {codes ? (
        <View style={{ gap: 6, backgroundColor: t.bg2, borderRadius: t.radiusControl, padding: 10 }}>
          <Text weight="bold">{tr.t('twoFactor.recovery')}</Text>
          <Text size={12} style={{ color: t.warn }}>
            {tr.t('twoFactor.recoveryHint')}
          </Text>
          <Text selectable style={{ fontFamily: 'monospace' }}>
            {codes.join('\n')}
          </Text>
          <Button
            small
            variant="outline"
            icon="share-outline"
            title={tr.t('twoFactor.download')}
            onPress={async () => {
              const file = new File(Paths.cache, 'qubedu-recovery-codes.txt');
              file.write(codes.join('\n'));
              await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
            }}
          />
        </View>
      ) : null}
      {!q.data?.enabled && !setup ? (
        <Button title={tr.t('twoFactor.start')} loading={busy} onPress={() => void run(async () => setSetup(await api.twoFactor.setup()))} />
      ) : null}
      {setup ? (
        <View style={{ gap: 8 }}>
          <Button
            variant="soft"
            icon="phone-portrait-outline"
            title={tr.t('twoFactor.openApp')}
            onPress={() => void Linking.openURL(setup.uri).catch(() => undefined)}
          />
          <Text size={13}>{tr.t('twoFactor.key')}:</Text>
          <Text selectable weight="bold" style={{ fontFamily: 'monospace' }}>
            {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
          </Text>
          <Button
            small
            variant="ghost"
            icon="copy-outline"
            title={tr.t('payments.copy')}
            onPress={async () => {
              await Clipboard.setStringAsync(setup.secret);
              toast(tr.t('common.copied'));
            }}
          />
          <Input label={tr.t('twoFactor.code')} keyboardType="number-pad" maxLength={6} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} />
          <Button
            title={tr.t('twoFactor.confirm')}
            disabled={code.length !== 6}
            loading={busy}
            onPress={() =>
              void run(async () => {
                setCodes((await api.twoFactor.enable(code)).recoveryCodes);
                setSetup(null);
                setCode('');
              })
            }
          />
        </View>
      ) : null}
      {q.data?.enabled ? (
        off ? (
          <View style={{ gap: 8 }}>
            <Input label={tr.t('twoFactor.password')} secureTextEntry value={password} onChangeText={setPassword} />
            <Input label={tr.t('twoFactor.code')} value={code} onChangeText={setCode} autoCapitalize="none" />
            <Button
              variant="danger"
              title={tr.t('twoFactor.disable')}
              disabled={!password || code.trim().length < 6}
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await api.twoFactor.disable(password, code.trim());
                  setOff(false);
                  setPassword('');
                  setCode('');
                  setCodes(null);
                })
              }
            />
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Text muted size={12}>
              {tr.t('twoFactor.recoveryLeft', { count: q.data.recoveryLeft })}
            </Text>
            <Button small variant="ghost" title={tr.t('twoFactor.disable')} onPress={() => setOff(true)} />
          </View>
        )
      ) : null}
    </Card>
  );
}

/** Under 13 and waiting for a parent's approval: what's off, and sending the request again. */
export function ConsentCard() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me?.consentPending) return null;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('consent.bannerTitle')}</Text>
      <Text muted size={13}>
        {tr.t('consent.bannerHint')}
      </Text>
      <Input label={tr.t('consent.parentEmail')} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Button
        small
        variant="soft"
        title={tr.t('consent.resend')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await api.consent.resend(email.trim() || undefined);
            toast(tr.t('consent.sent'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
