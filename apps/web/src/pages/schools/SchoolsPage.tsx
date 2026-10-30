import { CURRICULUM_SYSTEMS, type SchoolDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';

/** Schools I belong to, invitations to accept, and (for verified teachers) a new school. */
export default function SchoolsPage() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() });
  const kids = useQuery({ queryKey: ['family'], queryFn: () => api.family.get(), enabled: me?.accountType === 'parent' });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['schools'] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page mx-auto max-w-4xl">
      <PageHeader
        title={tr.t('schools.title')}
        subtitle={tr.t('features.schools')}
        icon={<Building2 className="size-6" />}
        actions={
          q.data?.canCreate && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {tr.t('schools.create')}
            </Button>
          )
        }
      />
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState icon={<Building2 className="size-7" />} title={tr.t('schools.empty')} body={d.canCreate ? tr.t('schools.createHint') : undefined} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {d.items.map((s) => (
                <li key={s.id} className="card space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-xl">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black" dir="auto">
                        {s.name}
                      </p>
                      <p className="muted text-sm">
                        {s.myRole ? tr.t(`schools.roles.${s.myRole}`) : ''} · {tr.t(`curriculum.systems.${s.system}` as never)}
                      </p>
                    </div>
                    {s.myStatus === 'invited' && <span className="badge badge-primary">{tr.t('schools.invitedBadge')}</span>}
                  </div>
                  {s.myStatus === 'invited' ? (
                    <div className="space-y-2">
                      <p className="text-sm">{tr.t('schools.invited')}</p>
                      <div className="flex gap-2">
                        <Button size="sm" loading={busy === `a${s.id}`} onClick={() => void act(`a${s.id}`, () => api.schools.accept(s.id))}>
                          {tr.t('schools.accept')}
                        </Button>
                        <Button size="sm" variant="outline" loading={busy === `d${s.id}`} onClick={() => void act(`d${s.id}`, () => api.schools.leave(s.id))}>
                          {tr.t('schools.decline')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <SchoolLinks school={s} kids={kids.data?.children ?? []} myId={me?.id ?? ''} />
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {creating && <CreateSchool onClose={() => setCreating(false)} />}
    </div>
  );
}

function SchoolLinks({ school, kids, myId }: { school: SchoolDto; kids: { id: string; displayName: string }[]; myId: string }) {
  const tr = useT();
  const report = (studentId: string) => `/schools/${school.id}/report-cards?studentId=${studentId}`;
  return (
    <div className="flex flex-wrap gap-2">
      {(school.myRole === 'admin' || school.myRole === 'teacher') && (
        <ButtonLink to={`/schools/${school.id}`} size="sm">
          {tr.t('common.open')}
        </ButtonLink>
      )}
      {school.myRole === 'student' && (
        <ButtonLink to={report(myId)} size="sm" variant="soft" icon={<FileText className="size-4" />}>
          {tr.t('schools.myReport')}
        </ButtonLink>
      )}
      {school.myRole === 'parent' &&
        kids.map((k) => (
          <Link key={k.id} to={report(k.id)} className="btn btn-soft btn-sm inline-flex items-center gap-1">
            <FileText className="size-4" aria-hidden /> {tr.t('schools.childReport', { name: k.displayName })}
          </Link>
        ))}
    </div>
  );
}

function CreateSchool({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', system: 'general', principal: '', address: '', phone: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('schools.create')}
      footer={
        <Button
          loading={busy}
          disabled={f.name.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              const s = await api.schools.create({
                name: f.name.trim(),
                system: f.system,
                principal: f.principal.trim() || null,
                address: f.address.trim() || null,
                phone: f.phone.trim() || null,
              });
              navigate(`/schools/${s.id}`);
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
        <Input label={tr.t('schools.name')} value={f.name} maxLength={160} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Select
          label={tr.t('schools.system')}
          value={f.system}
          onChange={(e) => setF({ ...f, system: e.target.value })}
          options={CURRICULUM_SYSTEMS.map((s) => ({ value: s, label: tr.t(`curriculum.systems.${s}`) }))}
        />
        <Input label={tr.t('schools.principal')} value={f.principal} maxLength={120} onChange={(e) => setF({ ...f, principal: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={tr.t('schools.address')} value={f.address} maxLength={300} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <Input label={tr.t('schools.phone')} value={f.phone} maxLength={40} dir="ltr" onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
