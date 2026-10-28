import type { QuizSummaryDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Brain, Clock, ListChecks, Pencil, Play, Plus, RotateCcw, Search, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AdsStrip } from '@/components/common/Ads';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';

const DIFF_STYLE = { easy: 'badge-ok', medium: 'badge-warn', hard: 'badge-err' } as const;

export function QuizCard({ quiz, onStart, busy }: { quiz: QuizSummaryDto; onStart: (review: boolean) => void; busy: boolean }) {
  const tr = useT();
  const notStarted = quiz.scheduledAt && quiz.scheduledAt > Date.now();
  return (
    <article className="card flex flex-col p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cx('badge', DIFF_STYLE[quiz.difficulty])}>{tr.t(`quiz.difficulties.${quiz.difficulty}`)}</span>
        <span className="badge">{tr.t(`quiz.kinds.${quiz.kind}`)}</span>
        {!quiz.published && <span className="badge badge-warn">{tr.t('common.draft')}</span>}
        {quiz.section && <span className="badge badge-primary">{quiz.section.name}</span>}
        {quiz.material && <span className="badge">{quiz.material.name}</span>}
      </div>
      <h3 className="line-clamp-2 text-lg leading-snug font-black" dir="auto">
        {quiz.title}
      </h3>
      {quiz.description && (
        <p className="muted line-clamp-2 mt-1 text-sm" dir="auto">
          {quiz.description}
        </p>
      )}
      <p className="muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1">
          <ListChecks className="size-4" /> {tr.t('quiz.questions', { count: quiz.questionCount })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-4" /> {tr.t('quiz.duration', { count: Math.round(quiz.durationSec / 60) })}
        </span>
        {quiz.attempts > 0 && <span>{tr.t('quiz.attempts', { count: quiz.attempts })}</span>}
      </p>
      {quiz.myBest && (
        <p className="mt-2 flex items-center gap-1 text-sm font-bold text-ok">
          <Trophy className="size-4" /> {tr.t('quiz.myBest', { pct: quiz.myBest.pct })}
        </p>
      )}
      {notStarted && <p className="mt-2 text-sm font-bold text-warn">{tr.t('quiz.scheduled', { date: formatDateTime(quiz.scheduledAt!, tr) })}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {quiz.kind !== 'bank' && (
          <Button
            size="sm"
            icon={quiz.myBest ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
            loading={busy}
            disabled={!!notStarted}
            onClick={() => onStart(false)}
          >
            {quiz.myBest ? tr.t('quiz.retake') : tr.t('quiz.start')}
          </Button>
        )}
        {quiz.myBest && quiz.myBest.pct < 100 && (
          <Button size="sm" variant="soft" onClick={() => onStart(true)}>
            {tr.t('quiz.reviewWrong')}
          </Button>
        )}
        {quiz.canEdit && (
          <>
            <ButtonLink size="sm" variant="ghost" to={`/quiz/${quiz.id}/edit`} icon={<Pencil className="size-4" />}>
              {tr.t('common.edit')}
            </ButtonLink>
            {quiz.kind !== 'bank' && (
              <ButtonLink size="sm" variant="ghost" to={`/quiz/${quiz.id}/stats`} icon={<BarChart3 className="size-4" />}>
                {tr.t('quiz.stats')}
              </ButtonLink>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export default function QuizListPage() {
  const tr = useT();
  const navigate = useNavigate();
  const gate = useAuthGate();
  const authed = useSession((s) => s.status === 'authed');
  const isTeacher = useSession((s) => s.me?.accountType === 'teacher' || (s.me?.role ?? 'user') !== 'user');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const section = params.get('section') ?? '';
  const material = params.get('material') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const mine = params.get('mine') === '1';
  const banks = params.get('tab') === 'banks';
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k === 'section') n.delete('material');
        return n;
      },
      { replace: true },
    );

  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const filters = { q: debounced, sectionId: section, materialId: material, difficulty, mine, banks };
  const list = usePaged<QuizSummaryDto>(qk.quizzes(filters), (cursor) =>
    api.quizzes.list({
      q: debounced || undefined,
      sectionId: section || undefined,
      materialId: material || undefined,
      difficulty: difficulty || undefined,
      mine: mine || banks || undefined,
      kind: banks ? 'bank' : undefined,
      cursor,
      limit: 18,
    }),
  );
  const materials = taxonomy.data?.sections.find((s) => s.id === section)?.materials ?? [];

  const start = gate(async (quiz: QuizSummaryDto, review: boolean) => {
    setBusy(quiz.id);
    try {
      const attempt = await api.quizzes.start(quiz.id, review);
      navigate(`/quiz/attempt/${attempt.attemptId}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  });

  const adaptive = gate(async () => {
    setBusy('adaptive');
    try {
      const attempt = await api.quizzes.adaptive({ count: 10 });
      navigate(`/quiz/attempt/${attempt.attemptId}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  });

  return (
    <div className="page">
      <PageHeader
        title={tr.t('quiz.title')}
        subtitle={tr.t('quiz.subtitle')}
        icon={<ListChecks className="size-6" />}
        actions={
          <>
            <Button variant="soft" icon={<Brain className="size-4" />} loading={busy === 'adaptive'} onClick={() => void adaptive()}>
              {tr.t('quiz.adaptive')}
            </Button>
            {authed && isTeacher && (
              <ButtonLink to="/quiz/new" icon={<Plus className="size-4" />}>
                {tr.t('quiz.create')}
              </ButtonLink>
            )}
          </>
        }
      />
      <AdsStrip placement="quiz" />
      <div className="card mb-5 grid gap-3 p-3 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            className="input ps-10"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr.t('quiz.searchPlaceholder')}
            aria-label={tr.t('quiz.searchPlaceholder')}
          />
        </div>
        <select className="input md:w-44" aria-label={tr.t('quiz.section')} value={section} onChange={(e) => set('section', e.target.value)}>
          <option value="">{tr.t('quiz.section')}</option>
          {taxonomy.data?.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input md:w-44"
          aria-label={tr.t('quiz.material')}
          value={material}
          disabled={!materials.length}
          onChange={(e) => set('material', e.target.value)}
        >
          <option value="">{tr.t('quiz.material')}</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="input md:w-40" aria-label={tr.t('quiz.difficulty')} value={difficulty} onChange={(e) => set('difficulty', e.target.value)}>
          <option value="">{tr.t('quiz.difficulty')}</option>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <option key={d} value={d}>
              {tr.t(`quiz.difficulties.${d}`)}
            </option>
          ))}
        </select>
      </div>
      {authed && isTeacher && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cx('chip', !mine && !banks && 'is-active')}
            aria-pressed={!mine && !banks}
            onClick={() => setParams({}, { replace: true })}
          >
            {tr.t('common.all')}
          </button>
          <button type="button" className={cx('chip', mine && 'is-active')} aria-pressed={mine} onClick={() => setParams({ mine: '1' }, { replace: true })}>
            {tr.t('quiz.mine')}
          </button>
          <button
            type="button"
            className={cx('chip', banks && 'is-active')}
            aria-pressed={banks}
            onClick={() => setParams({ tab: 'banks' }, { replace: true })}
          >
            {tr.t('quiz.bank.banks')}
          </button>
          {banks && (
            <ButtonLink to="/quiz/new?kind=bank" size="sm" variant="outline" icon={<Plus className="size-4" />}>
              {tr.t('quiz.bank.newBank')}
            </ButtonLink>
          )}
        </div>
      )}
      {banks && <p className="muted mb-3 text-sm">{tr.t('quiz.bank.hint')}</p>}
      {list.isPending ? (
        <CardSkeletons count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState icon={<ListChecks className="size-7" />} title={banks ? tr.t('quiz.bank.empty') : tr.t('quiz.empty')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} busy={busy === quiz.id} onStart={(review) => void start(quiz, review)} />
            ))}
          </div>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
        </>
      )}
    </div>
  );
}
