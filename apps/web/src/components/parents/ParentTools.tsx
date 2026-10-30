import type { BehaviorNoteDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Frown, Smile, Square, Volume2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { canSpeak, speak, stopSpeaking, useSpeech } from '@/lib/speech';
import { toastError } from '@/lib/ui';

/** The week in a few spoken sentences, read by the device in the parent's language. */
export function VoiceSummary({ studentId }: { studentId: string }) {
  const tr = useT();
  const id = useId();
  const speaking = useSpeech((s) => s.speakingId === id);
  const run = useMutation({
    mutationFn: () => api.parentComms.summary(studentId),
    onSuccess: (d) => void speak(d.text, { lang: d.language, id }),
    onError: toastError,
  });
  if (!canSpeak()) return null;
  return (
    <section className="card flex flex-wrap items-center gap-3 p-4" aria-label={tr.t('parentComms.voice.title')}>
      <h2 className="min-w-0 flex-1 font-black">{tr.t('parentComms.voice.title')}</h2>
      {speaking ? (
        <Button variant="soft" icon={<Square className="size-4 fill-current" />} onClick={() => stopSpeaking()}>
          {tr.t('parentComms.voice.stop')}
        </Button>
      ) : (
        <Button variant="soft" loading={run.isPending} icon={<Volume2 className="size-4" />} onClick={() => run.mutate()}>
          {tr.t('parentComms.voice.listen')}
        </Button>
      )}
    </section>
  );
}

/** Homework of one child: tap "I saw it" so the teacher knows the family is aware. */
export function HomeworkCheck({ studentId }: { studentId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['parent-homework'], queryFn: () => api.parentComms.homework() });
  const ack = useMutation({
    mutationFn: (assignmentId: string) => api.parentComms.ackHomework(assignmentId, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-homework'] }),
    onError: toastError,
  });
  const items = (q.data?.items ?? []).filter((i) => i.student.id === studentId && i.status !== 'graded');
  return (
    <section className="card space-y-2 p-4" aria-label={tr.t('parentComms.homework.title')}>
      <h2 className="font-black">{tr.t('parentComms.homework.title')}</h2>
      {!items.length ? (
        <p className="muted text-sm">{tr.t('parentComms.homework.none')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.assignmentId} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold" dir="auto">
                  {i.title}
                </p>
                <p className="muted text-xs">
                  {[i.courseTitle, i.dueAt ? tr.t('parentComms.homework.due', { day: formatDate(i.dueAt, tr) }) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={cx('badge', i.status === 'missing' ? 'badge-err' : i.status === 'submitted' ? 'badge-ok' : '')}>
                {tr.t(`parentComms.homework.${i.status}`)}
              </span>
              {i.acked ? (
                <span className="flex items-center gap-1 text-sm font-bold text-ok">
                  <Check className="size-4" aria-hidden /> {tr.t('parentComms.homework.seen')}
                </span>
              ) : (
                <Button size="sm" variant="soft" loading={ack.isPending && ack.variables === i.assignmentId} onClick={() => ack.mutate(i.assignmentId)}>
                  {tr.t('parentComms.homework.saw')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BehaviorList({ studentId, title }: { studentId?: string; title?: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['behavior'], queryFn: () => api.parentComms.behavior() });
  const items: BehaviorNoteDto[] = (q.data?.items ?? []).filter((n) => !studentId || n.student.id === studentId);
  if (!items.length) return null;
  return (
    <section className="card space-y-2 p-4" aria-label={title ?? tr.t('parentComms.behavior.mineTitle')}>
      <h2 className="font-black">{title ?? tr.t('parentComms.behavior.mineTitle')}</h2>
      <ul className="divide-y divide-line">
        {items.slice(0, 8).map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-2">
            {n.kind === 'positive' ? (
              <Smile className="mt-0.5 size-5 shrink-0 text-ok" aria-label={tr.t('parentComms.behavior.positive')} />
            ) : (
              <Frown className="mt-0.5 size-5 shrink-0 text-warn" aria-label={tr.t('parentComms.behavior.concern')} />
            )}
            <div className="min-w-0" dir="auto">
              <p>{n.text}</p>
              <p className="muted text-xs">{[n.teacherName, n.courseTitle, relativeTime(n.createdAt, tr)].filter(Boolean).join(' · ')}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** For teachers on an assignment: how many parents said they saw it. */
export function ParentAcks({ assignmentId }: { assignmentId: string }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['assignment-acks', assignmentId], queryFn: () => api.parentComms.homeworkAcks(assignmentId) });
  if (!q.data) return null;
  return <p className="muted text-sm">{tr.t('parentComms.homework.parentsSaw', { acked: q.data.acked, total: q.data.total })}</p>;
}
