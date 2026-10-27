import type { NotificationDto } from '@qubedu/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Avatar, Button, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { appPath } from '@/lib/links';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

function target(n: NotificationDto): string | null {
  const d = n.data as Record<string, string | undefined>;
  if (d.postId) return `/post/${d.postId}`;
  if (d.videoId) return `/video/${d.videoId}`;
  if (d.conversationId) return `/chat/${d.conversationId}`;
  if (d.groupId) return `/group/${d.groupId}`;
  if (n.actor && n.type === 'follow') return `/user/${n.actor.id}`;
  return appPath(n.link);
}

export default function NotificationsScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  useEffect(() => {
    if (!q.data) return;
    void api.notifications.read().then(() => {
      useSession.getState().patchMe({ unreadNotifications: 0 });
    });
  }, [q.data]);
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={items}
      keyExtractor={(n) => n.id}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={
        items.length ? (
          <View style={{ padding: 12, alignItems: 'flex-end' }}>
            <Button
              small
              variant="ghost"
              title={tr.t('notifications.clear')}
              onPress={async () => {
                await api.notifications.clear();
                await qc.invalidateQueries({ queryKey: ['notifications'] });
              }}
            />
          </View>
        ) : undefined
      }
      renderItem={({ item: n }) => {
        const href = target(n);
        const vars = { name: n.actor?.displayName ?? '', preview: n.body, title: n.title, group: n.title, course: n.title, grade: '', points: '', emoji: '' };
        const label = tr.tDyn(`notifications.types.${n.type}`, { ...vars, ...(n.data as Record<string, string>) }, n.title || n.body);
        return (
          <Pressable
            onPress={() => href && router.push(href as never)}
            accessibilityRole={href ? 'button' : 'text'}
            style={{ flexDirection: 'row', gap: 12, padding: 14, backgroundColor: n.read ? 'transparent' : t.primarySoft }}
          >
            <Avatar name={n.actor?.displayName ?? tr.t('app.name')} url={n.actor?.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text>{label}</Text>
              <Text muted size={12}>
                {relativeTime(n.createdAt, tr)}
              </Text>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorView onRetry={() => void q.refetch()} />
        ) : (
          <Empty title={tr.t('notifications.empty')} icon="notifications-off-outline" />
        )
      }
    />
  );
}
