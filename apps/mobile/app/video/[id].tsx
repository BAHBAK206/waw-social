import { Ionicons } from '@expo/vector-icons';
import { parseChapters, type VideoCommentDto, type VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@qubedu/api-client';
import { useEvent } from 'expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View, type ScrollViewInstance } from 'react-native';
import { CaptionOverlay, LessonToolsSheet, preferredTrack, Transcript, useCaptions } from '@/components/Captions';
import { ReportButton } from '@/components/Report';
import { Checkpoint, LessonNotes, LessonOutline } from '@/components/LessonTools';
import { Avatar, Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { VideoItem } from '../(tabs)/watch';
import { useAppearance } from '@/lib/appearance';
import { api, fileUrl } from '@/lib/api';
import { compactNumber, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { cancelDownload, downloadLesson, refreshSavedLesson, removeDownload, useDownloads, useSavedLesson } from '@/lib/downloads';
import { enqueue } from '@/lib/outbox';
import { confirm, toast, toastError } from '@/lib/ui';
import { MathText } from '@/components/MathText';

type Controller = { seek: (sec: number) => void };

function Player({
  video,
  localUri,
  autoPlay,
  controller,
  onTime,
  onEnd,
  children,
}: {
  video: VideoDto;
  /** A copy saved on this phone (plays without a connection and saves data). */
  localUri?: string;
  autoPlay: boolean;
  controller: { current: Controller | null };
  onTime: (sec: number) => void;
  onEnd: () => void;
  /** Drawn over the video (captions). */
  children?: React.ReactNode;
}) {
  const tr = useT();
  // The adaptive stream (360p/720p/1080p by connection speed) when ready, else the original file.
  // File links are public or signed: no sign-in token is sent (it would reach the CDN / storage host).
  const uri = localUri ?? fileUrl(video.streamUrl ?? video.videoUrl)!;
  const player = useVideoPlayer({ uri }, (p) => {
    p.timeUpdateEventInterval = 0.5;
    if (video.progressSec > 5 && video.progressSec < video.durationSec - 5) p.currentTime = video.progressSec;
    if (autoPlay && !useAppearance.getState().appearance.dataSaver) p.play();
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
        .catch((e) => {
          // Watching a saved lesson offline: keep the position and send it later.
          if (e instanceof ApiError && e.isNetwork) void enqueue({ kind: 'video-progress', videoId: video.id, sec: Math.floor(sec), completed });
        });
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      onTime(currentTime);
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
    <View>
      <VideoView
        player={player}
        style={{ width: '100%', aspectRatio: video.kind === 'short' ? 9 / 14 : 16 / 9, backgroundColor: '#000' }}
        nativeControls
        allowsPictureInPicture
        contentFit="contain"
      />
      {children}
    </View>
  );
}

export default function VideoScreen() {
  const { id, checkpoint } = useLocalSearchParams<{ id: string; checkpoint?: string }>();
  const authed = useSession((s) => s.status === 'authed');
  const myId = useSession((s) => s.me?.id);
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
  const saved = useSavedLesson(id);
  const lesson = q.data ?? saved?.video;
  const chapters = useMemo(() => (lesson ? parseChapters(lesson.description, lesson.durationSec) : []), [lesson]);
  const captions = useCaptions(id!);
  const savedCaptions = saved?.captions;
  const captionTracks = useMemo(() => captions.data?.items ?? savedCaptions ?? [], [captions.data, savedCaptions]);
  const [captionLang, setCaptionLang] = useState<string>(tr.locale);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const dlProgress = useDownloads((s) => (id ? s.progress[id] : undefined));
  useEffect(() => {
    if (q.data && saved) refreshSavedLesson(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when fresh details arrive
  }, [q.data]);
  const onEnd = useMemo(
    () => () => {
      setEnded(true);
      setTimeout(() => scroller.current?.scrollTo({ y: checkpointY.current, animated: true }), 200);
    },
    [],
  );
  // A saved lesson opens at once, with or without a connection.
  if (q.isPending && !saved) return <Loading />;
  const v = q.data ?? saved?.video;
  if (!v) return <ErrorView onRetry={() => void q.refetch()} />;
  const offlineCopy = !q.data;
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
      <Stack.Screen
        options={{
          title: v.title,
          headerRight: () => (v.owner.id !== myId ? <ReportButton targetType="video" targetId={v.id} size={20} /> : null),
        }}
      />
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <Player key={v.id} video={v} localUri={saved?.file} autoPlay={checkpoint !== '1'} controller={controller} onTime={setTime} onEnd={onEnd}>
          {captionsOn ? <CaptionOverlay track={preferredTrack(captionTracks, captionLang)} time={time} /> : null}
        </Player>
        <View style={{ padding: 16, gap: 12 }}>
          <Text weight="black" size={19}>
            {v.title}
          </Text>
          <Text muted size={12}>
            {tr.t('watch.views', { count: v.views })} · {relativeTime(v.createdAt, tr)}
          </Text>
          {offlineCopy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cloud-offline-outline" size={16} color={t.text2} />
              <Text muted size={12}>
                {tr.t('offline.playingSaved')}
              </Text>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {v.kind !== 'short' ? (
              <Action
                icon={saved ? 'checkmark-circle' : dlProgress !== undefined ? 'close-circle-outline' : 'download-outline'}
                label={
                  saved
                    ? tr.t('offline.saved')
                    : dlProgress !== undefined
                      ? dlProgress >= 0
                        ? `${Math.round(dlProgress * 100)}%`
                        : tr.t('offline.downloadingUnknown')
                      : tr.t('offline.download')
                }
                active={!!saved}
                onPress={async () => {
                  if (saved) {
                    if (await confirm(tr.t('offline.removeConfirm'), { danger: true })) await removeDownload(v.id);
                  } else if (dlProgress !== undefined) cancelDownload(v.id);
                  else
                    try {
                      await downloadLesson(v);
                      toast(tr.t('offline.done'));
                    } catch (e) {
                      if ((e as { name?: string }).name !== 'AbortError') toastError(e);
                    }
                }}
              />
            ) : null}
            {offlineCopy ? null : (
              <>
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
              </>
            )}
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
          {v.canEdit && <Button small variant="soft" icon="construct-outline" title={tr.t('lessonTools.title')} onPress={() => setToolsOpen(true)} />}
          <LessonOutline chapters={chapters} time={time} onSeek={(sec) => controller.current?.seek(sec)} />
          <Transcript
            tracks={captionTracks}
            language={captionLang}
            onLanguage={setCaptionLang}
            time={time}
            onSeek={(sec) => controller.current?.seek(sec)}
            captionsOn={captionsOn}
            onCaptions={setCaptionsOn}
          />
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
          {authed && !offlineCopy && <LessonNotes videoId={v.id} time={Math.floor(time)} onSeek={(sec) => controller.current?.seek(sec)} />}
          {v.canEdit && !offlineCopy && (
            <LessonToolsSheet
              open={toolsOpen}
              onClose={() => setToolsOpen(false)}
              video={v}
              tracks={captionTracks}
              onVideo={(p) => patch((x) => ({ ...x, ...p }))}
            />
          )}
          {offlineCopy ? null : (
            <Text weight="black" size={17}>
              {tr.t('watch.comments', { count: v.commentCount })}
            </Text>
          )}
          {offlineCopy ? null : !v.allowComments ? (
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
                    <Text>
                      <MathText text={c.text} />
                    </Text>
                  </View>
                  {c.canDelete ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr.t('common.delete')}
                      hitSlop={8}
                      onPress={async () => {
                        if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                        try {
                          await api.videos.deleteComment(v.id, c.id);
                          await comments.refetch();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={t.text3} />
                    </Pressable>
                  ) : (
                    <ReportButton targetType="video_comment" targetId={c.id} />
                  )}
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
