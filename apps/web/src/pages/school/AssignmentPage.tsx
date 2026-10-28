import type { AssignmentDto, RubricDto, SubmissionDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FileText, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { UserChip } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { NoticeCard } from '@/components/layout/Banners';
import { EmptyState, QueryState } from '@/components/ui/States';
import { UploadButton } from '@/components/ui/Upload';
import { PendingVoice, VoiceNote, VoiceRecordButton } from '@/components/common/Voice';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

type Att = SubmissionDto['attachments'][number];

function Files({ files }: { files: Att[] }) {
  const tr = useT();
  if (!files.length) return null;
  const voice = files.filter((f) => f.kind === 'audio');
  const other = files.filter((f) => f.kind !== 'audio');
  return (
    <>
      {voice.map((f) => (
        <VoiceNote key={f.url} a={f} className="mt-2" label={tr.t('voice.teacherVoice')} />
      ))}
      {other.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {other.map((f) => (
            <li key={f.url}>
              <a className="chip" href={fileUrl(f.url)} target="_blank" rel="noopener noreferrer">
                <Paperclip className="size-4" />
                {f.name} · {formatBytes(f.size)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StudentPanel({ a, onChanged }: { a: AssignmentDto; onChanged: () => void }) {
  const tr = useT();
  const sub = a.mySubmission;
  const [text, setText] = useState(sub?.text ?? '');
  const [files, setFiles] = useState<Att[]>(sub?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const closed = a.state === 'closed' || (!!a.dueAt && a.dueAt < Date.now() && !a.allowLate);
  const locked = !!sub && sub.status !== 'submitted' ? true : false;
  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-black">{tr.t('school.assignment.yourWork')}</h2>
        {sub && <span className={cx('badge', sub.status === 'graded' ? 'badge-ok' : 'badge-primary')}>{tr.t(`school.assignment.${sub.status}`)}</span>}
        {sub?.late && <span className="badge badge-warn">{tr.t('school.assignment.late')}</span>}
      </div>
      {sub && sub.grade !== null && (
        <div className="rounded-[var(--radius-control)] bg-soft p-4">
          <p className="text-3xl font-black tabular-nums">
            {sub.grade}
            <span className="muted text-lg">/{a.points}</span>
          </p>
          {sub.feedback && (
            <p className="mt-2 whitespace-pre-wrap" dir="auto">
              {sub.feedback}
            </p>
          )}
          {sub.feedbackAudio && <VoiceNote a={sub.feedbackAudio} className="mt-2" label={tr.t('voice.feedback')} />}
        </div>
      )}
      {closed && !sub && <NoticeCard tone="warn">{tr.t('errors.deadline_passed')}</NoticeCard>}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={locked || closed}
        aria-label={tr.t('school.assignment.yourWork')}
        className="min-h-32"
      />
      <Files files={files} />
      {!locked && !closed && (
        <div className="flex flex-wrap gap-2">
          <UploadButton variant="outline" size="sm" purpose="assignment" onUploaded={(r) => setFiles((x) => [...x, r].slice(0, 10))}>
            {tr.t('school.assignment.addFile')}
          </UploadButton>
          <Button
            size="sm"
            loading={busy}
            disabled={!text.trim() && !files.length}
            icon={<Check className="size-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                await api.school.submit(a.id, { text, attachments: files });
                toast(tr.t('school.assignment.submitted'));
                onChanged();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {sub ? tr.t('common.save') : tr.t('school.assignment.turnIn')}
          </Button>
          {sub && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await api.school.unsubmit(a.id);
                  onChanged();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('school.assignment.unsubmit')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function GradeForm({ s, a, rubric, onSaved }: { s: SubmissionDto; a: AssignmentDto; rubric?: RubricDto; onSaved: () => void }) {
  const tr = useT();
  const [grade, setGrade] = useState(s.grade ?? 0);
  const [feedback, setFeedback] = useState(s.feedback);
  const [voice, setVoice] = useState<Att | null>(s.feedbackAudio);
  const [scores, setScores] = useState<Record<string, number>>(s.rubricScores ?? {});
  const [busy, setBusy] = useState(false);
  const rubricTotal = rubric ? rubric.criteria.reduce((sum, c, i) => sum + (scores[String(i)] ?? 0), 0) : null;
  const rubricMax = rubric ? rubric.criteria.reduce((sum, c) => sum + Math.max(0, ...c.levels.map((l) => l.points)), 0) : 0;
  const save = async (returned: boolean) => {
    setBusy(true);
    try {
      await api.school.grade(s.id, {
        grade: rubric && rubricTotal !== null && rubricMax ? Math.round((rubricTotal / rubricMax) * a.points * 100) / 100 : grade,
        feedback,
        feedbackAudio: voice,
        rubricScores: rubric ? scores : undefined,
        returned,
      });
      toast(tr.t('common.saved'));
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {rubric ? (
        <div className="space-y-3">
          {rubric.criteria.map((c, i) => (
            <fieldset key={i}>
              <legend className="font-bold" dir="auto">
                {c.title}
              </legend>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup">
                {c.levels.map((l) => (
                  <button
                    key={l.label}
                    type="button"
                    role="radio"
                    aria-checked={scores[String(i)] === l.points}
                    className={cx('chip', scores[String(i)] === l.points && 'is-active')}
                    onClick={() => setScores({ ...scores, [String(i)]: l.points })}
                  >
                    {l.label} · {l.points}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="font-black tabular-nums">
            {rubricTotal}/{rubricMax}
          </p>
        </div>
      ) : (
        <Input
          type="number"
          min={0}
          max={a.points}
          step="0.5"
          label={`${tr.t('school.assignment.gradeLabel')} (/${a.points})`}
          value={grade}
          onChange={(e) => setGrade(Math.max(0, Math.min(a.points, Number(e.target.value))))}
          wrapperClassName="max-w-40"
        />
      )}
      <Textarea label={tr.t('school.assignment.feedback')} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      {voice ? (
        <PendingVoice a={voice} onRemove={() => setVoice(null)} />
      ) : (
        <VoiceRecordButton purpose="assignment" label={tr.t('voice.feedbackByVoice')} onRecorded={setVoice} />
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" loading={busy} onClick={() => void save(false)}>
          {tr.t('common.save')}
        </Button>
        <Button size="sm" loading={busy} onClick={() => void save(true)}>
          {tr.t('school.assignment.return')}
        </Button>
      </div>
    </div>
  );
}

function Submissions({ a }: { a: AssignmentDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['assignment', a.id, 'submissions'], queryFn: () => api.school.submissions(a.id) });
  const rubrics = useQuery({ queryKey: ['course', a.courseId, 'rubrics'], queryFn: () => api.school.rubrics(a.courseId), enabled: !!a.rubricId });
  const rubric = rubrics.data?.items.find((r) => r.id === a.rubricId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <h2 className="mb-3 font-black">
        {tr.t('school.assignment.submissions')}{' '}
        {a.stats && <span className="muted font-normal">· {tr.t('school.assignment.stats', { submitted: a.stats.submitted, total: a.stats.total })}</span>}
      </h2>
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title={tr.t('common.empty')} />}>
        {(d) => (
          <ul className="space-y-3">
            {d.items.map((s) => (
              <li key={s.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <UserChip user={s.student} className="flex-1" subtitle={relativeTime(s.submittedAt, tr)} />
                  <span className={cx('badge', s.status === 'graded' ? 'badge-ok' : s.late ? 'badge-warn' : 'badge-primary')}>
                    {s.grade !== null ? `${s.grade}/${a.points}` : tr.t(`school.assignment.${s.status}`)}
                  </span>
                  <Button size="sm" variant="soft" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    {open === s.id ? tr.t('common.close') : tr.t('school.assignment.gradeLabel')}
                  </Button>
                </div>
                {s.text && (
                  <p className="mt-3 whitespace-pre-wrap" dir="auto">
                    {s.text}
                  </p>
                )}
                <Files files={s.attachments} />
                {open === s.id && (
                  <GradeForm
                    s={s}
                    a={a}
                    rubric={rubric}
                    onSaved={() => {
                      void q.refetch();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  );
}

export default function AssignmentPage() {
  const { assignmentId = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assignment', assignmentId], queryFn: () => api.school.assignment(assignmentId) });
  return (
    <div className="page-narrow space-y-5">
      <QueryState query={q}>
        {(a) => {
          const staff = !!a.stats;
          return (
            <>
              <Link to={`/school/${a.courseId}?tab=assignments`} className="link inline-flex items-center gap-1">
                <ArrowLeft className="size-4 flip-rtl" /> {tr.t('school.tabs.assignments')}
              </Link>
              <header className="card p-5">
                <div className="flex items-start gap-3">
                  <span className="surface-gradient grid size-12 shrink-0 place-items-center rounded-2xl">
                    <FileText className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-black" dir="auto">
                      {a.title}
                    </h1>
                    <p className="muted text-sm">
                      {a.dueAt ? tr.t('school.assignment.dueAt', { date: formatDateTime(a.dueAt, tr) }) : tr.t('school.assignment.noDue')} ·{' '}
                      {tr.t('common.points', { count: a.points })}
                    </p>
                  </div>
                </div>
                {a.description && (
                  <p className="mt-4 whitespace-pre-wrap" dir="auto">
                    {a.description}
                  </p>
                )}
                <Files files={a.attachments} />
              </header>
              {staff ? (
                <Submissions a={a} />
              ) : (
                <StudentPanel
                  a={a}
                  onChanged={() => {
                    void qc.invalidateQueries({ queryKey: ['assignment', assignmentId] });
                  }}
                />
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
