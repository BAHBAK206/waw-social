import { Ionicons } from '@expo/vector-icons';
import { REACTION_EMOJI, type PostDto, type Reaction } from '@qubedu/shared';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Avatar, Card, Text } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

export function PostCard({
  post,
  onPatch,
  onRemoved,
  detail,
}: {
  post: PostDto;
  onPatch: (fn: (p: PostDto) => PostDto) => void;
  onRemoved?: (id: string) => void;
  detail?: boolean;
}) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const total = Object.values(post.reactionCounts).reduce((n, c) => n + (c ?? 0), 0);
  const top = (Object.entries(post.reactionCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? 'like') as Reaction;

  const toggleLike = async () => {
    const next: Reaction | null = post.myReaction ? null : 'like';
    const prev = post;
    onPatch((p) => {
      const counts = { ...p.reactionCounts };
      if (p.myReaction) counts[p.myReaction] = Math.max(0, (counts[p.myReaction] ?? 1) - 1);
      if (next) counts[next] = (counts[next] ?? 0) + 1;
      return { ...p, myReaction: next, reactionCounts: counts };
    });
    try {
      const r = await api.posts.react(post.id, next);
      onPatch((p) => ({ ...p, myReaction: r.myReaction, reactionCounts: r.reactionCounts }));
    } catch (e) {
      onPatch(() => prev);
      toastError(e);
    }
  };

  const toggleSave = async () => {
    try {
      if (post.saved) await api.saved.removeByRef('post', post.id);
      else await api.saved.add({ itemType: 'post', refId: post.id, title: post.text.slice(0, 80) || tr.t('saved.types.post'), url: null });
      onPatch((p) => ({ ...p, saved: !p.saved }));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Card onPress={detail ? undefined : () => router.push(`/post/${post.id}`)} style={{ gap: 10 }}>
      <Pressable
        onPress={() => router.push(`/user/${post.author.id}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        accessibilityRole="link"
      >
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Text weight="bold">{post.author.displayName}</Text>
          <Text muted size={12}>
            {relativeTime(post.createdAt, tr)}
          </Text>
        </View>
        {post.canDelete && (
          <Pressable
            accessibilityLabel={tr.t('common.delete')}
            hitSlop={10}
            onPress={async () => {
              if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
              try {
                await api.posts.remove(post.id);
                onRemoved?.(post.id);
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color={t.text3} />
          </Pressable>
        )}
      </Pressable>
      {post.text ? <Text size={16}>{post.text}</Text> : null}
      {post.imageUrl ? (
        <Image
          source={{ uri: fileUrl(post.imageUrl) }}
          style={{ width: '100%', aspectRatio: 1.5, borderRadius: 12, backgroundColor: t.bg3 }}
          contentFit="cover"
          accessibilityLabel=""
        />
      ) : null}
      {post.poll && (
        <View style={{ gap: 6 }}>
          {post.poll.options.map((o) => {
            const pct = post.poll!.totalVotes ? Math.round((o.votes / post.poll!.totalVotes) * 100) : 0;
            const mine = post.poll!.myVotes.includes(o.id);
            return (
              <Pressable
                key={o.id}
                disabled={post.poll!.closed}
                accessibilityRole="button"
                onPress={async () => {
                  try {
                    const next = await api.posts.vote(post.id, mine ? [] : [o.id]);
                    onPatch(() => next);
                  } catch (e) {
                    toastError(e);
                  }
                }}
                style={{ borderRadius: 10, borderWidth: 1.5, borderColor: mine ? t.primary : t.border, overflow: 'hidden', padding: 10 }}
              >
                <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, width: `${pct}%`, backgroundColor: t.primarySoft }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text weight={mine ? 'bold' : 'regular'}>{o.text}</Text>
                  <Text muted>{pct}%</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Pressable
          onPress={toggleLike}
          accessibilityRole="button"
          accessibilityState={{ selected: !!post.myReaction }}
          accessibilityLabel={tr.t('feed.reactions.like')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          hitSlop={8}
        >
          {post.myReaction ? <Text size={18}>{REACTION_EMOJI[post.myReaction]}</Text> : <Ionicons name="heart-outline" size={22} color={t.text2} />}
          <Text muted={!post.myReaction} weight="bold" color={post.myReaction ? t.primaryInk : undefined}>
            {total > 0 ? `${total}${total > 0 && !post.myReaction ? ` ${REACTION_EMOJI[top]}` : ''}` : ''}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/post/${post.id}`)}
          accessibilityRole="button"
          accessibilityLabel={tr.t('feed.comments')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          hitSlop={8}
        >
          <Ionicons name="chatbubble-outline" size={21} color={t.text2} />
          <Text muted weight="bold">
            {post.commentCount || ''}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSave} accessibilityRole="button" accessibilityLabel={post.saved ? tr.t('feed.unsave') : tr.t('feed.save')} hitSlop={8}>
          <Ionicons name={post.saved ? 'bookmark' : 'bookmark-outline'} size={22} color={post.saved ? t.primary : t.text2} />
        </Pressable>
      </View>
    </Card>
  );
}
