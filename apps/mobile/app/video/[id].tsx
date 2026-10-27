import { Ionicons } from '@expo/vector-icons';
import { parseChapters, type VideoCommentDto, type VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEvent } from 'expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View, type ScrollViewInstance } from 'react-native';
import { Checkpoint, LessonNotes, LessonOutline } from '@/components/LessonTools';
import { Avatar, Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { VideoItem } from '../(tabs)/watch';
import { api, fileUrl } from '@/lib/api';
import { compactNumber, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

type Controller = { seek: (sec: number) => void };

function Player({
  video,
  autoPlay,
  controller,
  onTime,
  onEnd,
}: {
  video: VideoDto;
  autoPlay: boolean;
  controller: { current: Controller | null };
  onTime: (sec: number) => void;
  onEnd: () => void;
}) {
  const tr = useT();
  const uri = fileUrl(video.videoUrl)!;
  const player = useVideoPlayer({ uri, headers: { 'x-client': 'mobile', authorization: `Bearer ${api.http.token ?? ''}` } }, (p) => {
    p.timeUpdateEventInterval = 1;
    if (video.progressSec > 5 && video.progressSec < video.durationSec - 5) p.currentTime = video.progressSec;
    if (autoPlay) p.play();
  });
  controller.current = {
    seek: (sec) => {
      player.currentTime = sec;
      player.play();
    },
  };
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const counted = useRef(false);
  useEffect(() => {
    if (isPlaying && !counted.current) {
      counted.current = true;
      void api.videos.view(video.id).catch(() => undefined);
    }
  }, [isPlaying, video.id]);
  // Report the position every few seconds (the server only credits real, wall-clock-bounded watching),
  // and once more at the end so finishing the lesson counts.
  const lastSent = useRef(0);
  useEffect(() => {
    const report = (sec: number, completed = false) =>
      api.videos
        .progress(video.id, Math.floor(sec), completed)
        .then((r) => {
          if (r.xpEarned > 0) toast(tr.t('watch.lessonXp', { xp: r.xpEarned }));
        })
        .catch(() => undefined);
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      onTime(Math.floor(currentTime));
      if (currentTime > 0 && Math.abs(currentTime - lastSent.current) >= 10) {
        lastSent.current = currentTime;
        void report(currentTime);
      }
    });
    const end = player.addListener('playToEnd', () => {
      void report(video.durationSec, true);
      onEnd();
    });
    return () => {
      time.remove();
      end.remove();
    };
  }, [player, video.id, video.durationSec, onTime, onEnd, tr]);
  return (
    <VideoView
      player={player}
      style={{ width: '100%', aspectRatio: video.kind === 'short' ? 9 / 14 : 16 / 9, backgroundColor: '#000' }}
      nativeControls
      allowsPictureInPicture
      contentFit="contain"
    />
  );
}

export default function VideoScreen() {
  const { id, checkpoint } = useLocalSearchParams<{ id: string; checkpoint?: string }>();
  const authed = useSession((s) => s.status === 'authed');
  const controller = useRef<Controller | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const [time, setTime] = useState(0);
  const [ended, setEnded] = useState(false);
  const checkpointY = useRef(0);
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['video', id], queryFn: () => api.videos.get(id!) });
  const related = useQuery({ queryKey: ['video', id, 'related'], queryFn: () => api.videos.related(id!) });
  const comments = useQuery({ queryKey: ['video', id, 'comments'], queryFn: () => api.videos.comments(id!, { limit: 30 }), enabled: !!q.data?.allowComments });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const chapters = useMemo(() => (q.data ? parseChapters(q.data.description, q.data.durationSec) : []), [q.data]);
  const onEnd = useMemo(
    () => () => {
      setEnded(true);
      setTimeout(() => scroller.current?.scrollTo({ y: checkpointY.current, animated: true }), 200);
    },
    [],
  );
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const v = q.data;
  const patch = (fn: (x: VideoDto) => VideoDto) => qc.setQueryData(['video', id], fn(v));

  const react = async (value: 1 | -1) => {
    const next = v.myReaction === value ? 0 : value;
    try {
      const r = await api.videos.react(v.id, next);
      patch((x) => ({ ...x, ...r }));
    } catch (e) {
      toastError(e);
    }
  };
  const subscribe = async () => {
    try {
      if (v.subscribed) await api.users.unfollow(v.owner.id);
      else await api.users.follow(v.owner.id);
      patch((x) => ({ ...x, subscribed: !x.subscribed, subscribers: x.subscribers + (x.subscribed ? -1 : 1) }));
    } catch (e) {
      toastError(e);
    }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.videos.comment(v.id, text.trim());
      setText('');
      await comments.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const Action = ({
    icon,
    label,
    active,
    onPress,
  }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    active?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        minHeight: 38,
        borderRadius: 19,
        backgroundColor: active ? t.primarySoft : t.bg3,
      }}
    >
      <Ionicons name={icon} size={18} color={active ? t.primaryInk : t.text2} />
      <Text weight="bold" size={13} color={active ? t.primaryInk : undefined}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: v.title }} />
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <Player key={v.id} video={v} autoPlay={checkpoint !== '1'} controller={controller} onTime={setTime} onEnd={onEnd} />
        <View style={{ padding: 16, gap: 12 }}>
          <Text weight="black" size={19}>
            {v.title}
          </Text>
          <Text muted size={12}>
            {tr.t('watch.views', { count: v.views })} · {relativeTime(v.createdAt, tr)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action
              icon={v.myReaction === 1 ? 'thumbs-up' : 'thumbs-up-outline'}
              label={compactNumber(v.likes, tr)}
              active={v.myReaction === 1}
              onPress={() => void react(1)}
            />
            <Action
              icon={v.myReaction === -1 ? 'thumbs-down' : 'thumbs-down-outline'}
              label={tr.t('watch.dislike')}
              active={v.myReaction === -1}
              onPress={() => void react(-1)}
            />
            <Action
              icon="share-social-outline"
              label={tr.t('watch.share')}
              onPress={() => void Share.share({ message: `${v.title}\n${api.http.url(`/watch/${v.id}`)}` })}
            />
            <Action
              icon={v.watchLater ? 'time' : 'time-outline'}
              label={tr.t('watch.watchLater')}
              active={v.watchLater}
              onPress={async () => {
                try {
                  const r = await api.videos.watchLater(v.id, !v.watchLater);
                  patch((x) => ({ ...x, watchLater: r.watchLater }));
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          </ScrollView>
          <Pressable
            onPress={() => router.push(`/user/${v.owner.id}` as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            accessibilityRole="link"
          >
            <Avatar name={v.owner.displayName} url={v.owner.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text weight="bold">{v.owner.displayName}</Text>
              <Text muted size={12}>
                {tr.t('watch.subscribers', { count: v.subscribers })}
              </Text>
            </View>
            {!v.canEdit && (
              <Button
                small
                variant={v.subscribed ? 'outline' : 'primary'}
                title={v.subscribed ? tr.t('watch.subscribed') : tr.t('watch.subscribe')}
                onPress={subscribe}
              />
            )}
          </Pressable>
          {v.description ? (
            <Card>
              <Text>{v.description}</Text>
            </Card>
          ) : null}
          <LessonOutline chapters={chapters} time={time} onSeek={(sec) => controller.current?.seek(sec)} />
          {v.quiz && (
            <View
              onLayout={(e) => {
                checkpointY.current = e.nativeEvent.layout.y + 200;
                if (checkpoint === '1') scroller.current?.scrollTo({ y: checkpointY.current, animated: true });
              }}
            >
              <Checkpoint quiz={v.quiz} highlight={ended || checkpoint === '1'} />
            </View>
          )}
          {authed && <LessonNotes videoId={v.id} time={time} onSeek={(sec) => controller.current?.seek(sec)} />}
          <Text weight="black" size={17}>
            {tr.t('watch.comments', { count: v.commentCount })}
          </Text>
          {!v.allowComments ? (
            <Text muted>{tr.t('watch.commentsOff')}</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Input value={text} onChangeText={setText} placeholder={tr.t('feed.writeComment')} maxLength={1000} />
                </View>
                <Button small title={tr.t('feed.comment')} onPress={send} loading={busy} disabled={!text.trim()} />
              </View>
              {comments.data?.items.map((c: VideoCommentDto) => (
                <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
                  <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text weight="bold" size={13}>
                      {c.author.displayName}{' '}
                      <Text muted size={11}>
                        {relativeTime(c.createdAt, tr)}
                      </Text>
                    </Text>
                    <Text>{c.text}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
          {(related.data?.items.length ?? 0) > 0 && (
            <View style={{ gap: 16, marginTop: 8 }}>
              {related.data!.items.slice(0, 6).map((r) => (
                <VideoItem key={r.id} v={r} onPress={() => router.replace(`/video/${r.id}` as never)} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
