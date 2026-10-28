import { Ionicons } from '@expo/vector-icons';
import type { Attachment, CommentDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { PostCard } from '@/components/PostCard';
import { ReadAloud } from '@/components/ReadAloud';
import { ReportButton } from '@/components/Report';
import { VoiceAttach, VoiceCard } from '@/components/Voice';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { confirm, toast, toastError } from '@/lib/ui';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api.posts.get(id!) });
  const comments = useQuery({ queryKey: ['post', id, 'comments'], queryFn: () => api.posts.comments(id!, { limit: 50 }) });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState<Attachment | null>(null);
  const me = useSession((s) => s.me);

  if (post.isPending) return <Loading />;
  if (post.error || !post.data) return <ErrorView onRetry={() => void post.refetch()} />;

  const send = async () => {
    if (!text.trim() && !audio) return;
    setBusy(true);
    try {
      await api.posts.comment(id!, text.trim(), audio);
      setText('');
      setAudio(null);
      await Promise.all([comments.refetch(), post.refetch()]);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const p = post.data;
  const isQuestion = p.kind === 'question';
  const vote = async (c: CommentDto) => {
    try {
      await api.posts.voteComment(p.id, c.id, !c.myVote);
      await comments.refetch();
    } catch (e) {
      toastError(e);
    }
  };
  const accept = async (c: CommentDto) => {
    try {
      const best = p.acceptedCommentId === c.id ? null : c.id;
      const res = await api.posts.accept(p.id, best);
      qc.setQueryData(['post', id], { ...p, acceptedCommentId: res.acceptedCommentId, solved: res.solved });
      if (best) toast(tr.t('feed.bestAnswer'));
      await comments.refetch();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: post.data.author.displayName }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <PostCard post={post.data} detail onPatch={(fn) => qc.setQueryData(['post', id], fn(post.data))} />
        <Text weight="black" size={17}>
          {isQuestion ? tr.t('feed.answerCount', { count: comments.data?.items.length ?? p.commentCount }) : tr.t('feed.comments')}
        </Text>
        {isQuestion && p.canAccept && (
          <Text muted size={13}>
            {tr.t('feed.bestAnswerXp')}
          </Text>
        )}
        {comments.isPending ? (
          <Loading />
        ) : !comments.data?.items.length ? (
          <Empty title={isQuestion ? tr.t('feed.noAnswers') : tr.t('feed.noComments')} icon="chatbubble-outline" />
        ) : (
          comments.data.items.map((c: CommentDto) => {
            const best = p.acceptedCommentId === c.id;
            const teacher = c.author.accountType === 'teacher';
            return (
              <Card key={c.id} style={{ gap: 8, borderWidth: best ? 2 : 0, borderColor: t.ok }}>
                {best && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color={t.ok} />
                    <Text size={13} weight="bold" color={t.ok}>
                      {tr.t('feed.bestAnswer')}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="bold">
                      {c.author.displayName}
                      {teacher ? <Text size={12} weight="bold" color={t.primaryInk}>{`  🎓 ${tr.t('feed.teacher')}`}</Text> : null}{' '}
                      <Text muted size={12}>
                        {relativeTime(c.createdAt, tr)}
                      </Text>
                    </Text>
                    {c.text ? <Text>{c.text}</Text> : null}
                    {c.audio ? <VoiceCard a={c.audio} label={teacher ? tr.t('voice.teacherVoice') : tr.t('voice.note')} /> : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  {isQuestion && (
                    <Pressable
                      onPress={() => void vote(c)}
                      disabled={c.author.id === me?.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: c.myVote, disabled: c.author.id === me?.id }}
                      accessibilityLabel={tr.t('feed.helpful')}
                      hitSlop={8}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: c.author.id === me?.id ? 0.5 : 1 }}
                    >
                      <Ionicons name={c.myVote ? 'thumbs-up' : 'thumbs-up-outline'} size={18} color={c.myVote ? t.primary : t.text2} />
                      <Text size={13} weight="bold" muted={!c.myVote}>
                        {tr.t('feed.helpful')}
                        {c.votes ? ` · ${c.votes}` : ''}
                      </Text>
                    </Pressable>
                  )}
                  {isQuestion && p.canAccept && (
                    <Pressable onPress={() => void accept(c)} accessibilityRole="button" hitSlop={8}>
                      <Text size={13} weight="bold" color={best ? t.text2 : t.ok}>
                        {best ? tr.t('feed.unmarkBest') : tr.t('feed.markBest')}
                      </Text>
                    </Pressable>
                  )}
                  <View style={{ flex: 1 }} />
                  <ReadAloud text={c.text} size={19} />
                  {me && c.author.id !== me.id && <ReportButton targetType="comment" targetId={c.id} />}
                  {c.canDelete && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr.t('common.delete')}
                      hitSlop={8}
                      onPress={async () => {
                        if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                        try {
                          await api.posts.deleteComment(id!, c.id);
                          await Promise.all([comments.refetch(), post.refetch()]);
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={t.text3} />
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 10, paddingTop: 8, backgroundColor: t.cardSolid, borderTopWidth: 1, borderTopColor: t.border }}>
        <VoiceAttach value={audio} onChange={setAudio} purpose="voice" label={isQuestion ? tr.t('voice.answerByVoice') : tr.t('voice.record')} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: t.cardSolid }}>
        <View style={{ flex: 1 }}>
          <Input
            value={text}
            onChangeText={setText}
            placeholder={isQuestion ? tr.t('feed.writeAnswer') : tr.t('feed.writeComment')}
            maxLength={isQuestion ? 4000 : 1000}
            multiline
          />
        </View>
        <Button title={isQuestion ? tr.t('common.send') : tr.t('feed.comment')} small onPress={send} loading={busy} disabled={!text.trim() && !audio} />
      </View>
    </KeyboardAvoidingView>
  );
}
