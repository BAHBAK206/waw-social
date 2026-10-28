import { TRANSFER_METHODS, type Attachment, type CatalogCourseDto, type TransferMethod } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Segmented, pickDocument } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api, uploadFile } from '@/lib/api';
import { formatDay, formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

/** InstaPay / wallet / bank transfer: the teacher's details, then the student's reference and receipt. */
export function TransferPay({ c, authed, login }: { c: CatalogCourseDto; authed: boolean; login: () => void }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const info = c.transferInfo!;
  const offered = TRANSFER_METHODS.filter((m) => !!info[m]);
  const [method, setMethod] = useState<TransferMethod>(offered[0] ?? 'instapay');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null);
  const [again, setAgain] = useState(false);
  const mine = c.myTransfer;
  if (mine?.status === 'pending')
    return (
      <Card>
        <Text weight="bold">{tr.t('payments.pending')}</Text>
      </Card>
    );
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('payments.orTransfer')}</Text>
      {mine?.status === 'rejected' && !again ? (
        <View style={{ gap: 8 }}>
          <Text weight="bold" style={{ color: t.err }}>
            {tr.t('payments.rejected', { reason: mine.reason ?? '' })}
          </Text>
          <Button small variant="outline" title={tr.t('payments.sendAgain')} onPress={() => setAgain(true)} />
        </View>
      ) : (
        <>
          <Text muted size={13}>
            {tr.t('payments.transferSteps', { price: formatPrice(c.priceCents, c.currency, tr) })}
          </Text>
          {offered.map((m) => (
            <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.bg2, borderRadius: t.radiusControl, padding: 10 }}>
              <View style={{ flex: 1 }}>
                <Text muted size={12}>
                  {tr.t(`payments.methods.${m}`)}
                </Text>
                <Text weight="bold" selectable>
                  {info[m]}
                </Text>
              </View>
              <Button
                small
                variant="ghost"
                icon="copy-outline"
                title={tr.t('payments.copy')}
                onPress={async () => {
                  await Clipboard.setStringAsync(info[m] ?? '');
                  toast(tr.t('payments.copied'));
                }}
              />
            </View>
          ))}
          {info.note ? <Text>{info.note}</Text> : null}
          {offered.length > 1 && (
            <Segmented tabs={offered.map((m) => ({ key: m, label: tr.t(`payments.methods.${m}`) }))} value={method} onChange={setMethod} />
          )}
          <Input label={tr.t('payments.reference')} value={reference} maxLength={80} onChangeText={setReference} />
          <Button
            variant="outline"
            icon="attach-outline"
            title={receipt ? receipt.name : tr.t('payments.receipt')}
            loading={busy === 'upload'}
            onPress={async () => {
              if (!authed) return login();
              const f = await pickDocument(['image/*', 'application/pdf']);
              if (!f) return;
              setBusy('upload');
              try {
                const up = await uploadFile(f, 'receipt');
                setReceipt({ url: up.url, name: up.name, mime: up.mime, size: up.size, kind: up.kind });
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(null);
              }
            }}
          />
          <Input label={tr.t('payments.note')} value={note} maxLength={500} multiline onChangeText={setNote} />
          <Button
            icon="send-outline"
            title={tr.t('payments.send')}
            disabled={!receipt || reference.trim().length < 3}
            loading={busy === 'send'}
            onPress={async () => {
              if (!receipt) return;
              setBusy('send');
              try {
                await api.catalog.transfer(c.id, { method, reference: reference.trim(), receipt, note: note.trim() });
                toast(tr.t('payments.sent'));
                setAgain(false);
                await qc.invalidateQueries({ queryKey: ['catalog'] });
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(null);
              }
            }}
          />
        </>
      )}
    </Card>
  );
}

/** Teacher: transfers waiting for approval, with the receipt. */
export function TransferRequests({ courseId }: { courseId: string }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['transfers', courseId], queryFn: () => api.school.transfers(courseId) });
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (!q.data?.items.length) return null;
  const review = async (id: string, approve: boolean, name: string) => {
    setBusy(id);
    try {
      await api.school.reviewTransfer(id, approve ? { approve } : { approve, reason: reason.trim() });
      if (approve) toast(tr.t('payments.approvedToast', { name }));
      setRefusing(null);
      setReason('');
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ['course', courseId] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('payments.requests')}</Text>
      {q.data.items.map((x) => (
        <View key={x.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text weight="bold">{x.user.displayName}</Text>
            <Badge label={tr.t(`payments.methods.${x.method}`)} />
            <Badge label={tr.t(`payments.status.${x.status}`)} tone={x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'err' : 'primary'} />
          </View>
          <Text muted size={13}>
            {formatPrice(x.amountCents, x.currency, tr)} · {formatDay(x.createdAt, tr)}
          </Text>
          <Text selectable>
            {tr.t('payments.reference')}: {x.reference}
          </Text>
          {x.note ? <Text>{x.note}</Text> : null}
          {x.reason ? <Text style={{ color: t.err }}>{x.reason}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {x.receipt ? (
              <Button
                small
                variant="outline"
                icon="receipt-outline"
                title={tr.t('payments.viewReceipt')}
                onPress={() => void WebBrowser.openBrowserAsync(x.receipt!.url)}
              />
            ) : null}
            {x.status === 'pending' ? (
              <>
                <Button
                  small
                  icon="checkmark"
                  title={tr.t('payments.approve')}
                  loading={busy === x.id && refusing !== x.id}
                  onPress={() => void review(x.id, true, x.user.displayName)}
                />
                <Button small variant="outline" icon="close" title={tr.t('payments.reject')} onPress={() => setRefusing(refusing === x.id ? null : x.id)} />
              </>
            ) : null}
          </View>
          {refusing === x.id ? (
            <View style={{ gap: 6 }}>
              <Input label={tr.t('payments.rejectReason')} value={reason} maxLength={300} onChangeText={setReason} />
              <Button
                small
                variant="danger"
                title={tr.t('payments.reject')}
                disabled={!reason.trim()}
                loading={busy === x.id}
                onPress={() => void review(x.id, false, x.user.displayName)}
              />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
