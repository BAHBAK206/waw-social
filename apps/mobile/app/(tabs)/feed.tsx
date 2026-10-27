import type { PostDto } from '@qubedu/shared';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { FlatList, ScrollView, View } from 'react-native';
import { useState } from 'react';
import { Composer } from '@/components/Composer';
import { PostCard } from '@/components/PostCard';
import { Chip, Empty, ErrorView, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

type Scope = 'foryou' | 'questions' | 'notes' | 'following' | 'all';
const SCOPES: Scope[] = ['foryou', 'questions', 'notes', 'following', 'all'];
const SCOPE_LABEL = {
  foryou: 'feed.scopeForYou',
  questions: 'feed.scopeQuestions',
  notes: 'feed.scopeNotes',
  following: 'feed.scopeFollowing',
  all: 'feed.scopeAll',
} as const;
type Data = InfiniteData<{ items: PostDto[]; nextCursor: string | null }, string | undefined>;

export default function FeedScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('foryou');
  const [unanswered, setUnanswered] = useState(false);
  const key = ['feed', scope, unanswered];
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      api.posts.feed({
        scope: scope === 'questions' || scope === 'notes' ? 'all' : scope,
        kind: scope === 'questions' ? 'question' : scope === 'notes' ? 'note' : undefined,
        unanswered: scope === 'questions' && unanswered ? true : undefined,
        cursor: pageParam,
        limit: 15,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const patch = (id: string, fn: (p: PostDto) => PostDto) =>
    qc.setQueryData<Data>(key, (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((i) => (i.id === id ? fn(i) : i)) })) });
  const remove = (id: string) =>
    qc.setQueryData<Data>(key, (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.filter((i) => i.id !== id) })) });

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostCard post={item} onPatch={(fn) => patch(item.id, fn)} onRemoved={remove} />}
      onEndReachedThreshold={0.6}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      refreshing={q.isRefetching && !q.isFetchingNextPage}
      onRefresh={() => void q.refetch()}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Composer onPosted={() => void qc.invalidateQueries({ queryKey: ['feed'] })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SCOPES.map((s) => (
              <Chip key={s} label={tr.t(SCOPE_LABEL[s])} active={scope === s} onPress={() => setScope(s)} />
            ))}
          </ScrollView>
          {scope === 'questions' && (
            <View style={{ flexDirection: 'row' }}>
              <Chip label={tr.t('feed.onlyUnanswered')} active={unanswered} onPress={() => setUnanswered((u) => !u)} />
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        q.isPending ? <Loading /> : q.error ? <ErrorView onRetry={() => void q.refetch()} /> : <Empty title={tr.t('feed.empty')} icon="newspaper-outline" />
      }
      ListFooterComponent={q.isFetchingNextPage ? <Loading /> : undefined}
    />
  );
}
