import type { CourseDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { AtRiskSection } from '@/components/family/Insights';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';

const COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#e84393', '#2d3436', '#fdcb6e'];

export function CourseCard({ course }: { course: CourseDto }) {
  const tr = useT();
  const color = course.color ?? '#6c5ce7';
  return (
    <Link to={`/school/${course.id}`} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <div className="relative h-24 p-4 text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}>
        {course.coverUrl && <img src={fileUrl(course.coverUrl)} alt="" className="absolute inset-0 size-full object-cover opacity-40" />}
        <h2 className="relative line-clamp-2 text-lg leading-snug font-black" dir="auto">
          {course.title}
        </h2>
        {course.subject && <p className="relative text-sm opacity-90">{course.subject}</p>}
      </div>
      <div className="flex flex-1 items-center gap-3 p-3">
        <Avatar name={course.owner.displayName} url={course.owner.avatarUrl} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{course.owner.displayName}</span>
        <span className="muted text-xs">{tr.t('groups.members', { count: course.memberCount })}</span>
        {course.myRole && <span className="badge badge-primary">{tr.t(`school.roles.${course.myRole}`)}</span>}
      </div>
    </Link>
  );
}

export default function SchoolPage() {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useSession((s) => s.me)!;
  const canCreate = me.accountType === 'teacher' || me.role !== 'user';
  const [archived, setArchived] = useState(false);
  const q = useQuery({ queryKey: [...qk.courses, archived], queryFn: () => api.school.courses(archived) });
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [f, setF] = useState({ title: '', description: '', subject: '', color: COLORS[0]! });
  const [busy, setBusy] = useState(false);

  return (
    <div className="page">
      <PageHeader
        title={tr.t('school.title')}
        subtitle={tr.t('school.subtitle')}
        icon={<GraduationCap className="size-6" />}
        actions={
          <>
            <Button variant="outline" icon={<KeyRound className="size-4" />} onClick={() => setJoining(true)}>
              {tr.t('school.join')}
            </Button>
            {canCreate && (
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                {tr.t('school.create')}
              </Button>
            )}
          </>
        }
      />
      {canCreate && <AtRiskSection />}
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{' '}
        {tr.t('school.archived')}
      </label>
      <QueryState
        query={q}
        isEmpty={(d) => !d.items.length}
        empty={
          <EmptyState
            icon={<GraduationCap className="size-7" />}
            title={tr.t('school.empty')}
            action={<Button onClick={() => setJoining(true)}>{tr.t('school.join')}</Button>}
          />
        }
      >
        {(d) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </QueryState>

      <Modal
        open={joining}
        onClose={() => setJoining(false)}
        size="sm"
        title={tr.t('school.join')}
        footer={
          <Button
            loading={busy}
            disabled={code.trim().length < 4}
            onClick={async () => {
              setBusy(true);
              try {
                // A class code, or a voucher for a paid course (QB-XXXX-XXXX).
                const c = /^QB-/i.test(code.trim()) ? await api.school.redeem(code.trim()) : await api.school.join(code.trim());
                await qc.invalidateQueries({ queryKey: qk.courses });
                setJoining(false);
                navigate(`/school/${c.id}`);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('school.join')}
          </Button>
        }
      >
        <Input
          label={tr.t('school.code')}
          hint={tr.t('school.codeHint')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          dir="ltr"
          className="text-center font-mono text-2xl tracking-widest"
        />
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={tr.t('school.create')}
        footer={
          <Button
            loading={busy}
            disabled={!f.title.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const c = await api.school.create({
                  title: f.title.trim(),
                  description: f.description.trim(),
                  subject: f.subject.trim() || null,
                  color: f.color,
                });
                await qc.invalidateQueries({ queryKey: qk.courses });
                setCreating(false);
                navigate(`/school/${c.id}`);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.create')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input label={tr.t('common.title')} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input label={tr.t('academic.subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div>
            <p className="field-label">{tr.t('school.color')}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr.t('school.color')}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={f.color === c}
                  aria-label={c}
                  onClick={() => setF({ ...f, color: c })}
                  className={`size-8 rounded-full ${f.color === c ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card-solid)]' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
