import type { DailyReviewDto, FlashcardDto, RecurringMistakeDto, ReviewAnswerResultDto, ReviewQuestionDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, PartyPopper, Repeat } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { MathText } from '@/components/common/Math';
import { FocusPanel } from '@/components/study/focus';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toastError } from '@/lib/ui';

const TABS = ['today', 'mistakes'] as const;
type Item = { kind: 'card'; card: FlashcardDto } | { kind: 'question'; question: ReviewQuestionDto };
type Rating = 'again' | 'unsure' | 'know' | 'easy';

function CardStep({ card, onRated }: { card: FlashcardDto; onRated: () => void }) {
  const tr = useT();
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const rate = async (r: Rating) => {
    setBusy(true);
    try {
      await api.flashcards.review(card.id, r);
      onRated();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const buttons: { r: Rating; label: string; cls: string }[] = [
    { r: 'again', label: tr.t('academic.cards.again'), cls: 'btn-danger' },
    { r: 'unsure', label: tr.t('academic.cards.unsure'), cls: 'btn-outline' },
    { r: 'know', label: tr.t('academic.cards.know'), cls: 'btn-soft' },
    { r: 'easy', label: tr.t('academic.cards.easy'), cls: 'btn-success' },
  ];
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setFlipped(true)}
        className="card grid min-h-40 w-full place-items-center p-6 text-center text-xl font-black"
        aria-label={flipped ? card.back : card.front}
      >
        <span dir="auto">
          <MathText text={flipped ? card.back : card.front} />
        </span>
      </button>
      {flipped ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buttons.map((b) => (
            <button key={b.r} type="button" disabled={busy} className={cx('btn', b.cls)} onClick={() => void rate(b.r)}>
              {b.label}
            </button>
          ))}
        </div>
      ) : (
        <Button block variant="soft" onClick={() => setFlipped(true)}>
          {tr.t('academic.cards.showAnswer')}
        </Button>
      )}
    </div>
  );
}

function QuestionStep({ question, onDone }: { question: ReviewQuestionDto; onDone: () => void }) {
  const tr = useT();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReviewAnswerResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const multi = question.type === 'multi';
  const ready = question.type === 'short' ? text.trim().length > 0 : picked.length > 0;
  const check = async () => {
    setBusy(true);
    try {
      const answer = question.type === 'short' ? text.trim() : multi ? picked : picked[0]!;
      setResult(await api.study.answerQuestion(question.id, answer));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const right = (i: number) => result && (Array.isArray(result.answer) ? (result.answer as (number | string)[]).includes(i) : result.answer === i);
  return (
    <div className="space-y-4">
      <div className="card p-5">
        {question.topic && <span className="badge mb-2">{question.topic}</span>}
        <p className="text-lg font-bold" dir="auto">
          <MathText text={question.prompt} />
        </p>
        {question.imageUrl && <img src={question.imageUrl} alt="" className="mt-3 max-h-56 rounded-xl" />}
      </div>
      {question.type === 'short' ? (
        <Input label={tr.t('review.typeAnswer')} value={text} disabled={!!result} onChange={(e) => setText(e.target.value)} dir="auto" autoComplete="off" />
      ) : (
        <ul className="space-y-2">
          {question.options.map((o, i) => {
            const on = picked.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!!result}
                  aria-pressed={on}
                  onClick={() => setPicked(multi ? (on ? picked.filter((x) => x !== i) : [...picked, i]) : [i])}
                  className={cx(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2 text-start font-bold',
                    result && right(i) ? 'border-ok bg-ok-fill/10' : on ? 'border-primary bg-soft' : 'border-line bg-card',
                  )}
                  dir="auto"
                >
                  <MathText text={o} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {result ? (
        <div className="space-y-3">
          <p className={cx('flex items-center gap-2 font-black', result.correct ? 'text-ok' : 'text-err')} role="status">
            {result.correct ? <CircleCheck className="size-5" /> : <CircleX className="size-5" />}
            {result.correct ? tr.t('review.correct') : tr.t('review.wrong')}
            {!result.correct && question.type === 'short' && <span dir="auto">{(result.answer as string[]).join(' / ')}</span>}
          </p>
          {result.explanation && (
            <p className="muted text-sm" dir="auto">
              {result.explanation}
            </p>
          )}
          <Button block onClick={onDone}>
            {tr.t('review.next')}
          </Button>
        </div>
      ) : (
        <Button block disabled={!ready} loading={busy} onClick={() => void check()}>
          {tr.t('review.check')}
        </Button>
      )}
    </div>
  );
}

function Runner({ data }: { data: DailyReviewDto }) {
  const tr = useT();
  const qc = useQueryClient();
  // The queue is fixed when the screen opens, so finishing it (which refreshes the data) keeps the \"done\" message.
  const [items] = useState<Item[]>(() => [
    ...data.cards.map((card): Item => ({ kind: 'card', card })),
    ...data.questions.map((question): Item => ({ kind: 'question', question })),
  ]);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const next = () => {
    setIndex((i) => i + 1);
    if (index + 1 >= items.length) {
      void qc.invalidateQueries({ queryKey: ['review'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.flashcards });
    }
  };
  if (!items.length)
    return (
      <EmptyState
        icon={<PartyPopper className="size-7" />}
        title={tr.t('review.empty')}
        action={
          <ButtonLink to="/study-pack" variant="soft">
            {tr.t('review.openStudyPack')}
          </ButtonLink>
        }
      />
    );
  if (index >= items.length) return <EmptyState icon={<PartyPopper className="size-7" />} title={tr.t('review.done', { count: items.length })} />;
  const item = items[index]!;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {!started && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="font-bold">{tr.t('review.queue', { count: data.total, minutes: data.minutes })}</p>
          <Button onClick={() => setStarted(true)}>{tr.t('review.practice')}</Button>
        </div>
      )}
      {started && (
        <>
          <div className="muted flex items-center justify-between text-sm font-bold">
            <span>{item.kind === 'card' ? tr.t('review.cards') : tr.t('review.questions')}</span>
            <span className="tabular-nums">
              {index + 1}/{items.length}
            </span>
          </div>
          {item.kind === 'card' ? (
            <CardStep key={item.card.id} card={item.card} onRated={next} />
          ) : (
            <QuestionStep key={item.question.id} question={item.question} onDone={next} />
          )}
        </>
      )}
    </div>
  );
}

function Today() {
  const tr = useT();
  const q = useQuery({ queryKey: ['review', 'today'], queryFn: () => api.study.review(), staleTime: 0 });
  return (
    <QueryState query={q}>
      {(data) => (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            <Runner data={data} />
            {data.weakObjectives.length > 0 && (
              <section className="card p-4">
                <h2 className="mb-2 font-black">{tr.t('review.weak')}</h2>
                <ul className="divide-y divide-line">
                  {data.weakObjectives.map((w) => (
                    <li key={w.id} className="flex min-h-12 items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                        {w.title}
                      </span>
                      <span className="badge badge-warn tabular-nums">{w.pct}%</span>
                      <Link to={`/curriculum/${w.id}`} className="btn btn-soft btn-sm">
                        {tr.t('review.practice')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <FocusPanel />
        </div>
      )}
    </QueryState>
  );
}

function Mistakes() {
  const tr = useT();
  const q = useQuery({ queryKey: ['review', 'mistakes'], queryFn: () => api.study.mistakes() });
  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div>
        <h2 className="font-black">{tr.t('review.mistakesTitle')}</h2>
        <p className="muted text-sm">{tr.t('review.mistakesHint')}</p>
      </div>
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState icon={<CircleCheck className="size-7" />} title={tr.t('review.mistakesEmpty')} />
          ) : (
            <ul className="space-y-2">
              {d.items.map((m: RecurringMistakeDto) => (
                <li key={m.questionId} className="card flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold" dir="auto">
                      <MathText text={m.prompt} />
                    </p>
                    <p className="muted text-xs" dir="auto">
                      {[m.objectiveTitle ?? m.topic, tr.t('review.missedTimes', { count: m.misses })].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {m.practiceLink && (
                    <Link to={m.practiceLink} className="btn btn-soft btn-sm">
                      {tr.t('review.practiceTopic')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

export default function ReviewPage() {
  const tr = useT();
  const [tab, setTab] = useTabParam(TABS, 'today');
  return (
    <div className="page">
      <PageHeader title={tr.t('review.title')} subtitle={tr.t('review.subtitle')} icon={<Repeat className="size-6" />} />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'today', label: tr.t('review.tabToday') },
          { key: 'mistakes', label: tr.t('review.tabMistakes') },
        ]}
      />
      {tab === 'today' ? <Today /> : <Mistakes />}
    </div>
  );
}
