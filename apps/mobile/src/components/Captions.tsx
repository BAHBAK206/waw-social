import { Ionicons } from '@expo/vector-icons';
import { cueAt, searchCues, type CaptionTrackDto, type EditorQuestion, type TeacherAiResultDto, type VideoDto } from '@qubedu/shared';
import { LOCALE_NAMES, type Locale } from '@qubedu/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';
import { Badge, Sheet, pickDocument } from './kit';
import { Button, Card, Chip, Input, Text } from './ui';

const LANGS: Locale[] = ['ar', 'en', 'fr', 'es'];

/** A quiz drafted by the lesson tools, picked up by the quiz editor (then linked to the lesson as its checkpoint). */
let quizDraft: { title: string; questions: EditorQuestion[]; videoId?: string } | null = null;
export const setQuizDraft = (d: typeof quizDraft) => (quizDraft = d);
export const takeQuizDraft = () => {
  const d = quizDraft;
  quizDraft = null;
  return d;
};

export function useCaptions(videoId: string) {
  return useQuery({ queryKey: ['captions', videoId], queryFn: () => api.videos.captions(videoId), staleTime: 60_000 });
}

export function preferredTrack(tracks: CaptionTrackDto[], language: string) {
  return tracks.find((t) => t.language === language) ?? tracks[0] ?? null;
}

/** The current caption line over the video. */
export function CaptionOverlay({ track, time }: { track: CaptionTrackDto | null; time: number }) {
  const i = track ? cueAt(track.cues, time) : -1;
  if (!track || i < 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', start: 12, end: 12, bottom: 56, alignItems: 'center' }}>
      <Text
        color="#fff"
        weight="bold"
        style={{ backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, textAlign: 'center', overflow: 'hidden' }}
      >
        {track.cues[i]!.text}
      </Text>
    </View>
  );
}

/** Searchable transcript; tap a line to jump there. */
export function Transcript({
  tracks,
  language,
  onLanguage,
  time,
  onSeek,
  captionsOn,
  onCaptions,
}: {
  tracks: CaptionTrackDto[];
  language: string;
  onLanguage: (l: string) => void;
  time: number;
  onSeek: (sec: number) => void;
  captionsOn: boolean;
  onCaptions: (on: boolean) => void;
}) {
  const tr = useT();
  const t = useTheme();
  const [q, setQ] = useState('');
  const track = preferredTrack(tracks, language);
  const cues = useMemo(() => track?.cues ?? [], [track]);
  const hits = useMemo(() => (q.trim() ? searchCues(cues, q) : null), [cues, q]);
  if (!track) return null;
  const active = cueAt(cues, time);
  const shown = hits ?? cues.map((_, i) => i);
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="document-text-outline" size={18} color={t.primary} />
        <Text weight="black" style={{ flex: 1 }}>
          {tr.t('lessonTools.transcript')}
        </Text>
        <Chip label={`CC ${captionsOn ? '✓' : tr.t('lessonTools.off')}`} active={captionsOn} onPress={() => onCaptions(!captionsOn)} />
      </View>
      {tracks.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tracks.map((x) => (
            <Chip key={x.language} label={LOCALE_NAMES[x.language]} active={x.language === track.language} onPress={() => onLanguage(x.language)} />
          ))}
        </View>
      )}
      <Input placeholder={tr.t('lessonTools.search')} value={q} onChangeText={setQ} accessibilityLabel={tr.t('lessonTools.search')} />
      {hits ? (
        <Text muted size={12}>
          {tr.t('lessonTools.matches', { count: hits.length })}
        </Text>
      ) : null}
      <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
        {shown.map((i) => {
          const c = cues[i]!;
          return (
            <Pressable
              key={i}
              onPress={() => onSeek(c.start)}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                gap: 8,
                paddingVertical: 6,
                paddingHorizontal: 6,
                borderRadius: 8,
                backgroundColor: i === active ? t.primarySoft : 'transparent',
              }}
            >
              <Text size={12} weight="bold" color={t.primaryInk} style={{ minWidth: 44 }}>
                {formatClock(c.start)}
              </Text>
              <Text size={14} weight={i === active ? 'bold' : undefined} style={{ flex: 1 }}>
                {c.text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

/** Captions, summary, chapters, checkpoint quiz and assignment ideas for the lesson's teacher. */
export function LessonToolsSheet({
  open,
  onClose,
  video,
  tracks,
  onVideo,
}: {
  open: boolean;
  onClose: () => void;
  video: VideoDto;
  tracks: CaptionTrackDto[];
  onVideo: (p: Partial<VideoDto>) => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [lang, setLang] = useState<Locale>((tracks[0]?.language as Locale) ?? (tr.locale as Locale));
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'summary' | 'chapters' | 'ideas'; lines: string[] } | null>(null);
  const has = (l: string) => tracks.some((x) => x.language === l);
  const refresh = () => qc.invalidateQueries({ queryKey: ['captions', video.id] });
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const ai = (task: 'summary' | 'chapters' | 'ideas' | 'quiz') =>
    run(task, async () => {
      const res: TeacherAiResultDto = await api.teacher.ai({ task, videoId: video.id, language: tr.locale as Locale, count: 5 });
      if (task === 'quiz') {
        setQuizDraft({ title: video.title, questions: res.questions ?? [], videoId: video.id });
        onClose();
        router.push('/quiz-editor?draft=1' as never);
        return;
      }
      const lines =
        task === 'summary'
          ? (res.summary ?? [])
          : task === 'chapters'
            ? (res.chapters ?? []).map((c) => `${formatClock(c.at)} ${c.title}`)
            : (res.ideas ?? []).map((i) => `• ${i}`);
      setResult({ kind: task, lines });
    });
  return (
    <Sheet open={open} onClose={onClose} title={tr.t('lessonTools.title')}>
      <Text muted size={12}>
        {tr.t('lessonTools.onlyYou')}
      </Text>
      <Text weight="bold">{tr.t('lessonTools.captions')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {LANGS.map((l) => (
          <Chip key={l} label={`${LOCALE_NAMES[l]}${has(l) ? ' ✓' : ''}`} active={lang === l} onPress={() => setLang(l)} />
        ))}
      </View>
      <Button
        small
        variant="outline"
        icon="cloud-upload-outline"
        title={tr.t('lessonTools.upload')}
        loading={busy === 'upload'}
        onPress={() =>
          void run('upload', async () => {
            const f = await pickDocument(['text/vtt', 'application/x-subrip', 'text/plain', '*/*']);
            if (!f) return;
            const content = await new File(f.uri).text();
            await api.videos.saveCaptions(video.id, lang, content);
            await refresh();
            toast(tr.t('lessonTools.saved'));
          })
        }
      />
      <Button
        small
        variant="outline"
        icon="text-outline"
        title={tr.t('lessonTools.auto')}
        loading={busy === 'auto'}
        onPress={() =>
          void run('auto', async () => {
            await api.videos.autoCaptions(video.id, lang);
            await refresh();
            toast(tr.t('lessonTools.saved'));
          })
        }
      />
      {has(lang) && (
        <>
          <Text weight="bold">{tr.t('lessonTools.translate')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {LANGS.filter((l) => l !== lang).map((l) => (
              <Chip
                key={l}
                label={`→ ${LOCALE_NAMES[l]}`}
                onPress={() =>
                  void run('translate', async () => {
                    await api.videos.translateCaptions(video.id, lang, l);
                    await refresh();
                    toast(tr.t('lessonTools.saved'));
                  })
                }
              />
            ))}
          </View>
          <Button
            small
            variant="ghost"
            icon="trash-outline"
            title={tr.t('lessonTools.delete')}
            onPress={() =>
              void run('delete', async () => {
                await api.videos.deleteCaptions(video.id, lang);
                await refresh();
              })
            }
          />
        </>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        <Button
          small
          variant="soft"
          icon="sparkles-outline"
          title={tr.t('lessonTools.summary')}
          loading={busy === 'summary'}
          onPress={() => void ai('summary')}
        />
        <Button
          small
          variant="soft"
          icon="list-outline"
          title={tr.t('lessonTools.chapters')}
          disabled={!tracks.length}
          loading={busy === 'chapters'}
          onPress={() => void ai('chapters')}
        />
        <Button small variant="soft" icon="checkbox-outline" title={tr.t('lessonTools.quiz')} loading={busy === 'quiz'} onPress={() => void ai('quiz')} />
        <Button small variant="soft" icon="bulb-outline" title={tr.t('lessonTools.ideas')} loading={busy === 'ideas'} onPress={() => void ai('ideas')} />
      </View>
      {busy ? <Badge label={tr.t('lessonTools.working')} tone="primary" /> : null}
      {result && (
        <Card style={{ gap: 6 }}>
          {result.lines.map((l, i) => (
            <Text key={i} size={14}>
              {l}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {result.kind !== 'ideas' && (
              <Button
                small
                title={tr.t('lessonTools.addToDescription')}
                loading={busy === 'describe'}
                onPress={() =>
                  void run('describe', async () => {
                    const description = `${video.description.trim()}\n\n${result.lines.join('\n')}`.trim().slice(0, 5000);
                    await api.videos.update(video.id, { description });
                    onVideo({ description });
                    toast(tr.t('lessonTools.added'));
                  })
                }
              />
            )}
            <Button
              small
              variant="outline"
              icon="copy-outline"
              title={tr.t('lessonTools.copy')}
              onPress={() => void Clipboard.setStringAsync(result.lines.join('\n')).then(() => toast(tr.t('lessonTools.copied')))}
            />
          </View>
        </Card>
      )}
    </Sheet>
  );
}
