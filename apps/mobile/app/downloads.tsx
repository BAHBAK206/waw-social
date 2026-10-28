import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Badge } from '@/components/kit';
import { Button, Card, Empty, Text } from '@/components/ui';
import { cancelDownload, loadDownloads, removeAllDownloads, removeDownload, useDownloads } from '@/lib/downloads';
import { formatClock, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useNetwork } from '@/lib/network';
import { flushOutbox, useOutbox } from '@/lib/outbox';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm } from '@/lib/ui';

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes > 100 * 1_048_576 ? 0 : 1)} MB`;

/** Lessons saved on this phone, playable without a connection, and offline work waiting to sync. */
export default function DownloadsScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const userId = useSession((s) => s.me?.id);
  const offline = useNetwork((s) => s.offline);
  const { saved, progress } = useDownloads();
  const pending = useOutbox((s) => s.items.filter((i) => i.userId === userId).length);
  useEffect(() => {
    void loadDownloads();
  }, []);
  const mine = Object.values(saved)
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.savedAt - a.savedAt);
  const total = mine.reduce((n, s) => n + s.size, 0);
  const active = Object.entries(progress);
  return (
    <Screen>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={offline ? 'cloud-offline-outline' : 'cloud-done-outline'} size={20} color={offline ? t.warn : t.ok} />
          <Text weight="bold" style={{ flex: 1 }}>
            {offline ? tr.t('offline.offlineNow') : tr.t('offline.onlineNow')}
          </Text>
        </View>
        <Text muted size={13}>
          {tr.t('offline.hint')}
        </Text>
        {pending ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={tr.t('offline.pending', { count: pending })} tone="warn" />
            {!offline ? <Button small variant="ghost" icon="sync-outline" title={tr.t('offline.syncNow')} onPress={() => void flushOutbox()} /> : null}
          </View>
        ) : null}
      </Card>
      {active.map(([id, p]) => (
        <Card key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="download-outline" size={20} color={t.primary} />
          <Text style={{ flex: 1 }}>{p >= 0 ? tr.t('offline.downloading', { pct: Math.round(p * 100) }) : tr.t('offline.downloadingUnknown')}</Text>
          <Button small variant="ghost" title={tr.t('common.cancel')} onPress={() => cancelDownload(id)} />
        </Card>
      ))}
      {!mine.length && !active.length ? <Empty icon="download-outline" title={tr.t('offline.empty')} body={tr.t('offline.emptyHint')} /> : null}
      {mine.map((s) => (
        <Pressable
          key={s.video.id}
          onPress={() => router.push(`/video/${s.video.id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={s.video.title}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
        >
          <View style={{ width: 120, aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: t.bg3 }}>
            {s.thumb ? <Image source={{ uri: s.thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
            <Text
              size={10}
              color="#fff"
              style={{ position: 'absolute', end: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, borderRadius: 4 }}
            >
              {formatClock(s.video.durationSec)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="bold" numberOfLines={2}>
              {s.video.title}
            </Text>
            <Text muted size={11}>
              {s.video.owner.displayName} · {mb(s.size)} · {relativeTime(s.savedAt, tr)}
            </Text>
          </View>
          <Pressable
            onPress={async () => {
              if (await confirm(tr.t('offline.removeConfirm'), { danger: true })) await removeDownload(s.video.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={tr.t('offline.remove')}
            hitSlop={10}
          >
            <Ionicons name="trash-outline" size={20} color={t.err} />
          </Pressable>
        </Pressable>
      ))}
      {mine.length ? (
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text muted size={12}>
            {tr.t('offline.total', { size: mb(total) })}
          </Text>
          <Button
            small
            variant="ghost"
            icon="trash-outline"
            title={tr.t('offline.removeAll')}
            onPress={async () => {
              if (await confirm(tr.t('offline.removeAllConfirm'), { danger: true })) await removeAllDownloads();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
