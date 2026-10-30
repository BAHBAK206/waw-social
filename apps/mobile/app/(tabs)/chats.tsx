import type { ConversationDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { Avatar, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function ChatsScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api.chat.conversations({ limit: 100 }), refetchInterval: 60_000 });
  const row = (c: ConversationDto) => (
    <Pressable
      onPress={() => router.push(`/chat/${c.id}` as never)}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: pressed ? t.bg3 : 'transparent' })}
    >
      <Avatar name={c.title} url={c.avatarUrl} size={48} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Text weight={c.unread ? 'black' : 'bold'} style={{ flex: 1 }} numberOfLines={1}>
            {c.title}
          </Text>
          {c.lastMessage ? (
            <Text muted size={11}>
              {relativeTime(c.lastMessage.createdAt, tr)}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text muted={!c.unread} weight={c.unread ? 'bold' : 'regular'} size={13} numberOfLines={1} style={{ flex: 1 }}>
            {c.lastMessage ? `${c.lastMessage.senderId === me.id ? tr.t('chat.you') : ''}${c.lastMessage.text || '📎'}` : ''}
          </Text>
          {c.unread > 0 && (
            <View
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: t.primary,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
              }}
            >
              <Text weight="bold" size={11} color={t.onPrimary}>
                {c.unread > 99 ? '99+' : c.unread}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={q.data?.items ?? []}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => row(item)}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.border, marginStart: 74 }} />}
      ListEmptyComponent={
        q.isPending ? <Loading /> : q.error ? <ErrorView onRetry={() => void q.refetch()} /> : <Empty title={tr.t('chat.empty')} icon="chatbubbles-outline" />
      }
    />
  );
}
