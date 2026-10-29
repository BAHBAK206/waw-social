import { COMPLAINT_CATEGORIES, MOODS, type ComplaintCategory, type ComplaintStatusDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const MOOD_KEYS = ['wellbeing.mood.l1', 'wellbeing.mood.l2', 'wellbeing.mood.l3', 'wellbeing.mood.l4', 'wellbeing.mood.l5'] as const;
const FACES = ['😞', '🙁', '😐', '🙂', '😄'] as const;

function MoodCard() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mood'], queryFn: () => api.wellbeing.mood() });
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.wellbeing.saveMood(pick!, note.trim() || undefined),
    onSuccess: () => {
      toast(tr.t('wellbeing.mood.saved'));
      setNote('');
      void qc.invalidateQueries({ queryKey: ['mood'] });
    },
    onError: toastError,
  });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('wellbeing.mood.title')}</h2>
      <p className="muted text-sm">{tr.t('wellbeing.mood.hint')}</p>
      <QueryState query={q}>
        {(d) => {
          const current = pick ?? d.today;
          return (
            <>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr.t('wellbeing.mood.title')}>
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={current === m}
                    className={cx('chip !min-w-14 flex-col !py-2', current === m && 'is-active')}
                    onClick={() => setPick(m)}
                  >
                    <span className="text-2xl" aria-hidden>
                      {FACES[m - 1]}
                    </span>
                    <span className="text-xs">{tr.t(MOOD_KEYS[m - 1]!)}</span>
                  </button>
                ))}
              </div>
              <Input label={tr.t('wellbeing.mood.note')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              <Button disabled={pick === null || save.isPending} onClick={() => save.mutate()}>
                {tr.t('wellbeing.mood.save')}
              </Button>
              {d.today !== null && <p className="text-sm font-bold">{tr.t('wellbeing.mood.today', { mood: tr.t(MOOD_KEYS[d.today - 1]!) })}</p>}
              {!!d.recent.length && (
                <div>
                  <p className="muted mb-1 text-xs">{tr.t('wellbeing.mood.history')}</p>
                  <ul className="flex flex-wrap gap-1" aria-label={tr.t('wellbeing.mood.history')}>
                    {d.recent.map((r) => (
                      <li key={r.day} title={`${r.day}: ${tr.t(MOOD_KEYS[r.mood - 1]!)}`} className="text-xl">
                        {FACES[r.mood - 1]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="muted text-xs">{tr.t('wellbeing.mood.privacy')}</p>
            </>
          );
        }}
      </QueryState>
    </section>
  );
}

function SpeakCard() {
  const tr = useT();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() });
  const [schoolId, setSchoolId] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('bullying');
  const [text, setText] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (sid: string) => api.wellbeing.sendComplaint({ schoolId: sid, category, text: text.trim() }),
    onSuccess: (r) => {
      setCode(r.code);
      setText('');
      toast(tr.t('wellbeing.speak.sent'));
    },
    onError: toastError,
  });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('wellbeing.speak.title')}</h2>
      <p className="muted text-sm">{tr.t('wellbeing.speak.hint')}</p>
      <QueryState query={schools}>
        {(d) => {
          const mine = d.items.filter((s) => !!s.myRole);
          if (!mine.length) return <p className="muted text-sm">{tr.t('wellbeing.speak.noSchool')}</p>;
          const sid = schoolId || mine[0]!.id;
          return (
            <>
              {code && (
                <div className="rounded-lg border-2 border-primary p-3 text-center" role="status">
                  <p className="font-bold">{tr.t('wellbeing.speak.codeTitle')}</p>
                  <p className="my-1 select-all font-mono text-2xl font-black tracking-widest" data-testid="secret-code">
                    {code}
                  </p>
                  <p className="muted text-xs">{tr.t('wellbeing.speak.codeHint')}</p>
                </div>
              )}
              {mine.length > 1 && (
                <Select
                  label={tr.t('wellbeing.speak.school')}
                  value={sid}
                  onChange={(e) => setSchoolId(e.target.value)}
                  options={mine.map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
              <Select
                label={tr.t('wellbeing.speak.category')}
                value={category}
                onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                options={COMPLAINT_CATEGORIES.map((c) => ({ value: c, label: tr.t(`wellbeing.speak.${c}`) }))}
              />
              <Textarea label={tr.t('wellbeing.speak.text')} rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
              <Button disabled={text.trim().length < 5 || send.isPending} onClick={() => send.mutate(sid)}>
                {tr.t('wellbeing.speak.send')}
              </Button>
            </>
          );
        }}
      </QueryState>
    </section>
  );
}

function TrackCard() {
  const tr = useT();
  const [code, setCode] = useState('');
  const [res, setRes] = useState<ComplaintStatusDto | null>(null);
  const check = useMutation({ mutationFn: () => api.wellbeing.complaintStatus(code.trim()), onSuccess: setRes, onError: toastError });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('wellbeing.track.title')}</h2>
      <Input label={tr.t('wellbeing.track.code')} value={code} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
      <Button variant="soft" disabled={code.trim().length < 6 || check.isPending} onClick={() => check.mutate()}>
        {tr.t('wellbeing.track.check')}
      </Button>
      {res && (
        <div role="status" className="space-y-1 text-sm">
          <p className="font-bold">
            {tr.t(`wellbeing.track.${res.status}`)} · <span className="muted font-normal">{formatDate(res.createdAt, tr)}</span>
          </p>
          <p dir="auto">{res.reply ? `${tr.t('wellbeing.track.reply')} ${res.reply}` : tr.t('wellbeing.track.noReply')}</p>
        </div>
      )}
    </section>
  );
}

export default function WellbeingPage() {
  const tr = useT();
  return (
    <div className="page mx-auto max-w-2xl space-y-5">
      <PageHeader title={tr.t('wellbeing.title')} subtitle={tr.t('wellbeing.subtitle')} icon={<HeartPulse className="size-6" />} />
      <MoodCard />
      <SpeakCard />
      <TrackCard />
      <aside className="card flex gap-3 border-warn/50 p-4" aria-label={tr.t('wellbeing.help.title')}>
        <LifeBuoy className="size-6 shrink-0 text-warn" aria-hidden />
        <div>
          <p className="font-black">{tr.t('wellbeing.help.title')}</p>
          <p className="text-sm">{tr.t('wellbeing.help.text')}</p>
        </div>
      </aside>
    </div>
  );
}
