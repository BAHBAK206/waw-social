import type { AssignmentDto, Attachment, CourseDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, FileText, Megaphone, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar, UserChip } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, QueryState } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { CourseInsights } from '@/components/family/Insights';
import { ClassAiKnowledge } from '@/components/school/ClassAiKnowledge';
import { RosterImport } from '@/components/school/RosterImport';
import { ClassGradebook, GradingSettings, MyCourseResult } from '@/components/school/Gradebook';
import { CatalogSettings, CourseCertificates, TransferRequests, Vouchers } from '@/components/school/CourseCommerce';
import { UploadButton } from '@/components/ui/Upload';
import { PendingVoice, VoiceNote, VoiceRecordButton } from '@/components/common/Voice';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes, formatDateTime, fromLocalInput, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { confirmDialog, promptDialog, toast, toastError } from '@/lib/ui';
import { ch } from '@/app/channels';
import { useRealtimeChannel } from '@/lib/useRealtime';

const TABS = ['stream', 'assignments', 'people', 'grades', 'attendance', 'materials', 'analytics', 'insights', 'settings'] as const;
type Tab = (typeof TABS)[number];

function Stream({ course, staff }: { course: CourseDto; staff: boolean }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['course', course.id, 'announcements'], queryFn: () => api.school.announcements(course.id) });
  const live = useQuery({ queryKey: [...qk.live, 'course', course.id], queryFn: () => api.live.list({ scopeType: 'course', scopeId: course.id }) });
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ url: string; name: string; mime: string; size: number; kind: 'image' | 'file' | 'audio' | 'video' }[]>([]);
  const [busy, setBusy] = useState(false);
  useRealtimeChannel(
    ch.course(course.id),
    (f) => f.event === 'announcement:new' && void qc.invalidateQueries({ queryKey: ['course', course.id, 'announcements'] }),
  );
  const room = live.data?.items.find((r) => r.status !== 'ended');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {room && (
        <Link to={`/live/${room.id}`} className="card flex items-center gap-3 border-s-4 p-4 hover:shadow-lg" style={{ borderInlineStartColor: 'var(--err)' }}>
          <Video className="size-6 text-err" />
          <span className="min-w-0 flex-1">
            <span className="block font-black">{room.title}</span>
            <span className="muted text-sm">{room.status === 'live' ? tr.t('live.liveNow') : tr.t('live.scheduled')}</span>
          </span>
          <span className="btn btn-primary btn-sm">{tr.t('live.join')}</span>
        </Link>
      )}
      {staff && (
        <section className="card space-y-3 p-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr.t('school.announce')}
            aria-label={tr.t('school.announce')}
            maxLength={5000}
          />
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={i} className="badge">
                  {f.name}
                  <button type="button" className="ms-1" aria-label={tr.t('common.remove')} onClick={() => setFiles(files.filter((_, k) => k !== i))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <UploadButton variant="ghost" size="sm" purpose="course" onUploaded={(r) => setFiles((x) => [...x, r].slice(0, 5))}>
              {tr.t('school.assignment.addFile')}
            </UploadButton>
            <VoiceRecordButton purpose="course" label={tr.t('voice.announceByVoice')} onRecorded={(a) => setFiles((x) => [...x, a].slice(0, 5))} />
            <Button
              size="sm"
              className="ms-auto"
              loading={busy}
              disabled={!text.trim() && !files.length}
              icon={<Megaphone className="size-4" />}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.school.announce(course.id, { text: text.trim(), attachments: files });
                  setText('');
                  setFiles([]);
                  await q.refetch();
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr.t('common.publish')}
            </Button>
          </div>
        </section>
      )}
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Megaphone className="size-7" />} title={tr.t('common.empty')} />}>
        {(d) => (
          <ul className="space-y-3">
            {d.items.map((a) => (
              <li key={a.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <UserChip user={a.author} size="sm" subtitle={relativeTime(a.createdAt, tr)} className="flex-1" />
                  {staff && (
                    <IconButton
                      label={tr.t('common.delete')}
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.school.deleteAnnouncement(course.id, a.id);
                          await q.refetch();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
                {a.text && (
                  <p className="mt-3 whitespace-pre-wrap" dir="auto">
                    {a.text}
                  </p>
                )}
                {a.attachments
                  .filter((f) => f.kind === 'audio')
                  .map((f) => (
                    <VoiceNote key={f.url} a={f} className="mt-3" label={tr.t('voice.teacherVoice')} />
                  ))}
                {a.attachments.some((f) => f.kind !== 'audio') && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {a.attachments
                      .filter((f) => f.kind !== 'audio')
                      .map((f) => (
                        <li key={f.url}>
                          <a className="chip" href={fileUrl(f.url)} target="_blank" rel="noopener noreferrer">
                            <FileText className="size-4" />
                            {f.name} · {formatBytes(f.size)}
                          </a>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function AssignmentForm({ course, onClose }: { course: CourseDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const rubrics = useQuery({ queryKey: ['course', course.id, 'rubrics'], queryFn: () => api.school.rubrics(course.id) });
  const comps = useQuery({ queryKey: ['course', course.id, 'components'], queryFn: () => api.school.components(course.id) });
  const workParts = (comps.data?.items ?? []).filter((c) => c.source === 'assignments' && c.id !== 'coursework');
  const [f, setF] = useState({
    componentId: '',
    title: '',
    description: '',
    dueAt: '',
    points: 100,
    rubricId: '',
    allowLate: true,
    state: 'published' as AssignmentDto['state'],
    topic: '',
  });
  const [voice, setVoice] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={tr.t('school.assignment.new')}
      footer={
        <Button
          loading={busy}
          disabled={!f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api.school.createAssignment(course.id, {
                title: f.title.trim(),
                description: f.description,
                dueAt: fromLocalInput(f.dueAt),
                points: f.points,
                rubricId: f.rubricId || null,
                allowLate: f.allowLate,
                state: f.state,
                topic: f.topic.trim() || null,
                componentId: f.componentId || null,
                attachments: voice ? [voice] : [],
              });
              void qc.invalidateQueries({ queryKey: ['course', course.id, 'assignments'] });
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('school.assignment.title')} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label={tr.t('school.assignment.instructions')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {voice ? (
          <PendingVoice a={voice} onRemove={() => setVoice(null)} />
        ) : (
          <VoiceRecordButton purpose="course" label={tr.t('voice.explainByVoice')} onRecorded={setVoice} />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Input type="datetime-local" label={tr.t('school.assignment.due')} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          <Input
            type="number"
            min={0}
            max={1000}
            label={tr.t('school.assignment.points')}
            value={f.points}
            onChange={(e) => setF({ ...f, points: Number(e.target.value) || 0 })}
          />
          <Select
            label={tr.t('school.assignment.state')}
            value={f.state}
            onChange={(e) => setF({ ...f, state: e.target.value as typeof f.state })}
            options={(['draft', 'published', 'closed'] as const).map((s) => ({ value: s, label: tr.t(`school.assignment.states.${s}`) }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={tr.t('school.assignment.rubric')}
            value={f.rubricId}
            placeholder="—"
            onChange={(e) => setF({ ...f, rubricId: e.target.value })}
            options={(rubrics.data?.items ?? []).map((r) => ({ value: r.id, label: r.title }))}
          />
          <Input label={tr.t('quiz.editor.topic')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
        </div>
        {workParts.length > 0 && (
          <Select
            label={tr.t('gradebook.countsToward')}
            value={f.componentId}
            placeholder={workParts[0]!.name}
            onChange={(e) => setF({ ...f, componentId: e.target.value })}
            options={workParts.map((c) => ({ value: c.id, label: `${c.name} (${c.maxMarks})` }))}
          />
        )}
        <Switch checked={f.allowLate} onChange={(v) => setF({ ...f, allowLate: v })} label={tr.t('school.assignment.allowLate')} />
      </div>
    </Modal>
  );
}

function Assignments({ course, staff }: { course: CourseDto; staff: boolean }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'assignments'], queryFn: () => api.school.assignments(course.id) });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {staff && (
        <div className="flex justify-end">
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {tr.t('school.assignment.new')}
          </Button>
        </div>
      )}
      <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<FileText className="size-7" />} title={tr.t('common.empty')} />}>
        {(d) => (
          <ul className="space-y-2">
            {d.items.map((a) => {
              const s = a.mySubmission;
              const status = s
                ? s.status === 'submitted'
                  ? s.late
                    ? tr.t('school.assignment.late')
                    : tr.t('school.assignment.submitted')
                  : s.status === 'graded'
                    ? tr.t('school.assignment.graded')
                    : tr.t('school.assignment.returned')
                : a.dueAt && a.dueAt < Date.now()
                  ? tr.t('school.assignment.missing')
                  : null;
              return (
                <li key={a.id}>
                  <Link to={`/school/assignments/${a.id}`} className="card flex items-center gap-3 p-3 hover:shadow-md">
                    <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-xl">
                      <FileText className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black" dir="auto">
                        {a.title}
                      </span>
                      <span className="muted text-sm">
                        {a.dueAt ? tr.t('school.assignment.dueAt', { date: formatDateTime(a.dueAt, tr) }) : tr.t('school.assignment.noDue')} ·{' '}
                        {tr.t('common.points', { count: a.points })}
                      </span>
                    </span>
                    {a.state !== 'published' && <span className="badge badge-warn">{tr.t(`school.assignment.states.${a.state}`)}</span>}
                    {staff && a.stats && (
                      <span className="muted text-sm tabular-nums">
                        {tr.t('school.assignment.stats', { submitted: a.stats.submitted, total: a.stats.total })}
                      </span>
                    )}
                    {!staff && status && (
                      <span className={cx('badge', s?.status === 'graded' ? 'badge-ok' : !s ? 'badge-err' : 'badge-primary')}>
                        {status}
                        {s?.grade !== null && s?.grade !== undefined ? ` · ${s.grade}/${a.points}` : ''}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {creating && <AssignmentForm course={course} onClose={() => setCreating(false)} />}
    </div>
  );
}

function People({ course, staff }: { course: CourseDto; staff: boolean }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'members'], queryFn: () => api.school.members(course.id) });
  return (
    <QueryState query={q}>
      {(d) => (
        <div className="mx-auto max-w-3xl space-y-3">
          {staff && (
            <div className="flex justify-end">
              <RosterImport course={course} />
            </div>
          )}
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-card">
            {d.items.map((m) => (
              <li key={m.user.id} className="flex items-center gap-3 p-3">
                <UserChip user={m.user} className="flex-1" subtitle={tr.t(`school.roles.${m.role}`)} />
                {staff && m.role !== 'teacher' && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.school.setMemberRole(course.id, m.user.id, m.role === 'assistant' ? 'student' : 'assistant');
                          await q.refetch();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      {m.role === 'assistant' ? tr.t('school.roles.student') : tr.t('school.roles.assistant')}
                    </Button>
                    <IconButton
                      label={tr.t('common.remove')}
                      size="sm"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: tr.t('common.confirmTitle'), danger: true, confirmLabel: tr.t('common.remove') }))) return;
                        try {
                          await api.school.removeMember(course.id, m.user.id);
                          await q.refetch();
                        } catch (e) {
                          toastError(e);
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-err" />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </QueryState>
  );
}

function Grades({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'grades'], queryFn: () => api.school.grades(course.id) });
  return (
    <QueryState query={q} isEmpty={(d) => !d.rows.length} empty={<EmptyState title={tr.t('common.empty')} />}>
      {(d) => (
        <div className="card scroll-thin overflow-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-bg-2">
              <tr>
                <th className="sticky start-0 bg-bg-2 p-3 text-start">{tr.t('school.roles.student')}</th>
                {d.assignments.map((a) => (
                  <th key={a.id} className="p-3 text-start">
                    <Link to={`/school/assignments/${a.id}`} className="link">
                      {a.title}
                    </Link>
                    <span className="muted block text-xs">/{a.points}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.student.id} className="border-t border-line">
                  <td className="sticky start-0 bg-card p-3 font-bold">{r.student.displayName}</td>
                  {d.assignments.map((a) => {
                    const g = r.grades[a.id];
                    return (
                      <td key={a.id} className={cx('p-3 tabular-nums', !g && 'text-err')}>
                        {g ? (g.grade !== null ? g.grade : tr.t('school.assignment.submitted')) : '—'}
                        {g?.late && <span className="badge badge-warn ms-1">{tr.t('school.assignment.late')}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QueryState>
  );
}

function Attendance({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['course', course.id, 'attendance'], queryFn: () => api.school.attendance(course.id) });
  const members = useQuery({ queryKey: ['course', course.id, 'members'], queryFn: () => api.school.members(course.id) });
  const [open, setOpen] = useState<string | null>(null);
  const students = members.data?.items.filter((m) => m.role === 'student') ?? [];
  const current = sessions.data?.items.find((s) => s.id === open);
  const [draft, setDraft] = useState<Record<string, 'present' | 'absent' | 'late' | 'excused'>>({});
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="card p-3">
        <Button
          block
          variant="soft"
          icon={<Plus className="size-4" />}
          onClick={async () => {
            const title = await promptDialog({ title: tr.t('school.attendance.new'), input: { label: tr.t('common.title') } });
            if (!title) return;
            try {
              const s = await api.school.createAttendance(course.id, { title, day: new Date().toISOString().slice(0, 10) });
              await qc.invalidateQueries({ queryKey: ['course', course.id, 'attendance'] });
              setOpen(s.id);
              setDraft({});
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('school.attendance.new')}
        </Button>
        <ul className="mt-3 space-y-1">
          {sessions.data?.items.map((s) => (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                className={cx('min-h-11 flex-1 rounded-lg px-3 text-start', open === s.id ? 'bg-soft text-ink' : 'hover:bg-bg-3')}
                onClick={() => {
                  setOpen(s.id);
                  setDraft(s.records);
                }}
              >
                <span className="block truncate font-bold">{s.title}</span>
                <span className="muted text-xs">{s.day}</span>
              </button>
              <IconButton
                label={tr.t('common.delete')}
                size="sm"
                onClick={async () => {
                  try {
                    await api.school.deleteAttendance(s.id);
                    if (open === s.id) setOpen(null);
                    await qc.invalidateQueries({ queryKey: ['course', course.id, 'attendance'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </aside>
      <section className="card p-4">
        {!current ? (
          <p className="muted">{tr.t('school.attendance.new')}</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {students.map((m) => (
                <li key={m.user.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Avatar name={m.user.displayName} url={m.user.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold">{m.user.displayName}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={m.user.displayName}>
                    {(['present', 'late', 'excused', 'absent'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        role="radio"
                        aria-checked={draft[m.user.id] === st}
                        className={cx('chip !min-h-8 !px-2.5 text-xs', draft[m.user.id] === st && 'is-active')}
                        onClick={() => setDraft({ ...draft, [m.user.id]: st })}
                      >
                        {tr.t(`school.attendance.statuses.${st}`)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button variant="soft" onClick={() => setDraft(Object.fromEntries(students.map((m) => [m.user.id, 'present'])))}>
                {tr.t('school.attendance.statuses.present')} ✓
              </Button>
              <Button
                className="ms-auto"
                onClick={async () => {
                  try {
                    await api.school.markAttendance(
                      current.id,
                      Object.entries(draft).map(([studentId, status]) => ({ studentId, status })),
                    );
                    toast(tr.t('common.saved'));
                    await qc.invalidateQueries({ queryKey: ['course', course.id, 'attendance'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {tr.t('common.save')}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Materials({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const mats = useQuery({ queryKey: ['course', course.id, 'materials'], queryFn: () => api.school.materials(course.id) });
  const keys = useQuery({ queryKey: ['course', course.id, 'essay-keys'], queryFn: () => api.school.essayKeys(course.id) });
  const syns = useQuery({ queryKey: ['course', course.id, 'synonyms'], queryFn: () => api.school.synonyms(course.id) });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', text: '', topic: '', visible: true, fileUrl: '' });
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['course', course.id, 'materials'] });
  };
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-black">{tr.t('school.tabs.materials')}</h2>
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            {tr.t('school.materials.add')}
          </Button>
        </div>
        <QueryState query={mats} isEmpty={(d) => !d.items.length} empty={<EmptyState title={tr.t('common.empty')} />}>
          {(d) => (
            <ul className="space-y-2">
              {d.items.map((m) => (
                <li key={m.id} className="card flex items-center gap-3 p-3">
                  <FileText className="size-5 text-ink" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold" dir="auto">
                      {m.title}
                    </p>
                    <p className="muted text-xs">
                      {tr.t('school.materials.chunks', { count: m.chunkCount })}
                      {!m.visibleToStudents && ` · ${tr.t('common.private')}`}
                      {m.topic ? ` · ${m.topic}` : ''}
                    </p>
                  </div>
                  {m.fileUrl && (
                    <a className="btn btn-ghost btn-sm" href={fileUrl(m.fileUrl)} target="_blank" rel="noopener noreferrer">
                      {tr.t('common.open')}
                    </a>
                  )}
                  <IconButton
                    label={tr.t('common.delete')}
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.school.deleteMaterial(m.id);
                        refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-err" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-black">{tr.t('school.materials.essayKeys')}</h2>
          <Button
            variant="outline"
            icon={<Plus className="size-4" />}
            onClick={async () => {
              const prompt = await promptDialog({ title: tr.t('school.materials.essayKeys'), input: { label: tr.t('school.materials.keyPrompt') } });
              if (!prompt) return;
              const pts = await promptDialog({ title: tr.t('ai.keyPoints'), input: { label: tr.t('ai.keyPoints'), placeholder: 'a; b; c' } });
              if (!pts) return;
              try {
                await api.school.addEssayKey(course.id, {
                  prompt,
                  keyPoints: pts
                    .split(/[;\n]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                await qc.invalidateQueries({ queryKey: ['course', course.id, 'essay-keys'] });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('common.add')}
          </Button>
        </div>
        <ul className="space-y-2">
          {keys.data?.items.map((k) => (
            <li key={k.id} className="card flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {k.prompt}
              </span>
              <span className="badge">{k.keyPointCount}</span>
              <IconButton
                label={tr.t('common.delete')}
                size="sm"
                onClick={async () => {
                  try {
                    await api.school.deleteEssayKey(k.id);
                    await qc.invalidateQueries({ queryKey: ['course', course.id, 'essay-keys'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-black">{tr.t('school.materials.synonyms')}</h2>
          <Button
            variant="outline"
            icon={<Plus className="size-4" />}
            onClick={async () => {
              const term = await promptDialog({ title: tr.t('school.materials.synonyms'), input: { label: tr.t('school.materials.term') } });
              if (!term) return;
              const list = await promptDialog({ title: tr.t('school.materials.synonyms'), input: { label: tr.t('school.materials.synonymsLabel') } });
              if (!list) return;
              try {
                await api.school.addSynonym(course.id, {
                  term,
                  synonyms: list
                    .split(/[,،]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                await qc.invalidateQueries({ queryKey: ['course', course.id, 'synonyms'] });
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('common.add')}
          </Button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {syns.data?.items.map((s) => (
            <li key={s.id} className="chip">
              {s.term} → {s.synonyms.join(', ')}
              <button
                type="button"
                aria-label={tr.t('common.delete')}
                className="ms-1"
                onClick={async () => {
                  try {
                    await api.school.deleteSynonym(s.id);
                    await qc.invalidateQueries({ queryKey: ['course', course.id, 'synonyms'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
      <ClassAiKnowledge course={course} />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="lg"
        title={tr.t('school.materials.add')}
        footer={
          <Button
            loading={busy}
            disabled={!f.title.trim() || (!f.text.trim() && !f.fileUrl)}
            onClick={async () => {
              setBusy(true);
              try {
                await api.school.addMaterial(course.id, {
                  title: f.title.trim(),
                  text: f.text,
                  topic: f.topic.trim() || null,
                  fileUrl: f.fileUrl || null,
                  visibleToStudents: f.visible,
                });
                refresh();
                setAdding(false);
                setF({ title: '', text: '', topic: '', visible: true, fileUrl: '' });
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.save')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input label={tr.t('common.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea label={tr.t('school.materials.text')} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} className="min-h-40" />
          <div className="flex items-center gap-3">
            <UploadButton variant="outline" purpose="course" onUploaded={(r) => setF({ ...f, fileUrl: r.url, title: f.title || r.name })}>
              {tr.t('school.materials.file')}
            </UploadButton>
            {f.fileUrl && <span className="badge badge-ok">✓</span>}
          </div>
          <Input label={tr.t('quiz.editor.topic')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
          <Switch checked={f.visible} onChange={(v) => setF({ ...f, visible: v })} label={tr.t('school.materials.visible')} />
        </div>
      </Modal>
    </div>
  );
}

function Analytics({ course }: { course: CourseDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['course', course.id, 'analytics'], queryFn: () => api.school.analytics(course.id) });
  return (
    <QueryState query={q}>
      {(a) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              [tr.t('school.analytics.students'), a.students],
              [tr.t('school.analytics.assignments'), a.assignments],
              [tr.t('school.analytics.submissionRate'), `${Math.round(a.submissionRate)}%`],
              [tr.t('school.analytics.averageGrade'), a.averageGrade === null ? '—' : Math.round(a.averageGrade)],
              [tr.t('school.analytics.attendanceRate'), a.attendanceRate === null ? '—' : `${Math.round(a.attendanceRate)}%`],
            ].map(([l, v]) => (
              <div key={String(l)} className="card p-4">
                <p className="muted text-sm">{l}</p>
                <p className="text-3xl font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {a.topicMastery.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-black">{tr.t('school.analytics.weakTopics')}</h2>
              <ul className="space-y-3">
                {a.topicMastery.map((t) => (
                  <li key={t.topic}>
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
          <section className="card overflow-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-bg-2">
                <tr>
                  <th className="p-3 text-start">{tr.t('school.analytics.perStudent')}</th>
                  <th className="p-3 text-start">{tr.t('school.assignment.submitted')}</th>
                  <th className="p-3 text-start">{tr.t('school.analytics.averageGrade')}</th>
                  <th className="p-3 text-start">{tr.t('school.analytics.attendanceRate')}</th>
                </tr>
              </thead>
              <tbody>
                {a.perStudent.map((s) => (
                  <tr key={s.student.id} className="border-t border-line">
                    <td className="p-3 font-bold">{s.student.displayName}</td>
                    <td className="p-3 tabular-nums">{s.submitted}</td>
                    <td className="p-3 tabular-nums">{s.averageGrade === null ? '—' : Math.round(s.averageGrade)}</td>
                    <td className="p-3 tabular-nums">{s.attendance === null ? '—' : `${Math.round(s.attendance)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </QueryState>
  );
}

function Settings({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [subject, setSubject] = useState(course.subject ?? '');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.course(course.id) });
    void qc.invalidateQueries({ queryKey: qk.courses });
  };
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="card space-y-4 p-4">
        <Input label={tr.t('common.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label={tr.t('academic.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label={tr.t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              await api.school.update(course.id, { title: title.trim(), description, subject: subject.trim() || null });
              refresh();
              toast(tr.t('common.saved'));
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      </section>
      <GradingSettings course={course} />
      <CatalogSettings course={course} />
      <TransferRequests course={course} />
      <Vouchers course={course} />
      <CourseCertificates course={course} />
      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="muted text-sm">{tr.t('school.code')}</p>
          <p className="font-mono text-3xl font-black tracking-widest" dir="ltr">
            {course.joinCode}
          </p>
        </div>
        <Button
          variant="outline"
          icon={<Copy className="size-4" />}
          onClick={() => void navigator.clipboard.writeText(course.joinCode ?? '').then(() => toast(tr.t('common.copied')))}
        >
          {tr.t('school.copyCode')}
        </Button>
        <Button
          variant="outline"
          icon={<RefreshCw className="size-4" />}
          onClick={async () => {
            try {
              await api.school.update(course.id, { regenerateCode: true });
              refresh();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('school.regenerate')}
        </Button>
      </section>
      <section className="card space-y-2 p-4">
        <Switch
          checked={course.archived}
          onChange={async (v) => {
            try {
              await api.school.update(course.id, { archived: v });
              refresh();
            } catch (e) {
              toastError(e);
            }
          }}
          label={tr.t('school.archived')}
        />
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (!(await confirmDialog({ title: tr.t('school.deleteCourse'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
            try {
              await api.school.remove(course.id);
              void qc.invalidateQueries({ queryKey: qk.courses });
              navigate('/school', { replace: true });
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('school.deleteCourse')}
        </Button>
      </section>
    </div>
  );
}

export default function CoursePage() {
  const { courseId = '' } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.course(courseId), queryFn: () => api.school.get(courseId) });
  const [tab, setTab] = useTabParam(TABS, 'stream');
  const [liveOpen, setLiveOpen] = useState(false);
  return (
    <div className="page">
      <QueryState query={q}>
        {(course) => {
          const staff = course.myRole === 'teacher' || course.myRole === 'assistant';
          const teacher = course.myRole === 'teacher';
          const color = course.color ?? '#6c5ce7';
          const visible: Tab[] = TABS.filter((t) => (t === 'attendance' || t === 'analytics' || t === 'insights' ? staff : t === 'settings' ? teacher : true));
          return (
            <>
              <Link to="/school" className="link mb-3 inline-flex items-center gap-1">
                <ArrowLeft className="size-4 flip-rtl" /> {tr.t('school.title')}
              </Link>
              <header
                className="relative mb-5 overflow-hidden rounded-[var(--radius-card)] p-6 text-white"
                style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}
              >
                {course.coverUrl && <img src={fileUrl(course.coverUrl)} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
                <div className="relative flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-3xl font-black" dir="auto">
                      {course.title}
                    </h1>
                    <p className="opacity-90">{[course.grading.subjectCode, course.subject, course.owner.displayName].filter(Boolean).join(' · ')}</p>
                  </div>
                  {staff && (
                    <Button
                      variant="outline"
                      className="border-white/50 !bg-white/15 !text-white"
                      icon={<Video className="size-4" />}
                      onClick={() => setLiveOpen(true)}
                    >
                      {tr.t('live.create')}
                    </Button>
                  )}
                </div>
              </header>
              <Tabs className="mb-5" active={tab} onChange={setTab} tabs={visible.map((k) => ({ key: k, label: tr.t(`school.tabs.${k}`) }))} />
              {tab === 'stream' && <Stream course={course} staff={staff} />}
              {tab === 'assignments' && <Assignments course={course} staff={staff} />}
              {tab === 'people' && <People course={course} staff={staff} />}
              {tab === 'grades' &&
                (staff ? (
                  <div className="space-y-4">
                    <ClassGradebook course={course} />
                    <details className="card p-3">
                      <summary className="cursor-pointer font-bold">{tr.t('gradebook.assignmentsDetail')}</summary>
                      <div className="mt-3">
                        <Grades course={course} />
                      </div>
                    </details>
                  </div>
                ) : (
                  <MyCourseResult course={course} />
                ))}
              {tab === 'attendance' && staff && <Attendance course={course} />}
              {tab === 'materials' && (staff ? <Materials course={course} /> : <MaterialsReadOnly course={course} />)}
              {tab === 'analytics' && staff && <Analytics course={course} />}
              {tab === 'insights' && staff && <CourseInsights courseId={course.id} />}
              {tab === 'settings' && teacher && <Settings course={course} />}
              <Modal
                open={liveOpen}
                onClose={() => setLiveOpen(false)}
                size="sm"
                title={tr.t('live.create')}
                footer={
                  <Button
                    onClick={async () => {
                      const title = await promptDialog({ title: tr.t('live.create'), input: { label: tr.t('common.title'), defaultValue: course.title } });
                      if (!title) return;
                      try {
                        const room = await api.live.create({ title, scopeType: 'course', scopeId: course.id });
                        void qc.invalidateQueries({ queryKey: qk.live });
                        navigate(`/live/${room.id}`);
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    {tr.t('live.start')}
                  </Button>
                }
              >
                <p className="muted">{tr.t('live.subtitle')}</p>
              </Modal>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

function MaterialsReadOnly({ course }: { course: CourseDto }) {
  const tr = useT();
  const mats = useQuery({ queryKey: ['course', course.id, 'materials'], queryFn: () => api.school.materials(course.id) });
  return (
    <QueryState query={mats} isEmpty={(d) => !d.items.length} empty={<EmptyState title={tr.t('common.empty')} />}>
      {(d) => (
        <ul className="mx-auto max-w-3xl space-y-2">
          {d.items.map((m) => (
            <li key={m.id} className="card flex items-center gap-3 p-3">
              <FileText className="size-5 text-ink" />
              <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                {m.title}
              </span>
              {m.fileUrl && (
                <a className="btn btn-soft btn-sm" href={fileUrl(m.fileUrl)} target="_blank" rel="noopener noreferrer">
                  {tr.t('common.open')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
