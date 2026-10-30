import { PHONE_CHANNELS, type PhoneChannel, type PhoneSettingsDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Segmented, SwitchRow } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

/** Parents: confirm a phone number, then get the weekly report and instant alerts on WhatsApp or by SMS. */
export function PhoneAlertsCard() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'phone'], queryFn: () => api.phone.get() });
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<PhoneChannel>('whatsapp');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const s = q.data;
  const save = (d: PhoneSettingsDto) => {
    qc.setQueryData(['me', 'phone'], d);
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (!s) return null;
  const channels = PHONE_CHANNELS.filter((c) => s.available[c]);
  const tabs = channels.map((c) => ({ key: c, label: tr.t(`phone.channels.${c}`) }));
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('phone.title')}</Text>
      <Text muted size={13}>
        {tr.t('phone.hint')}
      </Text>
      {!channels.length ? (
        <Text>{tr.t('phone.unavailable')}</Text>
      ) : s.verified && !editing ? (
        <>
          <Text weight="bold" style={{ color: t.ok }}>
            {tr.t('phone.verified', { phone: s.phone ?? '' })}
          </Text>
          {tabs.length > 1 && (
            <Segmented tabs={tabs} value={s.channel} onChange={(c) => void run('channel', async () => save(await api.phone.update({ channel: c })))} />
          )}
          <SwitchRow
            label={tr.t('phone.weekly')}
            hint={tr.t('phone.weeklyHint')}
            value={s.weekly}
            onChange={(v) => void run('weekly', async () => save(await api.phone.update({ weekly: v })))}
          />
          <SwitchRow
            label={tr.t('phone.alerts')}
            hint={tr.t('phone.alertsHint')}
            value={s.alerts}
            onChange={(v) => void run('alerts', async () => save(await api.phone.update({ alerts: v })))}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              small
              variant="outline"
              title={tr.t('phone.test')}
              loading={busy === 'test'}
              onPress={() =>
                void run('test', async () => {
                  await api.phone.test();
                  toast(tr.t('phone.testSent'));
                })
              }
            />
            <Button small variant="ghost" title={tr.t('phone.change')} onPress={() => setEditing(true)} />
            <Button
              small
              variant="ghost"
              title={tr.t('phone.remove')}
              loading={busy === 'remove'}
              onPress={() => void run('remove', async () => save(await api.phone.remove()))}
            />
          </View>
        </>
      ) : (
        <>
          <Input
            label={tr.t('phone.number')}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="01001234567"
            value={phone}
            onChangeText={setPhone}
          />
          <Text muted size={12}>
            {tr.t('phone.numberHint')}
          </Text>
          {tabs.length > 1 && <Segmented tabs={tabs} value={channels.includes(channel) ? channel : channels[0]!} onChange={setChannel} />}
          <Button
            title={s.pending ? tr.t('phone.resend') : tr.t('phone.sendCode')}
            disabled={phone.replace(/\D/g, '').length < 8}
            loading={busy === 'send'}
            onPress={() =>
              void run('send', async () => {
                save(await api.phone.start({ phone: phone.trim(), channel: channels.includes(channel) ? channel : channels[0]! }));
                setCode('');
              })
            }
          />
          {s.pending ? (
            <View style={{ gap: 8 }}>
              <Text>{tr.t('phone.codeSent', { phone: s.pending })}</Text>
              <Input
                label={tr.t('phone.code')}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              />
              <Button
                title={tr.t('phone.confirm')}
                disabled={code.length !== 6}
                loading={busy === 'verify'}
                onPress={() =>
                  void run('verify', async () => {
                    save(await api.phone.verify(code));
                    setEditing(false);
                    setPhone('');
                  })
                }
              />
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}
