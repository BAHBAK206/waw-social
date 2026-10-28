import { TRANSFER_METHODS, type Attachment, type CatalogCourseDto, type TransferMethod } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, CreditCard, Landmark, Paperclip, Send, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { UploadButton } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Online payment buttons: Paymob card / wallet (EGP) and Stripe. */
export function OnlinePay({ c, run, busy }: { c: CatalogCourseDto; run: (key: string, fn: () => Promise<void>) => void; busy: string | null }) {
  const tr = useT();
  const [phone, setPhone] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const price = formatPrice(c.priceCents, c.currency, tr);
  const go = (method: CatalogCourseDto['paymentMethods'][number], extra: { phone?: string } = {}) =>
    run(method, async () => {
      const { url } = await api.catalog.checkout(c.id, { method, ...extra });
      window.location.assign(url);
    });
  return (
    <div className="flex flex-wrap items-end gap-2">
      {c.paymentMethods.includes('paymob_card') && (
        <Button icon={<CreditCard className="size-4" />} loading={busy === 'paymob_card'} onClick={() => go('paymob_card')}>
          {tr.t('payments.paymobCard', { price })}
        </Button>
      )}
      {c.paymentMethods.includes('paymob_wallet') &&
        (walletOpen ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              go('paymob_wallet', { phone: phone.replace(/\s+/g, '') });
            }}
          >
            <Input
              label={tr.t('payments.walletPhone')}
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              wrapperClassName="w-48"
            />
            <Button type="submit" loading={busy === 'paymob_wallet'} disabled={phone.replace(/\D/g, '').length < 10}>
              {tr.t('payments.walletGo')}
            </Button>
          </form>
        ) : (
          <Button variant="outline" icon={<Smartphone className="size-4" />} onClick={() => setWalletOpen(true)}>
            {tr.t('payments.paymobWallet', { price })}
          </Button>
        ))}
      {c.paymentMethods.includes('stripe') && (
        <Button
          variant={c.paymentMethods.length > 1 ? 'outline' : 'primary'}
          icon={<CreditCard className="size-4" />}
          loading={busy === 'stripe'}
          onClick={() => go('stripe')}
        >
          {tr.t('catalog.pay', { price })}
        </Button>
      )}
    </div>
  );
}

/** InstaPay / wallet / bank transfer: the teacher's details, then the student's reference and receipt. */
export function TransferPay({ c, authed, login }: { c: CatalogCourseDto; authed: boolean; login: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const info = c.transferInfo!;
  const offered = TRANSFER_METHODS.filter((m) => !!info[m]);
  const [method, setMethod] = useState<TransferMethod>(offered[0] ?? 'instapay');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const mine = c.myTransfer;
  const icon = { instapay: <Send className="size-4" />, wallet: <Smartphone className="size-4" />, bank: <Landmark className="size-4" /> };
  if (mine?.status === 'pending') return <p className="rounded-[var(--radius-control)] bg-soft p-3 text-sm font-bold">{tr.t('payments.pending')}</p>;
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <h3 className="font-black">{tr.t('payments.orTransfer')}</h3>
      {mine?.status === 'rejected' && !again && (
        <div className="space-y-2 rounded-[var(--radius-control)] bg-err/10 p-3 text-sm">
          <p className="font-bold text-err">{tr.t('payments.rejected', { reason: mine.reason ?? '' })}</p>
          <Button size="sm" variant="outline" onClick={() => setAgain(true)}>
            {tr.t('payments.sendAgain')}
          </Button>
        </div>
      )}
      {(mine?.status !== 'rejected' || again) && (
        <>
          <p className="muted text-sm">{tr.t('payments.transferSteps', { price: formatPrice(c.priceCents, c.currency, tr) })}</p>
          <ul className="space-y-2">
            {offered.map((m) => (
              <li key={m} className="flex items-center gap-3 rounded-[var(--radius-control)] bg-soft p-3">
                {icon[m]}
                <span className="min-w-0 flex-1">
                  <span className="muted block text-xs">{tr.t(`payments.methods.${m}`)}</span>
                  <span className="block font-bold break-words" dir="auto">
                    {info[m]}
                  </span>
                </span>
                <IconButton
                  size="sm"
                  label={tr.t('payments.copy')}
                  onClick={() => void navigator.clipboard.writeText(info[m] ?? '').then(() => toast(tr.t('payments.copied')))}
                >
                  <Copy className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          {info.note && (
            <p className="text-sm" dir="auto">
              {info.note}
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!receipt) return;
              setBusy(true);
              api.catalog
                .transfer(c.id, { method, reference: reference.trim(), receipt, note: note.trim() })
                .then(async () => {
                  toast(tr.t('payments.sent'));
                  setAgain(false);
                  await qc.invalidateQueries({ queryKey: ['catalog'] });
                })
                .catch(toastError)
                .finally(() => setBusy(false));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={tr.t('payments.method')}
                value={method}
                onChange={(e) => setMethod(e.target.value as TransferMethod)}
                options={offered.map((m) => ({ value: m, label: tr.t(`payments.methods.${m}`) }))}
              />
              <Input
                label={tr.t('payments.reference')}
                hint={tr.t('payments.referenceHint')}
                value={reference}
                maxLength={80}
                dir="auto"
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {authed ? (
                <UploadButton
                  purpose="receipt"
                  variant="outline"
                  accept="image/*,application/pdf"
                  icon={<Paperclip className="size-4" />}
                  onUploaded={(r) => setReceipt({ url: r.url, name: r.name, mime: r.mime, size: r.size, kind: r.kind })}
                >
                  {tr.t('payments.receipt')}
                </UploadButton>
              ) : (
                <Button variant="outline" icon={<Paperclip className="size-4" />} onClick={login}>
                  {tr.t('payments.receipt')}
                </Button>
              )}
              {receipt && (
                <span className="muted truncate text-sm" dir="auto">
                  {receipt.name}
                </span>
              )}
            </div>
            <Textarea label={tr.t('payments.note')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" loading={busy} disabled={!receipt || reference.trim().length < 3}>
              {tr.t('payments.send')}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
