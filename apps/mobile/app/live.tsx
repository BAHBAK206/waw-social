import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Linking, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ?? 'http://localhost:5173';

/**
 * Live classes use the full web room (camera, screen share, whiteboard). Native WebRTC needs a custom dev client,
 * so the mobile app lists rooms and hands over to the browser, which already carries the signed-in session via the link.
 */
export default function LiveScreen() {
  const tr = useT();
  const t = useTheme();
  const rooms = useQuery({ queryKey: ['live-rooms'], queryFn: () => api.live.list(), refetchInterval: 20_000 });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.classes.list() });
  if (rooms.isPending) return <Loading />;
  if (rooms.error) return <ErrorView onRetry={() => void rooms.refetch()} />;
  const open = (url: string) => void Linking.openURL(url);
  return (
    <Screen refreshing={rooms.isRefetching} onRefresh={() => void Promise.all([rooms.refetch(), classes.refetch()])}>
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
          <Button small title={tr.t('live.join')} icon="open-outline" disabled={r.status === 'ended'} onPress={() => open(`${WEB_URL}/live/${r.id}`)} />
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
    </Screen>
  );
}
