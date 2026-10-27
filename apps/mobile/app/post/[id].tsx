import type { CommentDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api.posts.get(id!) });
  const comments = useQuery({ queryKey: ['post', id, 'comments'], queryFn: () => api.posts.comments(id!, { limit: 50 }) });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (post.isPending) return <Loading />;
  if (post.error || !post.data) return <ErrorView onRetry={() => void post.refetch()} />;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.posts.comment(id!, text.trim());
      setText('');
      await Promise.all([comments.refetch(), post.refetch()]);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: post.data.author.displayName }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <PostCard post={post.data} detail onPatch={(fn) => qc.setQueryData(['post', id], fn(post.data))} />
        <Text weight="black" size={17}>
          {tr.t('feed.comments')}
        </Text>
        {comments.isPending ? (
          <Loading />
        ) : !comments.data?.items.length ? (
          <Empty title={tr.t('feed.noComments')} icon="chatbubble-outline" />
        ) : (
          comments.data.items.map((c: CommentDto) => (
            <Card key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={34} />
              <View style={{ flex: 1 }}>
                <Text weight="bold">
                  {c.author.displayName}{' '}
                  <Text muted size={12}>
                    {relativeTime(c.createdAt, tr)}
                  </Text>
                </Text>
                <Text>{c.text}</Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: t.cardSolid, borderTopWidth: 1, borderTopColor: t.border }}
      >
        <View style={{ flex: 1 }}>
          <Input value={text} onChangeText={setText} placeholder={tr.t('feed.writeComment')} maxLength={1000} multiline />
        </View>
        <Button title={tr.t('feed.comment')} small onPress={send} loading={busy} disabled={!text.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
