import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { FeatureGate, Sheet, SwitchRow } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { GuideHint } from '@/components/Guide';

/**
 * Live classes: rooms are listed and created natively; the room itself (camera, mic, screen share, whiteboard, chat,
 * hand raise, moderation) is the same web room, opened inside the app already signed in.
 */
export default function LiveScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const teacher = useSession((s) => s.me?.accountType === 'teacher');
  const [open2, setOpen2] = useState(false);
  const [title, setTitle] = useState('');
  const [chat, setChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const join = (id: string, name: string) => router.push(`/web?path=${encodeURIComponent(`/live/${id}`)}&title=${encodeURIComponent(name)}` as never);
  const rooms = useQuery({ queryKey: ['live-rooms'], queryFn: () => api.live.list(), refetchInterval: 20_000 });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.classes.list() });
  if (rooms.isPending) return <Loading />;
  if (rooms.error) return <ErrorView onRetry={() => void rooms.refetch()} />;
  const open = (url: string) => void Linking.openURL(url);
  return (
    <FeatureGate id="classes">
      <Screen refreshing={rooms.isRefetching} onRefresh={() => void Promise.all([rooms.refetch(), classes.refetch()])}>
        <GuideHint id="classes" />
        {teacher && <Button icon="add" title={tr.t('live.create')} onPress={() => setOpen2(true)} />}
        {!rooms.data.items.length && !classes.data?.items.length ? <Empty title={tr.t('common.empty')} icon="videocam-outline" /> : null}
        {rooms.data.items.map((r) => (
          <Card key={r.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text weight="bold" size={12} color={r.status === 'live' ? t.err : t.text3}>
                {r.status === 'live' ? `● ${tr.t('live.liveNow')}` : r.status === 'ended' ? tr.t('live.ended') : tr.t('live.scheduled')}
              </Text>
              {r.scheduledAt ? (
                <Text muted size={12}>
                  {relativeTime(r.scheduledAt, tr)}
                </Text>
              ) : null}
            </View>
            <Text weight="black" size={17}>
              {r.title}
            </Text>
            <Text muted>{r.host.displayName}</Text>
            <Button small title={tr.t('live.join')} icon="open-outline" disabled={r.status === 'ended'} onPress={() => join(r.id, r.title)} />
          </Card>
        ))}
        {(classes.data?.items.length ?? 0) > 0 && (
          <Text weight="black" size={17} style={{ marginTop: 8 }}>
            {tr.t('live.externalClasses')}
          </Text>
        )}
        {classes.data?.items.map((c) => (
          <Card key={c.id} style={{ gap: 6 }}>
            <Text weight="black">{c.title}</Text>
            {c.subject ? <Text muted>{c.subject}</Text> : null}
            <Button small variant="soft" title={tr.t('live.join')} icon="open-outline" onPress={() => open(c.link)} />
          </Card>
        ))}
        <Sheet
          open={open2}
          onClose={() => setOpen2(false)}
          title={tr.t('live.create')}
          footer={
            <Button
              title={tr.t('live.start')}
              loading={busy}
              disabled={!title.trim()}
              onPress={async () => {
                setBusy(true);
                try {
                  const r = await api.live.create({
                    title: title.trim(),
                    scopeType: 'open',
                    settings: { allowStudentCamera: true, allowStudentMic: true, allowStudentScreen: false, allowChat: chat },
                  });
                  setOpen2(false);
                  setTitle('');
                  void rooms.refetch();
                  join(r.id, r.title);
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          }
        >
          <Input label={tr.t('common.title')} value={title} onChangeText={setTitle} />
          <SwitchRow label={tr.t('live.settings.allowChat')} value={chat} onChange={setChat} />
        </Sheet>
      </Screen>
    </FeatureGate>
  );
}
