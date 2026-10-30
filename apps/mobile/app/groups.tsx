import type { GroupDto } from '@qubedu/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Sheet, SwitchRow } from '@/components/kit';
import { Avatar, Button, Card, Chip, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { toastError } from '@/lib/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function GroupsScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [scope, setScope] = useState<'mine' | 'discover'>('mine');
  const [kind, setKind] = useState<'group' | 'community'>('group');
  const q = useInfiniteQuery({
    queryKey: ['groups', kind, scope],
    queryFn: ({ pageParam }) => api.groups.list({ kind, scope, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', isPrivate: false });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const g = await api.groups.create({ kind, name: form.name.trim(), description: form.description.trim(), privacy: form.isPrivate ? 'private' : 'public' });
      setOpen(false);
      setForm({ name: '', description: '', isPrivate: false });
      void q.refetch();
      router.push(`/group/${g.id}` as never);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={items}
      keyExtractor={(g) => g.id}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 6 }}>
          <Button icon="add" title={kind === 'group' ? tr.t('groups.create') : tr.t('groups.createCommunity')} onPress={() => setOpen(true)} />
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title={kind === 'group' ? tr.t('groups.create') : tr.t('groups.createCommunity')}
            footer={<Button title={tr.t('common.create')} loading={busy} disabled={form.name.trim().length < 2} onPress={() => void create()} />}
          >
            <Input label={tr.t('common.name')} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <Input label={tr.t('common.description')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
            <SwitchRow
              label={tr.t('common.private')}
              hint={form.isPrivate ? tr.t('groups.privateDesc') : tr.t('groups.publicDesc')}
              value={form.isPrivate}
              onChange={(v) => setForm({ ...form, isPrivate: v })}
            />
          </Sheet>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={tr.t('groups.title')} active={kind === 'group'} onPress={() => setKind('group')} />
            <Chip label={tr.t('groups.communities')} active={kind === 'community'} onPress={() => setKind('community')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={tr.t('groups.mine')} active={scope === 'mine'} onPress={() => setScope('mine')} />
            <Chip label={tr.t('groups.discover')} active={scope === 'discover'} onPress={() => setScope('discover')} />
          </View>
        </View>
      }
      renderItem={({ item }: { item: GroupDto }) => (
        <Card onPress={() => router.push(`/group/${item.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={item.name} url={item.avatarUrl} size={48} />
          <View style={{ flex: 1 }}>
            <Text weight="black" numberOfLines={1}>
              {item.name}
            </Text>
            <Text muted size={12}>
              {tr.t('groups.members', { count: item.memberCount })}
              {item.privacy === 'private' ? ` · ${tr.t('common.private')}` : ''}
            </Text>
          </View>
        </Card>
      )}
      ListEmptyComponent={
        q.isPending ? <Loading /> : q.error ? <ErrorView onRetry={() => void q.refetch()} /> : <Empty title={tr.t('groups.empty')} icon="people-outline" />
      }
    />
  );
}
