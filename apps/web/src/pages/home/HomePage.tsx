import type { DailyChallengeDto } from '@qubedu/shared';
import { xpProgress } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  Flame,
  GraduationCap,
  HeartHandshake,
  Layers,
  ListChecks,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AdsStrip } from '@/components/common/Ads';
import { TrendingWidget } from '@/components/feed/TrendingWidget';
import { AtRiskSection } from '@/components/family/Insights';
import { LeagueCard } from '@/pages/league/LeaguePage';
import { TodayClasses } from '@/components/tools/Timetable';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ColumnChart, ProgressBar, ProgressRing } from '@/components/ui/Charts';
import { Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { daysUntil, formatDate, greetingKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { celebrate, toastError, useUi } from '@/lib/ui';

function DailyChallengeCard() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.daily, queryFn: () => api.daily.get() });
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const c: DailyChallengeDto | null | undefined = q.data?.challenge;
  if (!c) return q.isPending ? null : null;

  const submit = async (answer?: number) => {
    setBusy(true);
    try {
      const res = await api.daily.answer(answer);
      qc.setQueryData(qk.daily, res);
      const r = res.challenge.result;
      if (r) {
        celebrate({ xpEarned: r.xpEarned, xpAfter: undefined });
        const me = useSession.getState().me;
        if (me && r.xpEarned) useSession.getState().patchMe({ xp: me.xp + r.xpEarned });
      }
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card relative overflow-hidden p-5" aria-label={tr.t('daily.title')}>
      <div className="surface-gradient absolute -end-10 -top-10 size-40 rounded-full opacity-20" aria-hidden />
      <div className="mb-2 flex items-center gap-2">
        <Flame className="size-5 text-warn" aria-hidden />
        <h2 className="font-black">{tr.t('daily.title')}</h2>
        <span className="badge badge-primary ms-auto">{tr.t('daily.reward', { xp: c.xp })}</span>
      </div>
      <p className="font-bold" dir="auto">
        {c.question ?? c.title}
      </p>
      {c.description && <p className="muted mt-1 text-sm">{c.description}</p>}
      {c.claimed ? (
        <p className={cx('mt-3 flex items-center gap-2 font-bold', c.result?.correct ? 'text-ok' : 'text-fg-2')}>
          <CheckCircle2 className="size-5" aria-hidden />
          {c.type === 'quiz'
            ? c.result?.correct
              ? tr.t('daily.correct', { xp: c.result.xpEarned })
              : tr.t('daily.wrong', { answer: c.options[c.result?.answer ?? 0] ?? '' })
            : tr.t('daily.done')}
        </p>
      ) : c.type === 'quiz' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {c.options.map((o, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              className={cx(
                'min-h-11 rounded-[var(--radius-control)] border px-3 text-start font-bold transition-colors',
                picked === i ? 'border-primary bg-soft' : 'border-line hover:border-primary',
              )}
              onClick={() => {
                setPicked(i);
                void submit(i);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <Button className="mt-3" loading={busy} onClick={() => void submit()}>
          {tr.t('daily.complete')}
        </Button>
      )}
    </section>
  );
}

/** Parents land on their children's week. */
function ParentCard() {
  const tr = useT();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  return (
    <section className="card flex flex-wrap items-center gap-3 p-4">
      <HeartHandshake className="size-6 text-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-black">{tr.t('family.title')}</p>
        <p className="muted text-sm">
          {fam.data?.children.length
            ? fam.data.children.map((c) => `${c.displayName}: ${tr.t('family.thisWeek', { minutes: c.minutesThisWeek })}`).join(' · ')
            : tr.t('family.linkHint')}
        </p>
      </div>
      <ButtonLink to="/family">{tr.t('family.open')}</ButtonLink>
    </section>
  );
}

function Dashboard() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: qk.dashboard, queryFn: () => api.academic.dashboard() });
  const prog = xpProgress(me.xp);
  const d = q.data;
  const goalPct = d ? Math.min(100, Math.round((d.studyMinutesToday / Math.max(1, d.dailyGoalMinutes)) * 100)) : 0;
  const ui = useUi.getState();

  return (
    <div className="space-y-6">
      <section className="surface-gradient relative overflow-hidden rounded-[var(--radius-card)] p-6 md:p-8">
        <div className="relative z-10 flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-white/85">{tr.t(greetingKey())}</p>
            <h1 className="text-3xl font-black md:text-4xl">{me.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-bold text-white/95">
              <span className="flex items-center gap-1">
                <Flame className="size-5" aria-hidden /> {me.streak > 0 ? tr.t('home.streakDays', { count: me.streak }) : tr.t('home.streakStart')}
              </span>
              <span>{tr.t('common.levelN', { level: prog.level })}</span>
              <span className="tabular-nums">{me.xp.toLocaleString(tr.intl)} XP</span>
            </p>
            <div className="mt-3 max-w-sm">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: `${prog.progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-white/85">
                {tr.t('home.levelProgress', { xp: prog.inLevel, needed: prog.needed - prog.inLevel, next: prog.level + 1 })}
              </p>
            </div>
          </div>
          <ProgressRing value={goalPct} max={100} size={112} stroke={10} label={tr.t('home.dailyGoal')}>
            <div className="text-white">
              <div className="text-2xl font-black tabular-nums">{goalPct}%</div>
              <div className="text-[11px]">{tr.t('home.dailyGoal')}</div>
            </div>
          </ProgressRing>
        </div>
      </section>
      {me.accountType === 'student' && <LeagueCard />}
      {(me.accountType === 'teacher' || me.role !== 'user') && <AtRiskSection limit={3} />}
      {me.accountType === 'parent' && <ParentCard />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Timer, label: tr.t('home.startFocus'), onClick: () => ui.set({ pomodoroOpen: true }) },
          { icon: Layers, label: tr.t('home.reviewCards') + (d?.dueCards ? ` (${d.dueCards})` : ''), onClick: () => ui.set({ flashcards: {} }) },
          { icon: ListChecks, label: tr.t('home.practice'), to: '/quiz' },
          { icon: Sparkles, label: tr.t('home.askTutor'), to: '/assistant' },
        ].map((a) =>
          a.to ? (
            <Link
              key={a.label}
              to={a.to}
              className="card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center font-bold transition-transform hover:-translate-y-0.5"
            >
              <a.icon className="size-6 text-ink" aria-hidden /> {a.label}
            </Link>
          ) : (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center font-bold transition-transform hover:-translate-y-0.5"
            >
              <a.icon className="size-6 text-ink" aria-hidden /> {a.label}
            </button>
          ),
        )}
      </div>

      <AdsStrip placement="home" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <TodayClasses />
          <DailyChallengeCard />
          <section className="card p-4" aria-label={tr.t('home.inbox')}>
            <h2 className="mb-3 flex items-center gap-2 font-black">
              <Target className="size-5 text-ink" aria-hidden /> {tr.t('home.inbox')}
            </h2>
            {q.isPending ? (
              <Spinner className="py-4" />
            ) : !d?.inbox.length ? (
              <p className="muted">{tr.t('home.inboxEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.inbox.slice(0, 6).map((it, i) => (
                  <li key={i}>
                    <Link to={it.link} className="flex min-h-12 items-center gap-3 py-2 hover:text-ink">
                      <span className="badge badge-primary shrink-0">{tr.tDyn(`academic.inboxKinds.${it.kind}`, undefined, it.kind)}</span>
                      <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                        {it.title}
                        {it.count ? ` (${it.count})` : ''}
                      </span>
                      {it.dueAt && <span className="muted shrink-0 text-xs">{formatDate(it.dueAt, tr, { month: 'short', day: 'numeric' })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {d && (
            <section className="card p-4">
              <ColumnChart
                title={tr.t('home.weekActivity')}
                unit="min"
                data={d.weeklyMinutes.map((w) => ({
                  label: formatDate(w.day, tr, { weekday: 'short' }).slice(0, 3),
                  title: formatDate(w.day, tr),
                  value: w.minutes,
                }))}
                height={150}
              />
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <section className="card p-4" aria-label={tr.t('home.upcomingExams')}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-black">
                <Calendar className="size-5 text-ink" aria-hidden /> {tr.t('home.upcomingExams')}
              </h2>
              <Link to="/academic?tab=exams" className="link text-sm">
                {tr.t('home.addExam')}
              </Link>
            </div>
            {!d?.upcomingExams.length ? (
              <p className="muted text-sm">{tr.t('home.noExams')}</p>
            ) : (
              <ul className="space-y-2">
                {d.upcomingExams.slice(0, 4).map((e) => {
                  const n = daysUntil(e.day);
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <span
                        className={cx(
                          'grid size-12 shrink-0 place-items-center rounded-xl text-center font-black leading-tight',
                          n <= 3 ? 'bg-err-fill text-white' : 'bg-soft text-ink',
                        )}
                      >
                        <span className="text-lg tabular-nums">{n}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{e.subject}</span>
                        <span className="muted text-xs">{n === 0 ? tr.t('academic.examToday') : tr.t('home.inDays', { count: n })}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {d && d.weakTopics.length > 0 && (
            <section className="card p-4" aria-label={tr.t('home.weakTopics')}>
              <h2 className="mb-3 flex items-center gap-2 font-black">
                <Brain className="size-5 text-ink" aria-hidden /> {tr.t('home.weakTopics')}
              </h2>
              <ul className="space-y-3">
                {d.weakTopics.slice(0, 4).map((t) => (
                  <li key={t.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-bold" dir="auto">
                        {t.topic}
                      </span>
                      <span className="tabular-nums">{Math.round(t.mastery)}%</span>
                    </div>
                    <ProgressBar value={t.mastery} label={t.topic} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <TrendingWidget limit={5} />
        </aside>
      </div>
    </div>
  );
}

function GuestHome() {
  const tr = useT();
  const features = [
    { icon: ListChecks, key: 'quiz' as const, to: '/quiz' },
    { icon: Sparkles, key: 'ai' as const, to: '/ai' },
    { icon: Users, key: 'groups' as const, to: '/groups' },
    { icon: GraduationCap, key: 'school' as const, to: '/school' },
    { icon: BookOpen, key: 'library' as const, to: '/library' },
    { icon: Trophy, key: 'leaderboard' as const, to: '/people?tab=leaderboard' },
  ];
  return (
    <div className="space-y-10">
      <section className="surface-gradient overflow-hidden rounded-[var(--radius-card)] px-6 py-12 text-center md:py-20">
        <img src="/brand/qubedu-mark.svg" alt="" className="mx-auto mb-5 size-20" />
        <h1 className="mx-auto max-w-2xl text-3xl font-black md:text-5xl">{tr.t('home.heroTitle')}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">{tr.t('home.heroSubtitle')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/register" size="lg" className="!bg-white !text-[var(--primary-3)] !shadow-xl">
            {tr.t('home.getStarted')}
          </ButtonLink>
          <ButtonLink to="/watch" size="lg" variant="outline" className="border-white/50 !bg-white/10 !text-white">
            {tr.t('nav.watch')}
          </ButtonLink>
        </div>
      </section>
      <section aria-label={tr.t('home.guestFeatures')}>
        <h2 className="mb-5 text-center text-2xl font-black">{tr.t('home.guestFeatures')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link key={f.key} to={f.to} className="card flex gap-4 p-5 transition-transform hover:-translate-y-1">
              <span className="surface-gradient grid size-12 shrink-0 place-items-center rounded-2xl">
                <f.icon className="size-6" aria-hidden />
              </span>
              <span>
                <span className="block text-lg font-black">{tr.t(`nav.${f.key}`)}</span>
                <span className="muted text-sm">{tr.t(`features.${f.key}`)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const status = useSession((s) => s.status);
  return <div className="page">{status === 'authed' ? <Dashboard /> : <GuestHome />}</div>;
}
