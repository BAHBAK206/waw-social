import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/Charts';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function QuizStatsPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const q = useQuery({ queryKey: ['quiz-stats', id], queryFn: () => api.quizzes.stats(id) });
  return (
    <div className="page-narrow space-y-5">
      <PageHeader title={tr.t('quiz.statsTitle')} icon={<BarChart3 className="size-6" />} />
      <QueryState query={q}>
        {(s) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4">
                <p className="muted text-sm">{tr.t('quiz.attempts', { count: '' }).trim()}</p>
                <p className="text-3xl font-black tabular-nums">{s.attempts}</p>
              </div>
              <div className="card p-4">
                <p className="muted text-sm">{tr.t('quiz.averageScore')}</p>
                <p className="text-3xl font-black tabular-nums">{s.averagePct === null ? '—' : `${s.averagePct}%`}</p>
              </div>
            </div>
            <section className="card p-4">
              <h2 className="mb-3 font-black">{tr.t('quiz.questionAccuracy')}</h2>
              <ol className="space-y-3">
                {s.questions.map((qq, i) => {
                  const pct = qq.total ? Math.round((qq.correct / qq.total) * 100) : 0;
                  return (
                    <li key={qq.id}>
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span className="line-clamp-1 font-bold" dir="auto">
                          {i + 1}. {qq.prompt}
                        </span>
                        <span className="tabular-nums">{qq.total ? `${pct}%` : '—'}</span>
                      </div>
                      <ProgressBar value={pct} label={qq.prompt} />
                    </li>
                  );
                })}
              </ol>
            </section>
            <section className="card p-4">
              <h2 className="mb-3 font-black">{tr.t('quiz.topStudents')}</h2>
              <ol className="space-y-2">
                {s.leaderboard.map((l, i) => (
                  <li key={l.user.id} className="flex items-center gap-3">
                    <span className="muted w-6 text-center tabular-nums">{i + 1}</span>
                    <Avatar name={l.user.displayName} url={l.user.avatarUrl} size="sm" />
                    <span className="flex-1 truncate font-bold">{l.user.displayName}</span>
                    <span className="font-black tabular-nums">{l.pct}%</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
