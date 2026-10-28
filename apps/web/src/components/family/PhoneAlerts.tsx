import { PHONE_CHANNELS, type PhoneChannel, type PhoneSettingsDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Parents: confirm a phone number, then get the weekly report and instant alerts on WhatsApp or by SMS. */
export function PhoneAlerts() {
  const tr = useT();
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
  return (
    <section className="card space-y-4 p-4" aria-label={tr.t('phone.title')}>
      <h3 className="flex items-center gap-2 font-black">
        <MessageCircle className="size-4" aria-hidden /> {tr.t('phone.title')}
      </h3>
      <p className="muted text-sm">{tr.t('phone.hint')}</p>
      {!channels.length ? (
        <p className="rounded-[var(--radius-control)] bg-soft p-3 text-sm">{tr.t('phone.unavailable')}</p>
      ) : s.verified && !editing ? (
        <>
          <p className="font-bold text-ok" dir="auto">
            {tr.t('phone.verified', { phone: s.phone ?? '' })}
          </p>
          <Select
            label={tr.t('phone.channel')}
            value={s.channel}
            onChange={(e) => void run('channel', async () => save(await api.phone.update({ channel: e.target.value as PhoneChannel })))}
            options={channels.map((c) => ({ value: c, label: tr.t(`phone.channels.${c}`) }))}
          />
          <Switch
            checked={s.weekly}
            onChange={(v) => void run('weekly', async () => save(await api.phone.update({ weekly: v })))}
            label={tr.t('phone.weekly')}
            description={tr.t('phone.weeklyHint')}
          />
          <Switch
            checked={s.alerts}
            onChange={(v) => void run('alerts', async () => save(await api.phone.update({ alerts: v })))}
            label={tr.t('phone.alerts')}
            description={tr.t('phone.alertsHint')}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={busy === 'test'}
              onClick={() =>
                void run('test', async () => {
                  await api.phone.test();
                  toast(tr.t('phone.testSent'));
                })
              }
            >
              {tr.t('phone.test')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {tr.t('phone.change')}
            </Button>
            <Button variant="ghost" size="sm" loading={busy === 'remove'} onClick={() => void run('remove', async () => save(await api.phone.remove()))}>
              {tr.t('phone.remove')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <form
            className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run('send', async () => {
                save(await api.phone.start({ phone: phone.trim(), channel: channels.includes(channel) ? channel : channels[0]! }));
                setCode('');
              });
            }}
          >
            <Input
              label={tr.t('phone.number')}
              hint={tr.t('phone.numberHint')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Select
              label={tr.t('phone.channel')}
              value={channels.includes(channel) ? channel : channels[0]}
              onChange={(e) => setChannel(e.target.value as PhoneChannel)}
              options={channels.map((c) => ({ value: c, label: tr.t(`phone.channels.${c}`) }))}
            />
            <Button type="submit" loading={busy === 'send'} disabled={phone.replace(/\D/g, '').length < 8}>
              {s.pending ? tr.t('phone.resend') : tr.t('phone.sendCode')}
            </Button>
          </form>
          {s.pending && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run('verify', async () => {
                  save(await api.phone.verify(code.trim()));
                  setEditing(false);
                  setPhone('');
                });
              }}
            >
              <p className="w-full text-sm" dir="auto">
                {tr.t('phone.codeSent', { phone: s.pending })}
              </p>
              <Input
                label={tr.t('phone.code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                dir="ltr"
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                wrapperClassName="w-40"
              />
              <Button type="submit" loading={busy === 'verify'} disabled={code.length !== 6}>
                {tr.t('phone.confirm')}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
