import { CHILD_KIND, type CurriculumKind, type CurriculumNodeDto, type CurriculumResourceDto, type ObjectiveStatus } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Compass, FileText, ListChecks, Pencil, Play, Plus, Target, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confirmDialog, toastError } from '@/lib/ui';

const STATUS_TONE: Record<ObjectiveStatus, string> = { mastered: 'badge-ok', learning: 'badge-primary', weak: 'badge-err', new: '' };

function ResourceLink({ r }: { r: CurriculumResourceDto }) {
  const tr = useT();
  const Icon = r.type === 'quiz' ? ListChecks : r.type === 'video' ? Video : FileText;
  const to = r.type === 'quiz' ? `/quiz?q=${encodeURIComponent(r.title)}` : r.type === 'video' ? `/watch/${r.id}` : `/library?q=${encodeURIComponent(r.title)}`;
  return (
    <Link to={to} className="chip inline-flex items-center gap-1.5 text-xs" title={tr.t(`curriculum.resourceTypes.${r.type}`)}>
      <Icon className="size-3.5" aria-hidden /> <span dir="auto">{r.title}</span>
    </Link>
  );
}

/** One subject: the student's plan, then units → lessons → objectives with mastery and practice. */
export default function SubjectPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const student = me?.accountType === 'student';
  const tree = useQuery({ queryKey: ['curriculum-tree', id], queryFn: () => api.curriculum.tree(id) });
  const plan = useQuery({ queryKey: ['curriculum-plan', id], queryFn: () => api.curriculum.plan(id), enabled: student });
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ node?: CurriculumNodeDto; parent?: CurriculumNodeDto; kind: CurriculumKind } | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['curriculum-tree', id] }), qc.invalidateQueries({ queryKey: ['curriculum-plan', id] })]);

  const start = async (key: string, fn: () => Promise<{ attemptId: string }>) => {
    setBusy(key);
    try {
      const { attemptId } = await fn();
      navigate(`/quiz/attempt/${attemptId}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <QueryState query={tree}>
      {(t) => {
        const children = (pid: string) => t.nodes.filter((n) => n.parentId === pid);
        const count = (nid: string) => t.questionCounts[nid] ?? 0;
        const Tools = ({ node }: { node: CurriculumNodeDto }) =>
          t.canEdit ? (
            <span className="flex shrink-0 items-center">
              {CHILD_KIND[node.kind] && (
                <IconButton
                  label={tr.t(`curriculum.addChild.${node.kind as 'subject' | 'unit' | 'lesson'}`)}
                  size="sm"
                  onClick={() => setEditing({ parent: node, kind: CHILD_KIND[node.kind]! })}
                >
                  <Plus className="size-4" />
                </IconButton>
              )}
              <IconButton label={tr.t('curriculum.edit')} size="sm" onClick={() => setEditing({ node, kind: node.kind })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label={tr.t('curriculum.delete')}
                size="sm"
                onClick={async () => {
                  if (!(await confirmDialog({ title: tr.t('curriculum.confirmDelete', { title: node.title }), danger: true }))) return;
                  try {
                    await api.curriculum.remove(node.id);
                    if (node.kind === 'subject') navigate('/curriculum');
                    else await refresh();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </span>
          ) : null;
        const practiceBtn = (n: CurriculumNodeDto) =>
          student && count(n.id) > 0 ? (
            <Button
              size="sm"
              variant="soft"
              icon={<Play className="size-4" />}
              loading={busy === n.id}
              onClick={() => void start(n.id, () => api.curriculum.practice(n.id))}
            >
              {tr.t('curriculum.practice')}
            </Button>
          ) : null;
        return (
          <div className="page mx-auto max-w-4xl space-y-5">
            <Link to="/curriculum" className="link inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {tr.t('curriculum.title')}
            </Link>
            <PageHeader
              title={t.subject.code ? `${t.subject.title} (${t.subject.code})` : t.subject.title}
              subtitle={[t.subject.gradeLevel ? tr.t(`stages.grades.${t.subject.gradeLevel}` as never) : null, tr.t(`curriculum.systems.${t.subject.system}`)]
                .filter(Boolean)
                .join(' · ')}
              icon={<BookOpen className="size-6" />}
              actions={<Tools node={t.subject} />}
            />

            {student && plan.data && (
              <section className="card space-y-4 p-5" aria-labelledby="plan">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="plan" className="flex flex-1 items-center gap-2 text-lg font-black">
                    <Compass className="size-5" aria-hidden /> {tr.t('curriculum.plan')}
                  </h2>
                  {plan.data.progress.total > 0 && (
                    <Button
                      size="sm"
                      variant={plan.data.placementDone ? 'ghost' : 'primary'}
                      loading={busy === 'placement'}
                      onClick={() => void start('placement', () => api.curriculum.placement(id))}
                    >
                      {plan.data.placementDone ? tr.t('curriculum.placementAgain') : tr.t('curriculum.placement')}
                    </Button>
                  )}
                </div>
                {!plan.data.placementDone && plan.data.progress.total > 0 && <p className="muted text-sm">{tr.t('curriculum.placementHint')}</p>}
                {plan.data.progress.total === 0 ? (
                  <p className="muted">{tr.t('curriculum.noPlan')}</p>
                ) : (
                  <>
                    <div>
                      <p className="mb-1 text-sm font-bold">
                        {tr.t('curriculum.progress', { mastered: plan.data.progress.mastered, total: plan.data.progress.total })}
                      </p>
                      <ProgressBar value={plan.data.progress.mastered} max={plan.data.progress.total} label={tr.t('curriculum.plan')} />
                    </div>
                    {!plan.data.next.length ? (
                      <p className="font-bold text-ok">{tr.t('curriculum.allDone')}</p>
                    ) : (
                      <div>
                        <h3 className="mb-2 font-black">{tr.t('curriculum.next')}</h3>
                        <ol className="space-y-2">
                          {plan.data.next.map((x) => (
                            <li key={x.objective.id} className="rounded-[var(--radius-control)] border border-line p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Target className="size-4 text-ink" aria-hidden />
                                <span className="min-w-0 flex-1 font-bold" dir="auto">
                                  {x.objective.title}
                                  {x.lesson && <span className="muted font-normal"> · {x.lesson.title}</span>}
                                </span>
                                <span className={cx('badge', STATUS_TONE[x.status])}>{tr.t(`curriculum.status.${x.status}`)}</span>
                                {x.questions > 0 && (
                                  <Button
                                    size="sm"
                                    variant="soft"
                                    icon={<Play className="size-4" />}
                                    loading={busy === x.objective.id}
                                    onClick={() => void start(x.objective.id, () => api.curriculum.practice(x.objective.id))}
                                  >
                                    {tr.t('curriculum.practice')}
                                  </Button>
                                )}
                              </div>
                              {x.resources.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {x.resources.map((r) => (
                                    <ResourceLink key={`${r.type}:${r.id}`} r={r} />
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {children(t.subject.id).map((unit) => (
              <section key={unit.id} className="card p-4" aria-labelledby={`u-${unit.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`u-${unit.id}`} className="min-w-0 flex-1 text-lg font-black" dir="auto">
                    {unit.code ? `${unit.code} · ` : ''}
                    {unit.title}
                  </h2>
                  <span className="muted text-xs">{tr.t('curriculum.questions', { count: count(unit.id) })}</span>
                  {practiceBtn(unit)}
                  <Tools node={unit} />
                </div>
                {(t.resources[unit.id] ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.resources[unit.id]!.map((r) => (
                      <ResourceLink key={`${r.type}:${r.id}`} r={r} />
                    ))}
                  </div>
                )}
                <ul className="mt-3 space-y-3">
                  {children(unit.id).map((lesson) => (
                    <li key={lesson.id} className="rounded-[var(--radius-control)] bg-bg-3/50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 font-bold" dir="auto">
                          {lesson.code ? `${lesson.code} · ` : ''}
                          {lesson.title}
                        </h3>
                        {practiceBtn(lesson)}
                        <Tools node={lesson} />
                      </div>
                      {(t.resources[lesson.id] ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.resources[lesson.id]!.map((r) => (
                            <ResourceLink key={`${r.type}:${r.id}`} r={r} />
                          ))}
                        </div>
                      )}
                      <ul className="mt-2 space-y-1.5">
                        {children(lesson.id).map((o) => {
                          const m = t.mastery[o.id];
                          return (
                            <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <Target className="size-4 shrink-0 text-fg-3" aria-hidden />
                              <span className="min-w-0 flex-1" dir="auto">
                                {o.title}
                                {o.code && <span className="muted"> ({o.code})</span>}
                              </span>
                              {m && student && (
                                <span className={cx('badge', STATUS_TONE[m.status])}>
                                  {m.mastery === null ? tr.t(`curriculum.status.${m.status}`) : tr.t('curriculum.mastery', { pct: m.mastery })}
                                </span>
                              )}
                              {!student && <span className="muted text-xs">{tr.t('curriculum.questions', { count: count(o.id) })}</span>}
                              {practiceBtn(o)}
                              <Tools node={o} />
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {editing && (
              <NodeDialog
                editing={editing}
                onClose={() => setEditing(null)}
                onSaved={async () => {
                  setEditing(null);
                  await refresh();
                }}
              />
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

function NodeDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: { node?: CurriculumNodeDto; parent?: CurriculumNodeDto; kind: CurriculumKind };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tr = useT();
  const n = editing.node;
  const [f, setF] = useState({ title: n?.title ?? '', code: n?.code ?? '', description: n?.description ?? '', sort: n?.sort ?? 0 });
  const [busy, setBusy] = useState(false);
  const title = n ? tr.t('curriculum.edit') : tr.t(`curriculum.addChild.${editing.parent!.kind as 'subject' | 'unit' | 'lesson'}`);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <Button
          loading={busy}
          disabled={!f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const body = { title: f.title.trim(), code: f.code.trim() || null, description: f.description.trim() || null, sort: f.sort };
              if (n) await api.curriculum.update(n.id, body);
              else await api.curriculum.create({ ...body, kind: editing.kind, parentId: editing.parent!.id });
              await onSaved();
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
      <div className="space-y-3">
        <p className="muted text-sm">{tr.t(`curriculum.kinds.${editing.kind}`)}</p>
        <Input label={tr.t('curriculum.name')} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={tr.t('curriculum.code')} value={f.code} maxLength={40} dir="ltr" onChange={(e) => setF({ ...f, code: e.target.value })} />
          <Input type="number" min={0} label="#" value={f.sort} onChange={(e) => setF({ ...f, sort: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        <Textarea label={tr.t('curriculum.description')} value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Modal>
  );
}
