import type { CatalogCourseDto, CouponPreviewDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Badge, FeatureGate } from '@/components/kit';
import { TransferPay } from '@/components/Payments';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

export default function CatalogCourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const authed = useSession((s) => s.status === 'authed');
  const q = useQuery({ queryKey: ['catalog', 'course', id, authed], queryFn: () => api.catalog.get(id!) });
  const [busy, setBusy] = useState<string | null>(null);
  const [voucher, setVoucher] = useState('');
  const [phone, setPhone] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; preview: CouponPreviewDto } | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const c = q.data;
  const run = async (key: string, fn: () => Promise<void>) => {
    if (!authed) {
      router.push('/(auth)/login' as never);
      return;
    }
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const pay = (method: CatalogCourseDto['paymentMethods'][number], phone?: string) =>
    run(method, async () => {
      const { url } = await api.catalog.checkout(c.id, { method, ...(phone ? { phone } : {}), ...(coupon ? { coupon: coupon.code } : {}) });
      await WebBrowser.openBrowserAsync(url);
      // Enrollment arrives with the payment confirmation; check again when the browser closes.
      const fresh = await q.refetch();
      if (fresh.data?.enrolled) {
        toast(tr.t('catalog.paid'));
        await done();
      }
    });
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['catalog'] });
    await qc.invalidateQueries({ queryKey: ['courses'] });
    router.replace(`/course/${c.id}` as never);
  };
  return (
    <FeatureGate id="catalog">
      <Stack.Screen options={{ title: c.title }} />
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Card style={{ gap: 8 }}>
          <Badge label={c.priceCents ? formatPrice(c.priceCents, c.currency, tr) : tr.t('catalog.free')} tone={c.priceCents ? 'primary' : 'ok'} />
          <Text weight="black" size={22}>
            {c.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar name={c.owner.displayName} url={c.owner.avatarUrl} size={24} />
            <Text muted>{tr.t('catalog.by', { name: c.owner.displayName })}</Text>
          </View>
          <Text muted size={13}>
            {tr.t('catalog.members', { count: c.memberCount })} · {tr.t('catalog.outline', c.outline)}
          </Text>
          {c.description ? <Text>{c.description}</Text> : null}
        </Card>
        {c.enrolled ? (
          <Button icon="school-outline" title={tr.t('catalog.open')} onPress={() => router.push(`/course/${c.id}` as never)} />
        ) : c.priceCents === 0 ? (
          <Button
            icon="school-outline"
            title={tr.t('catalog.enroll')}
            loading={busy === 'enroll'}
            onPress={() =>
              void run('enroll', async () => {
                await api.catalog.enroll(c.id);
                await done();
              })
            }
          />
        ) : (
          <Card style={{ gap: 10 }}>
            {/* App Store rules: digital courses can't be sold in the iOS app without in-app purchase. */}
            {(c.paymentMethods.length > 0 || !!c.transferInfo) && Platform.OS === 'ios' ? (
              <Text muted size={13}>
                {tr.t('catalog.notInApp')}
              </Text>
            ) : null}
            {Platform.OS !== 'ios' && c.paymentMethods.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Input
                  label={tr.t('payments.couponLabel')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={couponCode}
                  onChangeText={(v) => setCouponCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <Button
                  variant="outline"
                  icon="pricetag-outline"
                  title={tr.t('payments.couponApply')}
                  disabled={couponCode.length < 4}
                  loading={busy === 'coupon'}
                  onPress={() =>
                    void run('coupon', async () => {
                      try {
                        setCoupon({ code: couponCode, preview: await api.coupons.preview(c.id, couponCode) });
                      } catch (e) {
                        setCoupon(null);
                        throw e;
                      }
                    })
                  }
                />
                {coupon ? (
                  <Text weight="bold" size={13}>
                    {coupon.preview.finalCents === 0
                      ? tr.t('payments.couponFree')
                      : tr.t('payments.couponApplied', {
                          discount: formatPrice(coupon.preview.discountCents, coupon.preview.currency, tr),
                          final: formatPrice(coupon.preview.finalCents, coupon.preview.currency, tr),
                        })}
                  </Text>
                ) : null}
                {coupon?.preview.finalCents === 0 ? (
                  <Button
                    icon="school-outline"
                    title={tr.t('payments.couponGetFree')}
                    loading={busy === 'free'}
                    onPress={() =>
                      void run('free', async () => {
                        await api.catalog.checkout(c.id, { coupon: coupon.code });
                        await done();
                      })
                    }
                  />
                ) : null}
              </View>
            ) : null}
            {Platform.OS !== 'ios' && coupon?.preview.finalCents !== 0
              ? c.paymentMethods.map((m) =>
                  m === 'paymob_wallet' ? (
                    <View key={m} style={{ gap: 6 }}>
                      <Input label={tr.t('payments.walletPhone')} keyboardType="phone-pad" placeholder="01xxxxxxxxx" value={phone} onChangeText={setPhone} />
                      <Button
                        variant="outline"
                        icon="phone-portrait-outline"
                        title={tr.t('payments.paymobWallet', { price: formatPrice(coupon?.preview.finalCents ?? c.priceCents, c.currency, tr) })}
                        disabled={phone.replace(/\D/g, '').length < 10}
                        loading={busy === m}
                        onPress={() => void pay(m, phone.replace(/\s+/g, ''))}
                      />
                    </View>
                  ) : (
                    <Button
                      key={m}
                      icon="card-outline"
                      title={tr.t(m === 'paymob_card' ? 'payments.paymobCard' : 'catalog.pay', {
                        price: formatPrice(coupon?.preview.finalCents ?? c.priceCents, c.currency, tr),
                      })}
                      loading={busy === m}
                      onPress={() => void pay(m)}
                    />
                  ),
                )
              : null}
            <Input
              label={tr.t('catalog.voucher')}
              placeholder="QB-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect={false}
              value={voucher}
              onChangeText={(v) => setVoucher(v.toUpperCase())}
            />
            <Button
              variant="outline"
              icon="ticket-outline"
              title={tr.t('catalog.redeem')}
              disabled={voucher.trim().length < 6}
              loading={busy === 'voucher'}
              onPress={() =>
                void run('voucher', async () => {
                  await api.school.redeem(voucher.trim());
                  await done();
                })
              }
            />
          </Card>
        )}
        {!c.enrolled && c.priceCents > 0 && c.transferInfo && Platform.OS !== 'ios' ? (
          <TransferPay c={c} authed={authed} login={() => router.push('/(auth)/login' as never)} />
        ) : null}
      </Screen>
    </FeatureGate>
  );
}
