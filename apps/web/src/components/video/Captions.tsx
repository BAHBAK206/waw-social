import { cueAt, searchCues, type CaptionTrackDto, type TeacherAiResultDto, type VideoDto } from '@qubedu/shared';
import { LOCALE_NAMES, type Locale } from '@qubedu/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Captions, ClipboardCheck, Copy, Lightbulb, ListOrdered, ScrollText, Search, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const LANGS: Locale[] = ['ar', 'en', 'fr', 'es'];
export const QUIZ_DRAFT_KEY = 'qubedu:quiz-draft';

export function useCaptions(videoId: string) {
  return useQuery({ queryKey: ['captions', videoId], queryFn: () => api.videos.captions(videoId), staleTime: 60_000 });
}

/** Picks the reader's language when the lesson has it, else the first track. */
export function preferredTrack(tracks: CaptionTrackDto[], language: string): CaptionTrackDto | null {
  return tracks.find((t) => t.language === language) ?? tracks[0] ?? null;
}

/** Everything said in the lesson, searchable; tap a line to jump there. */
export function LessonTranscript({
  tracks,
  language,
  onLanguage,
  time,
  onSeek,
}: {
  tracks: CaptionTrackDto[];
  language: string;
  onLanguage: (l: string) => void;
  time: number;
  onSeek: (sec: number) => void;
}) {
  const tr = useT();
  const [q, setQ] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const track = preferredTrack(tracks, language);
  const cues = useMemo(() => track?.cues ?? [], [track]);
  const hits = useMemo(() => (q.trim() ? searchCues(cues, q) : null), [cues, q]);
  const active = cueAt(cues, time);
  useEffect(() => {
    if (hits || active < 0) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (el && list.current) list.current.scrollTo({ top: el.offsetTop - list.current.clientHeight / 3, behavior: 'smooth' });
  }, [active, hits]);
  if (!track) return null;
  const shown = hits ?? cues.map((_, i) => i);
  return (
    <section className="card mt-4 overflow-hidden" aria-label={tr.t('lessonTools.transcript')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-2 px-3 py-2">
        <h2 className="flex items-center gap-2 font-black">
          <ScrollText className="size-4" aria-hidden /> {tr.t('lessonTools.transcript')}
        </h2>
        {tracks.length > 1 && (
          <select
            className="input !min-h-8 !w-auto !py-0 text-sm"
            value={track.language}
            aria-label={tr.t('lessonTools.captions')}
            onChange={(e) => onLanguage(e.target.value)}
          >
            {tracks.map((t) => (
              <option key={t.language} value={t.language}>
                {LOCALE_NAMES[t.language]}
              </option>
            ))}
          </select>
        )}
        <label className="relative ms-auto min-w-40 flex-1 sm:max-w-64">
          <Search className="muted absolute start-2 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            className="input !min-h-8 !py-0 ps-8 text-sm"
            placeholder={tr.t('lessonTools.search')}
            aria-label={tr.t('lessonTools.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      {hits && <p className="muted px-3 pt-2 text-xs">{tr.t('lessonTools.matches', { count: hits.length })}</p>}
      <ol ref={list} className="relative max-h-72 overflow-y-auto p-1">
        {shown.map((i) => {
          const c = cues[i]!;
          return (
            <li key={i} data-i={i}>
              <button
                type="button"
                onClick={() => onSeek(c.start)}
                aria-current={i === active}
                className={cx(
                  'flex w-full items-start gap-3 rounded-[var(--radius-control)] px-3 py-1.5 text-start text-sm',
                  i === active ? 'bg-soft font-bold text-ink' : 'hover:bg-bg-3',
                )}
              >
                <span className="badge shrink-0 tabular-nums" dir="ltr">
                  {formatClock(c.start)}
                </span>
                <span className="min-w-0 flex-1" dir="auto">
                  {c.text}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Captions, summary, chapters, a checkpoint quiz and assignment ideas — only for the lesson's teacher. */
export function LessonToolsPanel({ video, tracks, onVideo }: { video: VideoDto; tracks: CaptionTrackDto[]; onVideo: (v: Partial<VideoDto>) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Locale>((tracks[0]?.language as Locale) ?? (tr.locale as Locale));
  const [to, setTo] = useState<Locale>(LANGS.find((l) => l !== lang) ?? 'en');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'summary' | 'chapters' | 'ideas'; data: TeacherAiResultDto } | null>(null);
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
  const has = (l: string) => tracks.some((t) => t.language === l);
  const addToDescription = (extra: string) =>
    run('describe', async () => {
      const description = `${video.description.trim()}\n\n${extra}`.trim().slice(0, 5000);
      await api.videos.update(video.id, { description });
      onVideo({ description });
      toast(tr.t('lessonTools.added'));
    });
  const ai = (task: 'summary' | 'chapters' | 'ideas' | 'quiz') =>
    run(task, async () => {
      const res = await api.teacher.ai({ task, videoId: video.id, language: tr.locale as Locale, count: task === 'quiz' ? 5 : 5 });
      if (task === 'quiz') {
        sessionStorage.setItem(QUIZ_DRAFT_KEY, JSON.stringify({ title: video.title, questions: res.questions ?? [], videoId: video.id }));
        navigate('/quiz/new?draft=1');
        return;
      }
      setResult({ kind: task, data: res });
    });

  return (
    <section className="card mt-4 space-y-3 p-4" aria-label={tr.t('lessonTools.title')}>
      <div>
        <h2 className="flex items-center gap-2 font-black">
          <Wand2 className="size-4" aria-hidden /> {tr.t('lessonTools.title')}
        </h2>
        <p className="muted text-xs">{tr.t('lessonTools.onlyYou')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select
          label={tr.t('lessonTools.captions')}
          value={lang}
          onChange={(e) => setLang(e.target.value as Locale)}
          options={LANGS.map((l) => ({ value: l, label: `${LOCALE_NAMES[l]}${has(l) ? ' ✓' : ''}` }))}
          wrapperClassName="w-40"
        />
        <Button
          variant="outline"
          size="sm"
          icon={<Upload className="size-4" />}
          loading={busy === 'upload'}
          onClick={() =>
            void run('upload', async () => {
              const f = await pickFile('.vtt,.srt,text/vtt');
              if (!f) return;
              await api.videos.saveCaptions(video.id, lang, await f.text());
              await refresh();
              toast(tr.t('lessonTools.saved'));
            })
          }
        >
          {tr.t('lessonTools.upload')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<Captions className="size-4" />}
          loading={busy === 'auto'}
          onClick={() =>
            void run('auto', async () => {
              await api.videos.autoCaptions(video.id, lang);
              await refresh();
              toast(tr.t('lessonTools.saved'));
            })
          }
        >
          {tr.t('lessonTools.auto')}
        </Button>
        {has(lang) && (
          <IconButton
            label={tr.t('lessonTools.delete')}
            onClick={() =>
              void run('delete', async () => {
                await api.videos.deleteCaptions(video.id, lang);
                await refresh();
              })
            }
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>

      {has(lang) && (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label={tr.t('lessonTools.to')}
            value={to}
            onChange={(e) => setTo(e.target.value as Locale)}
            options={LANGS.filter((l) => l !== lang).map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
            wrapperClassName="w-40"
          />
          <Button
            variant="outline"
            size="sm"
            loading={busy === 'translate'}
            onClick={() =>
              void run('translate', async () => {
                await api.videos.translateCaptions(video.id, lang, to);
                await refresh();
                toast(tr.t('lessonTools.saved'));
              })
            }
          >
            {tr.t('lessonTools.translate')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="soft" size="sm" icon={<Sparkles className="size-4" />} loading={busy === 'summary'} onClick={() => void ai('summary')}>
          {tr.t('lessonTools.summary')}
        </Button>
        <Button
          variant="soft"
          size="sm"
          icon={<ListOrdered className="size-4" />}
          loading={busy === 'chapters'}
          disabled={!tracks.length}
          onClick={() => void ai('chapters')}
        >
          {tr.t('lessonTools.chapters')}
        </Button>
        <Button variant="soft" size="sm" icon={<ClipboardCheck className="size-4" />} loading={busy === 'quiz'} onClick={() => void ai('quiz')}>
          {tr.t('lessonTools.quiz')}
        </Button>
        <Button variant="soft" size="sm" icon={<Lightbulb className="size-4" />} loading={busy === 'ideas'} onClick={() => void ai('ideas')}>
          {tr.t('lessonTools.ideas')}
        </Button>
      </div>

      {result && <AiResult result={result} busy={busy === 'describe'} onAdd={(text) => void addToDescription(text)} />}
    </section>
  );
}

function AiResult({
  result,
  busy,
  onAdd,
}: {
  result: { kind: 'summary' | 'chapters' | 'ideas'; data: TeacherAiResultDto };
  busy: boolean;
  onAdd: (text: string) => void;
}) {
  const tr = useT();
  const lines =
    result.kind === 'summary'
      ? (result.data.summary ?? [])
      : result.kind === 'chapters'
        ? (result.data.chapters ?? []).map((c) => `${formatClock(c.at)} ${c.title}`)
        : (result.data.ideas ?? []).map((i) => `• ${i}`);
  const text = lines.join('\n');
  return (
    <div className="space-y-2 rounded-[var(--radius-control)] bg-soft p-3">
      <ul className="space-y-1 text-sm" dir="auto">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {result.kind === 'summary' && !!result.data.keyPoints?.length && (
        <p className="flex flex-wrap gap-1">
          {result.data.keyPoints.map((k) => (
            <span key={k} className="badge">
              {k}
            </span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {result.kind !== 'ideas' && (
          <Button size="sm" loading={busy} onClick={() => onAdd(text)}>
            {tr.t('lessonTools.addToDescription')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          icon={<Copy className="size-4" />}
          onClick={() => void navigator.clipboard.writeText(text).then(() => toast(tr.t('lessonTools.copied')))}
        >
          {tr.t('lessonTools.copy')}
        </Button>
      </div>
    </div>
  );
}
