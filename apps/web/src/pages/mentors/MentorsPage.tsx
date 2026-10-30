import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandHelping } from 'lucide-react';
import { useEffect, useState } from 'react';
import { UserChip } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

function Offer() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mentor-me'], queryFn: () => api.collab.myMentor() });
  const [text, setText] = useState('');
  useEffect(() => {
    if (q.data) setText(q.data.subjects.join(', '));
  }, [q.data]);
  const save = useMutation({
    mutationFn: (subjects: string[]) => api.collab.setMentor(subjects),
    onSuccess: (r) => {
      qc.setQueryData(['mentor-me'], r);
      void qc.invalidateQueries({ queryKey: ['mentors'] });
      toast(tr.t('collab.offerSaved'));
    },
    onError: toastError,
  });
  if (!q.data) return null;
  if (!q.data.eligible) return <p className="muted text-sm">{tr.t('collab.offerNotEligible')}</p>;
  const subjects = text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('collab.offerTitle')}</h2>
      <p className="muted text-sm">{tr.t('collab.offerHint')}</p>
      <Input aria-label={tr.t('collab.offerTitle')} value={text} onChange={(e) => setText(e.target.value)} dir="auto" />
      <div className="flex gap-2">
        <Button loading={save.isPending} disabled={!subjects.length} onClick={() => save.mutate(subjects)}>
          {tr.t('collab.offerSave')}
        </Button>
        {!!q.data.subjects.length && (
          <Button variant="ghost" onClick={() => save.mutate([])}>
            {tr.t('collab.offerOff')}
          </Button>
        )}
      </div>
    </section>
  );
}

export default function MentorsPage() {
  const tr = useT();
  const [subject, setSubject] = useState('');
  const q = useQuery({ queryKey: ['mentors', subject], queryFn: () => api.collab.mentors(subject.trim() || undefined) });
  return (
    <div className="page">
      <PageHeader
        title={tr.t('collab.mentorsTitle')}
        subtitle={tr.t('collab.mentorsSubtitle')}
        icon={<HandHelping className="size-6" />}
        actions={<ButtonLink to="/feed?scope=questions">{tr.t('collab.askQuestion')}</ButtonLink>}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <Input
            aria-label={tr.t('collab.mentorSubject')}
            placeholder={tr.t('collab.mentorSubject')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            dir="auto"
          />
          <QueryState query={q}>
            {(d) =>
              !d.items.length ? (
                <EmptyState icon={<HandHelping className="size-7" />} title={tr.t('collab.mentorEmpty')} />
              ) : (
                <ul className="space-y-2">
                  {d.items.map((m) => (
                    <li key={m.user.id} className="card flex flex-wrap items-center gap-3 p-3">
                      <UserChip user={m.user} className="min-w-0 flex-1" />
                      <div className="flex flex-wrap gap-1.5">
                        {m.subjects.map((s) => (
                          <button key={s} type="button" className="badge badge-primary" onClick={() => setSubject(s)}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <span className="muted text-xs">{tr.t('collab.mentorHelped', { count: m.helped })}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </div>
        <Offer />
      </div>
    </div>
  );
}
