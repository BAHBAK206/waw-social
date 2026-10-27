import type { AiAnswerDto, QuestionReview, QuizResultDto } from '@qubedu/shared';
import { Check, Clapperboard, Layers, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ButtonLink, Button } from '@/components/ui/Button';
import { ProgressBar, ProgressRing } from '@/components/ui/Charts';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { achievementName, toast, toastError } from '@/lib/ui';
import { ACHIEVEMENTS, xpProgress } from '@qubedu/shared';

function show(r: QuestionReview, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (r.type === 'short') return Array.isArray(v) ? (v as string[]).join(' / ') : String(v);
  const list = Array.isArray(v) ? (v as number[]) : [v as number];
  return list
    .map((i) => r.options[i] ?? '')
    .filter(Boolean)
    .join('، ');
}

function Review({ attemptId, item, index }: { attemptId: string; item: QuestionReview; index: number }) {
  const tr = useT();
  const [ai, setAi] = useState<AiAnswerDto | null>(null);
  const [busy, setBusy] = useState(false);
  const given = show(item, item.given);
  return (
    <li className={cx('card border-s-4 p-4', item.correct ? 'border-s-[var(--ok)]' : 'border-s-[var(--err)]')}>
      <div className="flex items-start gap-3">
        <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-white', item.correct ? 'bg-ok-fill' : 'bg-err-fill')} aria-hidden>
          {item.correct ? <Check className="size-4" /> : <X className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold" dir="auto">
            {index + 1}. {item.prompt}
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="muted shrink-0">{tr.t('quiz.result.yourAnswer')}:</dt>
              <dd className={item.correct ? 'text-ok font-bold' : 'text-err font-bold'} dir="auto">
                {given || tr.t('quiz.result.noAnswer')}
              </dd>
            </div>
            {!item.correct && (
              <div className="flex gap-2">
                <dt className="muted shrink-0">{tr.t('quiz.result.correctAnswer')}:</dt>
                <dd className="text-ok font-bold" dir="auto">
                  {show(item, item.answer)}
                </dd>
              </div>
            )}
          </dl>
          {item.explanation && (
            <p className="mt-2 rounded-[var(--radius-control)] bg-bg-2 p-2 text-sm" dir="auto">
              <span className="font-bold">{tr.t('quiz.result.explanation')}: </span>
              {item.explanation}
            </p>
          )}
          {!item.correct && (
            <div className="mt-2">
              {ai ? (
                <div className="rounded-[var(--radius-control)] bg-soft p-3 text-sm">
                  <p className="font-bold" dir="auto">
                    {ai.answer}
                  </p>
                  {ai.steps.length > 0 && (
                    <ol className="mt-1 list-decimal ps-5">
                      {ai.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy}
                  icon={<Sparkles className="size-4" />}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setAi(await api.ai.explain(attemptId, item.questionId));
                    } catch (e) {
                      toastError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {tr.t('quiz.result.explainAi')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Turns every missed question into a flashcard (question → correct answer + explanation) for spaced review. */
function MistakesToCards({ result }: { result: QuizResultDto }) {
  const tr = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const wrong = result.breakdown.filter((b) => !b.correct);
  if (!wrong.length) return null;
  return (
    <Button
      variant="soft"
      icon={<Layers className="size-4" />}
      loading={state === 'busy'}
      disabled={state === 'done'}
      onClick={async () => {
        setState('busy');
        try {
          const cards = wrong.map((b) => ({
            front: b.prompt.slice(0, 1000),
            back: [show(b, b.answer), b.explanation ?? ''].filter(Boolean).join('\n').slice(0, 2000) || '—',
            deck: tr.t('quiz.result.mistakesDeck'),
          }));
          const res = await api.flashcards.create(cards);
          toast(tr.t('ai.savedCards', { count: res.items.length }));
          setState('done');
        } catch (e) {
          setState('idle');
          toastError(e);
        }
      }}
    >
      {state === 'done' ? tr.t('quiz.result.mistakesSaved') : tr.t('quiz.result.mistakesToCards', { count: wrong.length })}
    </Button>
  );
}

export function QuizResultView({ result, onRetry }: { result: QuizResultDto; onRetry: () => void }) {
  const tr = useT();
  const level = xpProgress(result.xpAfter);
  const lessons = result.lessons ?? [];
  return (
    <div className="page-narrow space-y-5">
      <section className="card p-6 text-center">
        <h1 className="text-2xl font-black">{result.perfect ? tr.t('quiz.result.perfect') : tr.t('quiz.result.title')}</h1>
        <div className="my-5 flex justify-center">
          <ProgressRing value={result.pct} size={160} stroke={14} label={tr.t('quiz.result.title')}>
            <div>
              <div className="text-4xl font-black tabular-nums">{result.pct}%</div>
              <div className="muted text-sm">{tr.t('quiz.result.score', { correct: result.correct, total: result.total })}</div>
            </div>
          </ProgressRing>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {result.isNewBest && <span className="badge badge-ok">{tr.t('quiz.result.newBest')}</span>}
          {result.xpEarned > 0 && <span className="badge badge-primary">{tr.t('quiz.result.xpEarned', { xp: result.xpEarned })}</span>}
          {result.levelUp && <span className="badge badge-warn">{tr.t('quiz.result.levelUp', { level: result.levelAfter })}</span>}
          <span className="badge">{tr.t('quiz.result.time', { time: formatClock(result.timeSec) })}</span>
          {result.review && <span className="badge badge-warn">{tr.t('quiz.result.reviewMode')}</span>}
        </div>
        <div className="mx-auto mt-4 max-w-xs">
          <ProgressBar value={level.progress} max={100} label={tr.t('common.levelN', { level: level.level })} />
          <p className="muted mt-1 text-xs">{tr.t('common.levelN', { level: level.level })}</p>
        </div>
        {result.newAchievements.length > 0 && (
          <div className="mt-4 text-sm font-bold text-ok">
            {tr.t('quiz.result.achievements')}{' '}
            {result.newAchievements.map((a) => (
              <span key={a} className="ms-1">
                {ACHIEVEMENTS.find((d) => d.id === a)?.icon} {achievementName(a)}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {result.quizId && (
            <Button variant="outline" onClick={onRetry}>
              {tr.t('quiz.result.backToList')}
            </Button>
          )}
          <ButtonLink to="/academic?tab=mastery" variant="soft">
            {tr.t('academic.tabs.mastery')}
          </ButtonLink>
          {!result.review && <MistakesToCards result={result} />}
        </div>
      </section>

      {lessons.length > 0 && (
        <section className={cx('card p-4', result.pct < 70 && 'ring-2 ring-[var(--warn)]')} aria-label={tr.t('quiz.result.reviewLesson')}>
          <h2 className="mb-1 flex items-center gap-2 font-black">
            <Clapperboard className="size-5 text-ink" aria-hidden /> {tr.t('quiz.result.reviewLesson')}
          </h2>
          <p className="muted mb-3 text-sm">{result.pct < 70 ? tr.t('quiz.result.reviewLessonLow') : tr.t('quiz.result.reviewLessonHint')}</p>
          <ul className="flex flex-wrap gap-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/watch/${l.id}`} className="chip" dir="auto">
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.topicStats.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 font-black">{tr.t('quiz.result.topics')}</h2>
          <ul className="space-y-3">
            {result.topicStats.map((t) => (
              <li key={t.topic}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-bold" dir="auto">
                    {t.topic}
                  </span>
                  <span className="tabular-nums">
                    {t.correct}/{t.total} · {t.pct}%
                  </span>
                </div>
                <ProgressBar value={t.pct} label={t.topic} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-black">{tr.t('quiz.result.breakdown')}</h2>
        <ol className="space-y-3">
          {result.breakdown.map((b, i) => (
            <Review key={b.questionId} attemptId={result.attemptId} item={b} index={i} />
          ))}
        </ol>
      </section>
      <p className="text-center">
        <Link to="/quiz" className="link">
          {tr.t('quiz.result.backToList')}
        </Link>
      </p>
    </div>
  );
}
