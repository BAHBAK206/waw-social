import type { PrivateLessonDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Badge, Segmented, Sheet } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';
import { openWebSignedIn } from '@/lib/web';

function BookSheet({ lesson, onClose }: { lesson: PrivateLessonDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [wallet, setWallet] = useState(false);
  const book = useMutation({
    mutationFn: (body: { method?: 'paymob_card' | 'paymob_wallet'; phone?: string }) => api.lessons.book(lesson.id, body),
    onSuccess: async ({ url }) => {
      if (lesson.priceCents > 0) await WebBrowser.openBrowserAsync(url);
      else toast(tr.t('growth.lessons.booked'));
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      onClose();
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      toastError(e);
      onClose();
    },
  });
  const price = formatPrice(lesson.priceCents, lesson.currency, tr);
  // App Store rules: paid services are not sold inside the iPhone app.
  const blocked = lesson.priceCents > 0 && Platform.OS === 'ios';
  return (
    <Sheet open onClose={onClose} title={lesson.title}>
      <View style={{ gap: 10 }}>
        <Text>
          {lesson.teacher.displayName} · {formatDateTime(lesson.startsAt, tr)} · {tr.t('growth.lessons.duration', { count: lesson.durationMin })}
        </Text>
        {blocked ? (
          <Text muted size={13}>
            {tr.t('growth.lessons.iosNote')}
          </Text>
        ) : lesson.priceCents === 0 ? (
          <Button title={tr.t('growth.lessons.bookFree')} loading={book.isPending} onPress={() => book.mutate({})} />
        ) : (
          <>
            <Text muted size={13}>
              {tr.t('growth.lessons.held')}
            </Text>
            <Button
              icon="card-outline"
              title={`${tr.t('growth.lessons.pay')} · ${price}`}
              loading={book.isPending && !wallet}
              onPress={() => book.mutate({ method: 'paymob_card' })}
            />
            {wallet ? (
              <>
                <Input label={tr.t('growth.lessons.walletPhone')} keyboardType="phone-pad" placeholder="01xxxxxxxxx" value={phone} onChangeText={setPhone} />
                <Button
                  variant="outline"
                  title={tr.t('growth.lessons.payWallet')}
                  disabled={phone.replace(/\D/g, '').length < 10}
                  loading={book.isPending}
                  onPress={() => book.mutate({ method: 'paymob_wallet', phone: phone.replace(/\s+/g, '') })}
                />
              </>
            ) : (
              <Button variant="outline" icon="phone-portrait-outline" title={tr.t('growth.lessons.payWallet')} onPress={() => setWallet(true)} />
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}

function Open() {
  const tr = useT();
  const q = useQuery({ queryKey: ['lessons', 'open'], queryFn: () => api.lessons.open() });
  const [pick, setPick] = useState<PrivateLessonDto | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  if (!q.data.items.length) return <Empty title={tr.t('growth.lessons.noSlots')} icon="calendar-outline" />;
  return (
    <View style={{ gap: 8 }}>
      {q.data.items.map((l) => (
        <Card key={l.id} style={{ gap: 6 }} onPress={() => setPick(l)}>
          <Text weight="bold">{l.title}</Text>
          <Text muted size={13}>
            {l.teacher.displayName} · {formatDateTime(l.startsAt, tr)} · {tr.t('growth.lessons.duration', { count: l.durationMin })}
          </Text>
          <Badge label={l.priceCents === 0 ? tr.t('growth.lessons.free') : formatPrice(l.priceCents, l.currency, tr)} tone="primary" />
        </Card>
      ))}
      {pick ? <BookSheet lesson={pick} onClose={() => setPick(null)} /> : null}
    </View>
  );
}

function Mine() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lessons', 'mine'], queryFn: () => api.lessons.mine() });
  const cancel = useMutation({
    mutationFn: (id: string) => api.lessons.cancel(id),
    onSuccess: () => {
      toast(tr.t('growth.lessons.cancelled'));
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
    onError: toastError,
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  if (!q.data.items.length) return <Empty title={tr.t('growth.lessons.noneMine')} icon="calendar-outline" />;
  return (
    <View style={{ gap: 8 }}>
      {q.data.items.map((l) => {
        const teacher = l.mine === 'teacher';
        return (
          <Card key={l.id} style={{ gap: 6 }}>
            <Text weight="bold">{l.title}</Text>
            <Text muted size={13}>
              {formatDateTime(l.startsAt, tr)} · {tr.t('growth.lessons.duration', { count: l.durationMin })} ·{' '}
              {teacher ? (l.student ? tr.t('growth.lessons.by', { name: l.student.displayName }) : tr.t('growth.lessons.free')) : l.teacher.displayName}
            </Text>
            {l.status === 'booked' ? (
              <Badge
                label={l.payStatus === 'paid' ? tr.t('growth.lessons.paid') : tr.t('growth.lessons.pending')}
                tone={l.payStatus === 'paid' ? 'ok' : 'warn'}
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {l.roomId ? (
                <Button
                  small
                  icon="videocam-outline"
                  title={tr.t('growth.lessons.join')}
                  onPress={() => void openWebSignedIn(`/live/${l.roomId}`).catch(toastError)}
                />
              ) : null}
              {teacher || l.payStatus !== 'paid' ? (
                <Button
                  small
                  variant="soft"
                  title={teacher ? tr.t('growth.lessons.cancel') : tr.t('growth.lessons.cancelHold')}
                  loading={cancel.isPending}
                  onPress={() => cancel.mutate(l.id)}
                />
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

export default function LessonsScreen() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const teacher = me?.accountType === 'teacher';
  const [tab, setTab] = useState<'book' | 'mine'>(teacher ? 'mine' : 'book');
  return (
    <Screen>
      <Text muted>{tr.t('growth.lessons.subtitle')}</Text>
      <Segmented
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'book', label: tr.t('growth.lessons.tabBook') },
          { key: 'mine', label: tr.t('growth.lessons.tabMine') },
        ]}
      />
      {teacher ? (
        <Button
          variant="outline"
          icon="add-circle-outline"
          title={tr.t('growth.lessons.tabPublish')}
          onPress={() => void openWebSignedIn('/lessons?tab=publish').catch(toastError)}
        />
      ) : null}
      {tab === 'book' ? <Open /> : <Mine />}
    </Screen>
  );
}
