import { type VideoChapter, type VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, ClipboardCheck, ListOrdered, NotebookPen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

/** Index of the chapter that contains `sec` (chapters are sorted by start). */
export function currentChapter(chapters: VideoChapter[], sec: number) {
  let i = -1;
  for (let k = 0; k < chapters.length; k++) if (chapters[k]!.at <= sec) i = k;
  return i;
}

export function LessonChapters({ chapters, time, onSeek }: { chapters: VideoChapter[]; time: number; onSeek: (sec: number) => void }) {
  const tr = useT();
  if (!chapters.length) return null;
  const active = currentChapter(chapters, time);
  return (
    <section className="card mt-4 overflow-hidden" aria-label={tr.t('watch.chapters')}>
      <h2 className="flex items-center gap-2 border-b border-line bg-bg-2 px-3 py-2 font-black">
        <ListOrdered className="size-4" aria-hidden /> {tr.t('watch.chapters')}
        <span className="muted ms-auto text-xs font-bold">{tr.t('watch.chapterOf', { n: Math.max(1, active + 1), total: chapters.length })}</span>
      </h2>
      <ol className="max-h-72 overflow-y-auto p-1">
        {chapters.map((c, i) => (
          <li key={`${c.at}-${i}`}>
            <button
              type="button"
              aria-current={i === active}
              onClick={() => onSeek(c.at)}
              className={cx(
                'flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-start text-sm',
                i === active ? 'bg-soft font-bold text-ink' : 'hover:bg-bg-3',
              )}
            >
              <span className="badge shrink-0 tabular-nums" dir="ltr">
                {formatClock(c.at)}
              </span>
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {c.title}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function QuizCheckpoint({ quiz, highlight }: { quiz: NonNullable<VideoDto['quiz']>; highlight?: boolean }) {
  const tr = useT();
  const navigate = useNavigate();
  const gate = useAuthGate();
  const [busy, setBusy] = useState(false);
  const start = gate(async () => {
    setBusy(true);
    try {
      const attempt = await api.quizzes.start(quiz.id);
      navigate(`/quiz/attempt/${attempt.attemptId}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  });
  return (
    <section
      id="lesson-checkpoint"
      className={cx('card mt-4 flex flex-wrap items-center gap-3 p-4 transition-shadow', highlight && 'ring-2 ring-[var(--primary)]')}
      aria-label={tr.t('watch.checkpoint')}
    >
      <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-full">
        <ClipboardCheck className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-black">{highlight ? tr.t('watch.lessonDone') : tr.t('watch.checkpoint')}</p>
        <p className="muted truncate text-sm" dir="auto">
          {quiz.title} · {tr.t('watch.checkpointCount', { count: quiz.questionCount })}
        </p>
      </div>
      <Button loading={busy} onClick={() => void start()}>
        {tr.t('watch.takeQuiz')}
      </Button>
    </section>
  );
}

/** Private notes pinned to moments of the lesson. */
export function LessonNotes({ videoId, time, onSeek }: { videoId: string; time: number; onSeek: (sec: number) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const authed = useSession((s) => s.status === 'authed');
  const key = ['video-notes', videoId];
  const notes = useQuery({ queryKey: key, queryFn: () => api.videos.notes(videoId), enabled: authed });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Pin the note to the moment the learner started writing, not when they pressed save.
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);
  if (!authed) return null;
  const at = pinnedAt ?? time;

  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await api.videos.addNote(videoId, at, t);
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
    <section className="card mt-4 overflow-hidden" aria-label={tr.t('watch.notes')}>
      <div className="border-b border-line bg-bg-2 px-3 py-2">
        <h2 className="flex items-center gap-2 font-black">
          <NotebookPen className="size-4" aria-hidden /> {tr.t('watch.notes')}
        </h2>
        <p className="muted text-xs">{tr.t('watch.notesHint')}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <textarea
          className="input min-h-11 flex-1 resize-y py-2"
          rows={1}
          value={text}
          maxLength={1000}
          dir="auto"
          placeholder={tr.t('watch.notePlaceholder')}
          aria-label={tr.t('watch.notePlaceholder')}
          onChange={(e) => {
            if (pinnedAt === null && e.target.value) setPinnedAt(time);
            if (!e.target.value) setPinnedAt(null);
            setText(e.target.value);
          }}
        />
        <Button type="submit" variant="soft" icon={<BookMarked className="size-4" />} loading={busy} disabled={!text.trim()}>
          {tr.t('watch.addNoteAt', { time: formatClock(at) })}
        </Button>
      </form>
      {notes.data && !notes.data.items.length && <p className="muted px-3 pb-3 text-sm">{tr.t('watch.noNotes')}</p>}
      {!!notes.data?.items.length && (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto border-t border-line">
          {notes.data.items.map((n) => (
            <li key={n.id} className="flex items-start gap-2 px-3 py-2">
              <button
                type="button"
                className="badge badge-primary mt-0.5 shrink-0 tabular-nums"
                dir="ltr"
                onClick={() => onSeek(n.atSec)}
                aria-label={tr.t('watch.jumpTo', { time: formatClock(n.atSec) })}
              >
                {formatClock(n.atSec)}
              </button>
              <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap" dir="auto" style={{ overflowWrap: 'anywhere' }}>
                {n.text}
              </p>
              <IconButton
                size="sm"
                label={tr.t('common.delete')}
                onClick={async () => {
                  try {
                    await api.videos.deleteNote(videoId, n.id);
                    await qc.invalidateQueries({ queryKey: key });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
