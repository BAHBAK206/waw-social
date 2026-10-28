import type { QuizAttemptDto, QuizResultDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flag, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { ErrorState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { celebrate, confirmDialog, toastError } from '@/lib/ui';
import { QuizResultView } from './QuizResultView';
import { ReadAloud } from '@/components/common/ReadAloud';
import { ExamIntegrity } from '@/components/quiz/ExamIntegrity';

type Answer = number | number[] | string | null;

const storageKey = (id: string) => `qubedu:attempt:${id}`;

function loadDraft(id: string): { answers: Answer[]; flags: number[] } | null {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(id)) ?? 'null');
  } catch {
    return null;
  }
}

function Player({ attempt, onDone }: { attempt: QuizAttemptDto; onDone: (r: QuizResultDto) => void }) {
  const tr = useT();
  const total = attempt.questions.length;
  const draft = useMemo(() => loadDraft(attempt.attemptId), [attempt.attemptId]);
  const [answers, setAnswers] = useState<Answer[]>(draft?.answers.length === total ? draft.answers : Array(total).fill(null));
  const [flags, setFlags] = useState<Set<number>>(new Set(draft?.flags ?? []));
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000)));
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  // Keep answers across accidental reloads (the server holds the attempt until it expires).
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(attempt.attemptId), JSON.stringify({ answers, flags: [...flags] }));
    } catch {
      /* storage unavailable */
    }
  }, [answers, flags, attempt.attemptId]);

  const submit = useCallback(
    async (auto = false) => {
      if (submitted.current) return;
      const unanswered = answers.filter((a) => a === null || (Array.isArray(a) && !a.length) || a === '').length;
      if (
        !auto &&
        !(await confirmDialog({
          title: tr.t('quiz.player.submit'),
          body: tr.t('quiz.player.confirmSubmit', { count: unanswered }),
          confirmLabel: tr.t('quiz.player.submit'),
        }))
      )
        return;
      submitted.current = true;
      setBusy(true);
      try {
        const res = await api.quizzes.submit(
          attempt.attemptId,
          answers.map((a) => (Array.isArray(a) && !a.length ? null : a === '' ? null : a)),
        );
        sessionStorage.removeItem(storageKey(attempt.attemptId));
        celebrate(res);
        onDone(res);
      } catch (e) {
        submitted.current = false;
        toastError(e);
      } finally {
        setBusy(false);
      }
    },
    [answers, attempt.attemptId, onDone, tr],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !submitted.current) void submit(true);
    }, 500);
    return () => clearInterval(id);
  }, [attempt.expiresAt, submit]);

  // Warn before leaving mid-attempt.
  const blocker = useBlocker(() => !submitted.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirmDialog({ title: tr.t('quiz.player.leave'), body: tr.t('quiz.player.leaveBody'), danger: true }).then((ok) =>
      ok ? blocker.proceed() : blocker.reset(),
    );
  }, [blocker, tr]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!submitted.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const q = attempt.questions[index]!;
  const set = (a: Answer) => setAnswers((prev) => prev.map((x, i) => (i === index ? a : x)));
  const answered = (i: number) => {
    const a = answers[i];
    return !(a === null || a === '' || (Array.isArray(a) && !a.length));
  };
  const low = left <= 60;

  return (
    <div className="page-narrow">
      {attempt.integrity && <ExamIntegrity attemptId={attempt.attemptId} />}
      <div className="card sticky top-[4.25rem] z-20 mb-4 p-3 lg:top-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-black" dir="auto">
              {attempt.quiz.title}
            </p>
            <p className="muted text-sm">{tr.t('quiz.player.questionOf', { n: index + 1, total })}</p>
          </div>
          <div
            className={cx('rounded-full px-3 py-1 text-lg font-black tabular-nums', low ? 'bg-err-fill text-white' : 'bg-soft text-ink')}
            role="timer"
            aria-label={tr.t('quiz.player.timeLeft')}
            dir="ltr"
          >
            {formatClock(left)}
          </div>
        </div>
        <ProgressBar value={answers.filter((_, i) => answered(i)).length} max={total} className="mt-2 !h-1.5" label={tr.t('quiz.title')} />
      </div>

      <article className="card p-5" aria-live="polite">
        {attempt.review && <p className="badge badge-warn mb-3">{tr.t('quiz.result.reviewMode')}</p>}
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-xl leading-relaxed font-bold" dir="auto">
            {q.prompt}
          </h2>
          <ReadAloud text={[q.prompt, ...q.options].join('. ')} className="shrink-0 !px-2" compact={false} />
          <button
            type="button"
            className={cx('icon-btn shrink-0', flags.has(index) && 'bg-soft text-warn')}
            aria-pressed={flags.has(index)}
            aria-label={flags.has(index) ? tr.t('quiz.player.flagged') : tr.t('quiz.player.flag')}
            title={tr.t('quiz.player.flag')}
            onClick={() =>
              setFlags((f) => {
                const n = new Set(f);
                if (n.has(index)) n.delete(index);
                else n.add(index);
                return n;
              })
            }
          >
            <Flag className="size-5" />
          </button>
        </div>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="mt-3 max-h-72 rounded-[var(--radius-control)]" />}
        {q.topic && <p className="badge mt-3">{q.topic}</p>}

        <div className="mt-5 space-y-2.5">
          {(q.type === 'mc' || q.type === 'tf') &&
            q.options.map((opt, i) => (
              <label
                key={i}
                className={cx(
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-2 transition-colors',
                  answers[index] === i ? 'border-primary bg-soft' : 'border-line hover:border-primary',
                )}
              >
                <input type="radio" name={`q-${index}`} className="size-5 accent-[var(--primary)]" checked={answers[index] === i} onChange={() => set(i)} />
                <span className="flex-1" dir="auto">
                  {opt}
                </span>
              </label>
            ))}
          {q.type === 'multi' && (
            <>
              <p className="muted text-sm">{tr.t('quiz.player.selectAll')}</p>
              {q.options.map((opt, i) => {
                const cur = Array.isArray(answers[index]) ? (answers[index] as number[]) : [];
                return (
                  <label
                    key={i}
                    className={cx(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-2',
                      cur.includes(i) ? 'border-primary bg-soft' : 'border-line hover:border-primary',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={cur.includes(i)}
                      onChange={(e) => set(e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i))}
                    />
                    <span className="flex-1" dir="auto">
                      {opt}
                    </span>
                  </label>
                );
              })}
            </>
          )}
          {q.type === 'short' && (
            <input
              className="input"
              value={typeof answers[index] === 'string' ? (answers[index] as string) : ''}
              onChange={(e) => set(e.target.value)}
              placeholder={tr.t('quiz.player.typeAnswer')}
              maxLength={500}
              aria-label={tr.t('quiz.player.typeAnswer')}
              dir="auto"
            />
          )}
        </div>
      </article>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" icon={<ChevronLeft className="size-4 flip-rtl" />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {tr.t('common.previous')}
        </Button>
        <span className="flex-1" />
        {index < total - 1 ? (
          <Button icon={<ChevronRight className="size-4 flip-rtl" />} onClick={() => setIndex(index + 1)} className="flex-row-reverse">
            {tr.t('common.next')}
          </Button>
        ) : (
          <Button variant="success" icon={<Send className="size-4" />} loading={busy} onClick={() => void submit()}>
            {tr.t('quiz.player.submit')}
          </Button>
        )}
      </div>

      <nav className="card mt-5 p-3" aria-label={tr.t('quiz.title')}>
        <ul className="flex flex-wrap gap-1.5">
          {attempt.questions.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={cx(
                  'relative grid size-9 place-items-center rounded-lg text-sm font-bold',
                  i === index ? 'bg-primary text-on-primary' : answered(i) ? 'bg-soft text-ink' : 'bg-bg-3 text-fg-2',
                )}
              >
                {i + 1}
                {flags.has(i) && <Flag className="absolute -end-1 -top-1 size-3 fill-current text-warn" />}
              </button>
            </li>
          ))}
        </ul>
        {index !== total - 1 && (
          <Button className="mt-3" variant="success" size="sm" icon={<Send className="size-4" />} loading={busy} onClick={() => void submit()}>
            {tr.t('quiz.player.submit')}
          </Button>
        )}
      </nav>
    </div>
  );
}

export default function QuizPlayPage() {
  const { attemptId = '' } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const [result, setResult] = useState<QuizResultDto | null>(null);
  const q = useQuery({ queryKey: ['attempt', attemptId], queryFn: () => api.quizzes.attempt(attemptId), staleTime: Infinity, retry: false });

  if (result) return <QuizResultView result={result} onRetry={() => navigate('/quiz')} />;
  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error || !q.data)
    return (
      <div className="page-narrow">
        <ErrorState error={q.error ?? new Error('x')} />
        <div className="mt-4 text-center">
          <Link to="/quiz" className="link">
            {tr.t('quiz.result.backToList')}
          </Link>
        </div>
      </div>
    );
  if (q.data.submitted) return <QuizResultView result={q.data.result} onRetry={() => navigate('/quiz')} />;
  return <Player attempt={q.data.attempt} onDone={setResult} />;
}
