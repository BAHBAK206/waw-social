import { Ionicons } from '@expo/vector-icons';
import type { VideoChapter, VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

/** Index of the chapter containing `sec` (chapters are sorted by start time). */
export function currentChapter(chapters: VideoChapter[], sec: number) {
  let i = -1;
  chapters.forEach((c, k) => {
    if (c.at <= sec) i = k;
  });
  return i;
}

export function LessonOutline({ chapters, time, onSeek }: { chapters: VideoChapter[]; time: number; onSeek: (sec: number) => void }) {
  const tr = useT();
  const t = useTheme();
  if (!chapters.length) return null;
  const active = currentChapter(chapters, time);
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="list-outline" size={18} color={t.text2} />
        <Text weight="black" style={{ flex: 1 }}>
          {tr.t('watch.chapters')}
        </Text>
        <Text muted size={12}>
          {tr.t('watch.chapterOf', { n: Math.max(1, active + 1), total: chapters.length })}
        </Text>
      </View>
      {chapters.map((c, i) => (
        <Pressable
          key={`${c.at}-${i}`}
          onPress={() => onSeek(c.at)}
          accessibilityRole="button"
          accessibilityState={{ selected: i === active }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            paddingHorizontal: 8,
            borderRadius: 10,
            backgroundColor: i === active ? t.primarySoft : 'transparent',
          }}
        >
          <Text size={12} weight="bold" color={t.text2} style={{ writingDirection: 'ltr' }}>
            {formatClock(c.at)}
          </Text>
          <Text weight={i === active ? 'bold' : 'regular'} color={i === active ? t.primaryInk : undefined} style={{ flex: 1 }} numberOfLines={1}>
            {c.title}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

export function Checkpoint({ quiz, highlight }: { quiz: NonNullable<VideoDto['quiz']>; highlight: boolean }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  return (
    <Card style={{ gap: 8, borderWidth: highlight ? 2 : 0, borderColor: t.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="clipboard-outline" size={26} color={t.primaryInk} />
        <View style={{ flex: 1 }}>
          <Text weight="black">{highlight ? tr.t('watch.lessonDone') : tr.t('watch.checkpoint')}</Text>
          <Text muted size={13} numberOfLines={1}>
            {quiz.title} · {tr.t('watch.checkpointCount', { count: quiz.questionCount })}
          </Text>
        </View>
      </View>
      <Button title={tr.t('watch.takeQuiz')} onPress={() => router.push(`/quiz/${quiz.id}` as never)} />
    </Card>
  );
}

/** Private notes pinned to moments of the lesson; the note keeps the time the learner started writing. */
export function LessonNotes({ videoId, time, onSeek }: { videoId: string; time: number; onSeek: (sec: number) => void }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const key = ['video-notes', videoId];
  const notes = useQuery({ queryKey: key, queryFn: () => api.videos.notes(videoId) });
  const [text, setText] = useState('');
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const at = pinnedAt ?? time;
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.videos.addNote(videoId, at, text.trim());
      setText('');
      setPinnedAt(null);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="create-outline" size={18} color={t.text2} />
        <Text weight="black">{tr.t('watch.notes')}</Text>
      </View>
      <Text muted size={12}>
        {tr.t('watch.notesHint')}
      </Text>
      <Input
        value={text}
        multiline
        maxLength={1000}
        placeholder={tr.t('watch.notePlaceholder')}
        onChangeText={(v) => {
          if (pinnedAt === null && v) setPinnedAt(time);
          if (!v) setPinnedAt(null);
          setText(v);
        }}
      />
      <Button small variant="soft" title={tr.t('watch.addNoteAt', { time: formatClock(at) })} onPress={add} loading={busy} disabled={!text.trim()} />
      {notes.data && !notes.data.items.length ? (
        <Text muted size={13}>
          {tr.t('watch.noNotes')}
        </Text>
      ) : null}
      {notes.data?.items.map((n) => (
        <View key={n.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Pressable
            onPress={() => onSeek(n.atSec)}
            accessibilityRole="button"
            accessibilityLabel={tr.t('watch.jumpTo', { time: formatClock(n.atSec) })}
            style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: t.primarySoft }}
          >
            <Text size={12} weight="bold" color={t.primaryInk} style={{ writingDirection: 'ltr' }}>
              {formatClock(n.atSec)}
            </Text>
          </Pressable>
          <Text style={{ flex: 1 }}>{n.text}</Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr.t('common.delete')}
            onPress={async () => {
              try {
                await api.videos.deleteNote(videoId, n.id);
                await qc.invalidateQueries({ queryKey: key });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Ionicons name="trash-outline" size={18} color={t.text3} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
