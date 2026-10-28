import type { EventDto } from '@qubedu/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Badge, DateField, FeatureGate, Segmented, Sheet, toDay } from '@/components/kit';
import { Button, Card, Empty, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

type Scope = 'upcoming' | 'mine' | 'past';

export function EventCard({ e, onPress }: { e: EventDto; onPress?: () => void }) {
  const tr = useT();
  const t = useTheme();
  const now = Date.now();
  const live = e.startsAt <= now && (e.endsAt ?? e.startsAt + 3600_000) >= now;
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: t.primarySoft, paddingVertical: 8 }}>
        <Text weight="black" size={20} color={t.primaryInk}>
          {formatDay(e.startsAt, tr, { day: 'numeric' })}
        </Text>
        <Text size={11} weight="bold" color={t.primaryInk}>
          {formatDay(e.startsAt, tr, { month: 'short' })}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text weight="bold" numberOfLines={2}>
          {e.title}
        </Text>
        <Text muted size={12}>
          {formatDay(e.startsAt, tr, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          {e.location ? ` · ${e.location}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {live && <Badge tone="err" label={tr.t('events.now')} />}
          {e.myStatus === 'going' && <Badge tone="ok" label={tr.t('events.going')} />}
          <Badge label={tr.t('events.goingCount', { count: e.goingCount })} />
        </View>
      </View>
    </Card>
  );
}

export default function EventsScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('upcoming');
  const q = useInfiniteQuery({
    queryKey: ['events', scope],
    queryFn: ({ pageParam }) => api.events.list({ scope, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', day: toDay(new Date(Date.now() + 86400_000)), time: '17:00', location: '', onlineUrl: '' });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const startsAt = new Date(`${form.day}T${form.time || '17:00'}:00`).getTime();
      const ev = await api.events.create({
        title: form.title.trim(),
        description: form.description.trim(),
        startsAt,
        location: form.location.trim(),
        onlineUrl: form.onlineUrl.trim() || null,
      });
      toast(tr.t('events.created'));
      setOpen(false);
      void q.refetch();
      router.push(`/event/${ev.id}` as never);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FeatureGate id="events">
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={items}
        keyExtractor={(e) => e.id}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => void q.refetch()}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Text muted>{tr.t('events.subtitle')}</Text>
            <Button icon="add" title={tr.t('events.create')} onPress={() => setOpen(true)} />
            <Segmented
              tabs={(['upcoming', 'mine', 'past'] as const).map((k) => ({ key: k, label: tr.t(`events.tabs.${k}`) }))}
              value={scope}
              onChange={setScope}
            />
          </View>
        }
        renderItem={({ item }) => <EventCard e={item} onPress={() => router.push(`/event/${item.id}` as never)} />}
        ListEmptyComponent={q.isPending ? <Loading /> : <Empty icon="calendar-outline" title={tr.t('events.empty')} />}
        ListFooterComponent={q.isFetchingNextPage ? <Loading /> : undefined}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('events.create')}
        footer={<Button title={tr.t('common.save')} loading={busy} disabled={!form.title.trim()} onPress={() => void create()} />}
      >
        <Input label={tr.t('events.nameLabel')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <Input label={tr.t('events.descriptionLabel')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        <DateField label={tr.t('common.date')} value={form.day} onChange={(v) => setForm({ ...form, day: v })} />
        <DateField label={tr.t('events.startsAt')} mode="time" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
        <Input label={tr.t('events.location')} value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} />
        <Input
          label={tr.t('events.onlineUrl')}
          value={form.onlineUrl}
          onChangeText={(v) => setForm({ ...form, onlineUrl: v })}
          autoCapitalize="none"
          keyboardType="url"
        />
      </Sheet>
    </FeatureGate>
  );
}
