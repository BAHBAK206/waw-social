import { CURRICULUM_SYSTEMS, hasPermission, type CurriculumImportNode, type GradeLevel } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Map as MapIcon, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { GradeLevelSelect } from '@/components/common/GradeLevelSelect';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

/** Subjects of the official curriculum, filtered by system and school year. */
export default function CurriculumPage() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const editor = !!me && hasPermission(me.role, me.permissions, 'education.manage');
  const [params, setParams] = useSearchParams();
  const system = params.get('system') ?? '';
  const grade = params.get('grade') ?? me?.gradeLevel ?? '';
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const q = useQuery({
    queryKey: ['curriculum', system, grade],
    queryFn: () => api.curriculum.subjects({ system: system || undefined, gradeLevel: grade || undefined }),
  });
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  return (
    <div className="page mx-auto max-w-5xl">
      <PageHeader
        title={tr.t('curriculum.title')}
        subtitle={tr.t('features.curriculum')}
        icon={<MapIcon className="size-6" />}
        actions={
          editor && (
            <>
              <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setDialog('import')}>
                {tr.t('curriculum.import')}
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setDialog('new')}>
                {tr.t('curriculum.newSubject')}
              </Button>
            </>
          )
        }
      />
      <div className="card mb-5 grid gap-3 p-3 sm:grid-cols-2">
        <Select
          label={tr.t('curriculum.system')}
          value={system}
          onChange={(e) => set('system', e.target.value)}
          options={[{ value: '', label: tr.t('common.all') }, ...CURRICULUM_SYSTEMS.map((s) => ({ value: s, label: tr.t(`curriculum.systems.${s}`) }))]}
        />
        <GradeLevelSelect label={tr.t('curriculum.grade')} value={grade as GradeLevel | ''} onChange={(v) => set('grade', v)} />
      </div>
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState icon={<BookOpen className="size-7" />} title={tr.t('curriculum.empty')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.map((s) => (
                <li key={s.id}>
                  <Link to={`/curriculum/${s.id}`} className="card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-lg">
                    <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-xl">
                      <BookOpen className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-black" dir="auto">
                        {s.title}
                      </span>
                      <span className="muted block text-sm">
                        {[s.code, s.gradeLevel ? tr.t(`stages.grades.${s.gradeLevel}` as never) : null, tr.t(`curriculum.systems.${s.system}`)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {dialog === 'new' && <NewSubjectDialog onClose={() => setDialog(null)} defaults={{ system, grade }} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} defaults={{ system, grade }} />}
    </div>
  );
}

function NewSubjectDialog({ onClose, defaults }: { onClose: () => void; defaults: { system: string; grade: string } }) {
  const tr = useT();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', code: '', system: defaults.system || 'general', grade: defaults.grade });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('curriculum.newSubject')}
      footer={
        <Button
          loading={busy}
          disabled={!f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const s = await api.curriculum.create({
                kind: 'subject',
                title: f.title.trim(),
                code: f.code.trim() || null,
                system: f.system,
                gradeLevel: f.grade || null,
              });
              navigate(`/curriculum/${s.id}`);
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
        <Input label={tr.t('curriculum.name')} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label={tr.t('curriculum.code')} value={f.code} maxLength={40} dir="ltr" onChange={(e) => setF({ ...f, code: e.target.value })} />
        <Select
          label={tr.t('curriculum.system')}
          value={f.system}
          onChange={(e) => setF({ ...f, system: e.target.value })}
          options={CURRICULUM_SYSTEMS.map((s) => ({ value: s, label: tr.t(`curriculum.systems.${s}`) }))}
        />
        <GradeLevelSelect label={tr.t('curriculum.grade')} value={f.grade as GradeLevel | ''} onChange={(v) => setF({ ...f, grade: v })} />
      </div>
    </Modal>
  );
}

function ImportDialog({ onClose, defaults }: { onClose: () => void; defaults: { system: string; grade: string } }) {
  const tr = useT();
  const navigate = useNavigate();
  const [f, setF] = useState({ json: '', system: defaults.system || 'general', grade: defaults.grade });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={tr.t('curriculum.import')}
      footer={
        <Button
          loading={busy}
          disabled={!f.json.trim()}
          onClick={async () => {
            let subject: CurriculumImportNode;
            try {
              subject = JSON.parse(f.json) as CurriculumImportNode;
            } catch {
              toast(tr.t('curriculum.invalidJson'), 'err');
              return;
            }
            setBusy(true);
            try {
              const r = await api.curriculum.importSubject({ system: f.system, gradeLevel: f.grade || null, subject });
              toast(tr.t('curriculum.importDone', { count: r.nodes }));
              navigate(`/curriculum/${r.subjectId}`);
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('curriculum.import')}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={tr.t('curriculum.system')}
            value={f.system}
            onChange={(e) => setF({ ...f, system: e.target.value })}
            options={CURRICULUM_SYSTEMS.map((s) => ({ value: s, label: tr.t(`curriculum.systems.${s}`) }))}
          />
          <GradeLevelSelect label={tr.t('curriculum.grade')} value={f.grade as GradeLevel | ''} onChange={(v) => setF({ ...f, grade: v })} />
        </div>
        <Textarea label="JSON" hint={tr.t('curriculum.importHint')} rows={12} dir="ltr" value={f.json} onChange={(e) => setF({ ...f, json: e.target.value })} />
      </div>
    </Modal>
  );
}
