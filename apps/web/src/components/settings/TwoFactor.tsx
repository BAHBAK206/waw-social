import { useQuery } from '@tanstack/react-query';
import { Download, KeyRound, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { useT } from '@/lib/i18n';
import { promptDialog, toastError } from '@/lib/ui';

/** Settings → Account: turn two-step sign-in on (QR code or key + a code) or off, and get new recovery codes. */
export function TwoFactorSection() {
  const tr = useT();
  const q = useQuery({ queryKey: ['me', '2fa'], queryFn: () => api.twoFactor.get() });
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!setup) return setQr(null);
    void QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }).then(setQr);
  }, [setup]);
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
    <section className="card space-y-3 p-4" aria-label={tr.t('twoFactor.title')}>
      <h3 className="flex items-center gap-2 font-black">
        <KeyRound className="size-4" aria-hidden /> {tr.t('twoFactor.title')}
        <span className={q.data?.enabled ? 'badge badge-ok' : 'badge'}>{q.data?.enabled ? tr.t('twoFactor.on') : tr.t('twoFactor.off')}</span>
      </h3>
      <p className="muted text-sm">{tr.t('twoFactor.hint')}</p>
      {codes && (
        <div className="space-y-2 rounded-[var(--radius-control)] bg-soft p-3">
          <p className="font-bold">{tr.t('twoFactor.recovery')}</p>
          <p className="text-sm text-warn">{tr.t('twoFactor.recoveryHint')}</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm" dir="ltr">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="size-4" />}
            onClick={() => downloadBlob(new Blob([codes.join('\n')], { type: 'text/plain' }), 'qubedu-recovery-codes.txt')}
          >
            {tr.t('twoFactor.download')}
          </Button>
        </div>
      )}
      {!q.data?.enabled && !setup && (
        <Button loading={busy} onClick={() => void run(async () => setSetup(await api.twoFactor.setup()))}>
          {tr.t('twoFactor.start')}
        </Button>
      )}
      {setup && (
        <div className="space-y-3">
          <p className="text-sm">{tr.t('twoFactor.scan')}</p>
          {qr && <img src={qr} alt="" className="size-44 rounded-[var(--radius-control)] bg-white p-2" />}
          <p className="text-sm">
            {tr.t('twoFactor.key')}:{' '}
            <code className="font-mono break-all" dir="ltr">
              {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
            </code>
          </p>
          <a href={setup.uri} className="link inline-flex items-center gap-1 text-sm">
            <Smartphone className="size-4" aria-hidden /> {tr.t('twoFactor.openApp')}
          </a>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await api.twoFactor.enable(code.trim());
                setCodes(r.recoveryCodes);
                setSetup(null);
                setCode('');
              });
            }}
          >
            <Input
              label={tr.t('twoFactor.code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              className="font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              wrapperClassName="w-40"
            />
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              {tr.t('twoFactor.confirm')}
            </Button>
          </form>
        </div>
      )}
      {q.data?.enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="muted text-sm">{tr.t('twoFactor.recoveryLeft', { count: q.data.recoveryLeft })}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const c = await promptDialog({ title: tr.t('twoFactor.newCodes'), input: { label: tr.t('twoFactor.code') } });
              if (c) void run(async () => setCodes((await api.twoFactor.newRecoveryCodes(c.trim())).recoveryCodes));
            }}
          >
            {tr.t('twoFactor.newCodes')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-err"
            onClick={async () => {
              const password = await promptDialog({ title: tr.t('twoFactor.disable'), input: { label: tr.t('twoFactor.password'), type: 'password' } });
              if (!password) return;
              const c = await promptDialog({ title: tr.t('twoFactor.disable'), input: { label: tr.t('twoFactor.code') } });
              if (c) void run(() => api.twoFactor.disable(password, c.trim()).then(() => setCodes(null)));
            }}
          >
            {tr.t('twoFactor.disable')}
          </Button>
        </div>
      )}
    </section>
  );
}
