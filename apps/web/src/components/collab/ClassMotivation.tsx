import type { CourseDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

/** The class's weekly study goal and its challenge against the other classes of its school. */
export function ClassMotivation({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const goal = useQuery({ queryKey: ['course', course.id, 'goal'], queryFn: () => api.collab.goal(course.id) });
  const challenge = useQuery({ queryKey: ['course', course.id, 'challenge'], queryFn: () => api.collab.challenge(course.id) });
  const [target, setTarget] = useState('');
  const save = useMutation({
    mutationFn: () => api.collab.setGoal(course.id, Number(target)),
    onSuccess: (g) => {
      qc.setQueryData(['course', course.id, 'goal'], g);
      setTarget('');
    },
    onError: toastError,
  });
  const g = goal.data;
  const c = challenge.data;
  if (!g && !c) return null;
  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      {g && (
        <section className="card space-y-3 p-4" aria-label={tr.t('collab.goalTitle')}>
          <h3 className="flex items-center gap-2 font-black">
            <Flag className="size-5 text-ink" aria-hidden /> {tr.t('collab.goalTitle')}
          </h3>
          {g.targetMinutes ? (
            <>
              <ProgressBar value={g.minutes} max={g.targetMinutes} label={tr.t('collab.goalTitle')} />
              <p className="text-sm font-bold tabular-nums">{tr.t('collab.goalProgress', { minutes: g.minutes, target: g.targetMinutes })}</p>
              {g.reached && <p className="font-black text-ok">{tr.t('collab.goalReached')}</p>}
            </>
          ) : (
            <p className="muted text-sm">{tr.t('collab.goalNone')}</p>
          )}
          <p className="muted text-xs">{tr.t('collab.badges', { count: g.badges })}</p>
          {g.canSet && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(target) >= 30) save.mutate();
              }}
            >
              <Input
                type="number"
                min={30}
                step={30}
                label={tr.t('collab.goalSet')}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                dir="ltr"
                wrapperClassName="flex-1"
              />
              <Button type="submit" loading={save.isPending} disabled={Number(target) < 30}>
                {tr.t('collab.goalSave')}
              </Button>
            </form>
          )}
        </section>
      )}
      {c && (
        <section className="card space-y-3 p-4" aria-label={tr.t('collab.challengeTitle')}>
          <h3 className="flex items-center gap-2 font-black">
            <Trophy className="size-5 text-ink" aria-hidden /> {tr.t('collab.challengeTitle')}
          </h3>
          {!c.schoolId || !c.standings.length ? (
            <p className="muted text-sm">{tr.t('collab.challengeNone')}</p>
          ) : (
            <>
              <p className="muted text-sm">{tr.t('collab.challengeHint')}</p>
              <ol className="space-y-1.5">
                {c.standings.map((s) => (
                  <li key={s.courseId} className={cx('flex items-center gap-3 rounded-lg px-2 py-1.5', s.mine && 'bg-soft')}>
                    <span className="w-6 text-center font-black tabular-nums">{s.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                      {s.title} {s.mine && <span className="badge badge-primary ms-1">{tr.t('collab.mine')}</span>}
                    </span>
                    <span className="muted text-xs tabular-nums">{tr.t('collab.students', { count: s.students })}</span>
                    <span className="font-black tabular-nums">{tr.t('collab.average', { count: s.average })}</span>
                  </li>
                ))}
              </ol>
              {c.lastWeekWinner && <p className="muted text-xs">{tr.t('collab.lastWinner', { title: c.lastWeekWinner.title })}</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
