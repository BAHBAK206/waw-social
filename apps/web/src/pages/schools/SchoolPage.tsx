import { parseSchoolCsv, SCHOOL_ROLES, type SchoolDto, type SchoolImportResultDto, type SchoolImportRow } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Download, FileText, KeyRound, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { SchoolPlan } from '@/components/growth/SchoolPlan';
import { SchoolComplaints } from '@/components/schooladmin/Complaints';
import { SchoolDashboard } from '@/components/schooladmin/Dashboard';
import { SchoolFees } from '@/components/schooladmin/Fees';
import { SchoolNews } from '@/components/schooladmin/News';
import { SchoolSurveys } from '@/components/schooladmin/Surveys';
import { SchoolTimetable } from '@/components/schooladmin/Timetable';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/download';
import { useT } from '@/lib/i18n';
import { confirmDialog, toast, toastError } from '@/lib/ui';

const TABS = ['overview', 'dashboard', 'people', 'classes', 'fees', 'news', 'timetable', 'surveys', 'complaints', 'plan', 'reports'] as const;

export default function SchoolPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const q = useQuery({ queryKey: ['school', id], queryFn: () => api.schools.get(id) });
  const [tab, setTab] = useTabParam(TABS, 'overview');
  return (
    <div className="page mx-auto max-w-5xl">
      <QueryState query={q}>
        {(s) => (
          <>
            <PageHeader title={s.name} subtitle={s.myRole ? tr.t(`schools.roles.${s.myRole}`) : undefined} icon={<Building2 className="size-6" />} />
            <Tabs
              className="mb-5"
              active={tab}
              onChange={setTab}
              tabs={TABS.filter((k) => {
                const parent = s.myRole === 'parent';
                const admin = s.myRole === 'admin';
                if (k === 'dashboard' || k === 'fees' || k === 'complaints' || k === 'plan') return admin;
                if (k === 'people' || k === 'classes' || k === 'reports') return !parent;
                return true;
              }).map((k) => ({ key: k, label: tr.t(`schools.tabs.${k}`) }))}
            />
            {tab === 'overview' && <Overview school={s} />}
            {tab === 'dashboard' && s.myRole === 'admin' && <SchoolDashboard schoolId={s.id} name={s.name} />}
            {tab === 'people' && s.myRole !== 'parent' && <People school={s} />}
            {tab === 'classes' && s.myRole !== 'parent' && <Classes school={s} />}
            {tab === 'fees' && s.myRole === 'admin' && <SchoolFees school={s} />}
            {tab === 'news' && <SchoolNews school={s} />}
            {tab === 'timetable' && <SchoolTimetable school={s} />}
            {tab === 'surveys' && <SchoolSurveys school={s} />}
            {tab === 'complaints' && s.myRole === 'admin' && <SchoolComplaints school={s} />}
            {tab === 'plan' && s.myRole === 'admin' && <SchoolPlan school={s} />}
            {tab === 'reports' && s.myRole !== 'parent' && <Reports school={s} />}
          </>
        )}
      </QueryState>
    </div>
  );
}

function Overview({ school }: { school: SchoolDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const admin = school.myRole === 'admin';
  const [f, setF] = useState({ name: school.name, principal: school.principal ?? '', address: school.address ?? '', phone: school.phone ?? '' });
  const [busy, setBusy] = useState(false);
  const stats = [
    ['students', school.counts.students],
    ['teachers', school.counts.teachers + school.counts.admins],
    ['parents', school.counts.parents],
    ['classes', school.counts.classes],
    ['invited', school.counts.invited],
  ] as const;
  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <li key={k} className="card p-4 text-center">
            <p className="text-3xl font-black tabular-nums">{v}</p>
            <p className="muted text-sm">{tr.t(`schools.stats.${k}`)}</p>
          </li>
        ))}
      </ul>
      {admin && (
        <section className="card space-y-3 p-4">
          <Input label={tr.t('schools.name')} value={f.name} maxLength={160} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label={tr.t('schools.principal')} value={f.principal} maxLength={120} onChange={(e) => setF({ ...f, principal: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={tr.t('schools.address')} value={f.address} maxLength={300} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <Input label={tr.t('schools.phone')} value={f.phone} maxLength={40} dir="ltr" onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.schools.update(school.id, {
                  name: f.name.trim(),
                  principal: f.principal.trim() || null,
                  address: f.address.trim() || null,
                  phone: f.phone.trim() || null,
                });
                await qc.invalidateQueries({ queryKey: ['school', school.id] });
                toast(tr.t('common.saved'));
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.save')}
          </Button>
        </section>
      )}
      <Button
        variant="ghost"
        onClick={async () => {
          if (!(await confirmDialog({ title: tr.t('schools.confirmLeave', { school: school.name }), danger: true }))) return;
          try {
            await api.schools.leave(school.id);
            await qc.invalidateQueries({ queryKey: ['schools'] });
            navigate('/schools');
          } catch (e) {
            toastError(e);
          }
        }}
      >
        {tr.t('schools.leave')}
      </Button>
    </div>
  );
}

function People({ school }: { school: SchoolDto }) {
  const tr = useT();
  const admin = school.myRole === 'admin';
  const [filter, setFilter] = useState({ role: '', section: '', q: '' });
  const q = useQuery({
    queryKey: ['school-members', school.id, filter],
    queryFn: () => api.schools.members(school.id, { role: filter.role || undefined, section: filter.section || undefined, q: filter.q || undefined }),
  });
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <Select
          label={tr.t('schools.role')}
          value={filter.role}
          onChange={(e) => setFilter({ ...filter, role: e.target.value })}
          options={[{ value: '', label: tr.t('schools.allRoles') }, ...SCHOOL_ROLES.map((r) => ({ value: r, label: tr.t(`schools.roles.${r}`) }))]}
        />
        <Select
          label={tr.t('schools.section')}
          value={filter.section}
          onChange={(e) => setFilter({ ...filter, section: e.target.value })}
          options={[{ value: '', label: tr.t('schools.allSections') }, ...school.sections.map((s) => ({ value: s, label: s }))]}
        />
        <Input label={tr.t('schools.search')} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        {admin && (
          <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
            {tr.t('schools.import')}
          </Button>
        )}
      </div>
      <QueryState query={q}>
        {(d) => (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-start">
                  <th className="p-3 text-start">{tr.t('schools.name')}</th>
                  <th className="p-3 text-start">{tr.t('schools.role')}</th>
                  <th className="p-3 text-start">{tr.t('schools.section')}</th>
                  <th className="p-3 text-start">{tr.t('schools.number')}</th>
                  {admin && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {d.items.map((m) => (
                  <tr key={m.user.id} className="border-t border-line">
                    <td className="p-3">
                      <span className="font-bold" dir="auto">
                        {m.user.displayName}
                      </span>
                      {m.user.email && (
                        <span className="muted block text-xs" dir="ltr">
                          {m.user.email}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {tr.t(`schools.roles.${m.role}`)} {m.status === 'invited' && <span className="badge ms-1">{tr.t('schools.invitedBadge')}</span>}
                    </td>
                    <td className="p-3">{m.section ?? '—'}</td>
                    <td className="p-3 tabular-nums">{m.studentNumber ?? '—'}</td>
                    {admin && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {m.managed && m.role !== 'admin' && (
                            <IconButton
                              size="sm"
                              label={tr.t('schools.resetPassword')}
                              onClick={async () => {
                                try {
                                  const r = await api.schools.resetPassword(school.id, m.user.id);
                                  await confirmDialog({
                                    title: tr.t('schools.resetPassword'),
                                    body: tr.t('schools.resetDone', { name: m.user.displayName, password: r.password, login: r.login }),
                                  });
                                } catch (e) {
                                  toastError(e);
                                }
                              }}
                            >
                              <KeyRound className="size-4" />
                            </IconButton>
                          )}
                          <IconButton
                            size="sm"
                            label={tr.t('schools.remove')}
                            onClick={async () => {
                              if (!(await confirmDialog({ title: tr.t('schools.confirmRemove', { name: m.user.displayName }), danger: true }))) return;
                              try {
                                await api.schools.removeMember(school.id, m.user.id);
                                await q.refetch();
                              } catch (e) {
                                toastError(e);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </IconButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      {importing && <ImportDialog school={school} onClose={() => setImporting(false)} />}
    </div>
  );
}

const TEMPLATE = [
  ['name', 'role', 'grade', 'class', 'number', 'email', 'parent email', 'parent name'],
  ['Ali Hassan', 'student', 'p5', '5A', '1001', '', 'mona@example.com', 'Mona Hassan'],
  ['Salma Adel', 'teacher', '', '', '', 'salma@example.com', '', ''],
];

function ImportDialog({ school, onClose }: { school: SchoolDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<{ rows: SchoolImportRow[]; errors: { line: number; reason: string }[] } | null>(null);
  const [result, setResult] = useState<SchoolImportResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const credentials = () => [
    [tr.t('schools.name'), tr.t('schools.role'), tr.t('schools.section'), tr.t('schools.number'), tr.t('schools.login'), tr.t('schools.password')],
    ...(result?.created ?? []).map((c) => [c.name, tr.t(`schools.roles.${c.role}` as never), c.section ?? '', c.studentNumber ?? '', c.login, c.password]),
  ];
  return (
    <Modal open onClose={onClose} size="lg" title={tr.t('schools.import')}>
      {!result ? (
        <div className="space-y-4">
          <p className="muted text-sm">{tr.t('schools.importHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<FileText className="size-4" />}
              onClick={async () => {
                const f = await pickFile('.csv,text/csv,text/plain');
                if (f) setParsed(parseSchoolCsv(await f.text()));
              }}
            >
              {tr.t('schools.pick')}
            </Button>
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv('school-template.csv', TEMPLATE)}>
              {tr.t('schools.template')}
            </Button>
          </div>
          {parsed && (
            <div className="space-y-2">
              <p className="font-bold">{tr.t('schools.ready', { count: parsed.rows.length })}</p>
              {parsed.errors.length > 0 && (
                <div className="rounded-[var(--radius-control)] bg-err/10 p-3 text-sm">
                  <p className="font-bold">{tr.t('schools.problems')}</p>
                  <ul className="list-disc ps-5">
                    {parsed.errors.slice(0, 20).map((e) => (
                      <li key={e.line}>{tr.t('schools.line', { line: e.line, reason: tr.t(`schools.reasons.${e.reason}` as never) })}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="max-h-48 overflow-y-auto text-sm">
                {parsed.rows.slice(0, 50).map((r, i) => (
                  <li key={i} className="flex gap-2 border-b border-line py-1">
                    <span className="flex-1" dir="auto">
                      {r.name}
                    </span>
                    <span className="muted">{tr.t(`schools.roles.${r.role}`)}</span>
                    <span className="muted">{r.section ?? ''}</span>
                  </li>
                ))}
              </ul>
              <Button
                loading={busy}
                disabled={!parsed.rows.length || parsed.rows.length > 300}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api.schools.importRows(school.id, parsed.rows);
                    setResult(r);
                    toast(tr.t('schools.done', { created: r.created.length, invited: r.invited }));
                    await qc.invalidateQueries({ queryKey: ['school-members', school.id] });
                    await qc.invalidateQueries({ queryKey: ['school', school.id] });
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tr.t('schools.run')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {result.created.length > 0 && (
            <section className="space-y-2" aria-label={tr.t('schools.credentials')}>
              <h3 className="font-black">{tr.t('schools.credentials')}</h3>
              <p className="text-sm text-warn">{tr.t('schools.credentialsHint')}</p>
              <div className="flex gap-2">
                <Button icon={<Download className="size-4" />} onClick={() => downloadCsv(`${school.name}-accounts.csv`, credentials())}>
                  {tr.t('schools.download')}
                </Button>
                <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                  {tr.t('schools.print')}
                </Button>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {result.created.map((c, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="p-2" dir="auto">
                          {c.name}
                        </td>
                        <td className="p-2">{c.section ?? ''}</td>
                        <td className="p-2 font-mono text-xs" dir="ltr">
                          {c.login}
                        </td>
                        <td className="p-2 font-mono" dir="ltr">
                          {c.password}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {result.skipped.length > 0 && (
            <section className="text-sm">
              <h3 className="font-black">{tr.t('schools.skipped')}</h3>
              <ul className="list-disc ps-5">
                {result.skipped.map((s) => (
                  <li key={s.row} dir="auto">
                    {s.name}: {tr.t(`schools.skip.${s.reason}` as never)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function Classes({ school }: { school: SchoolDto }) {
  const tr = useT();
  const admin = school.myRole === 'admin';
  const q = useQuery({ queryKey: ['school-classes', school.id], queryFn: () => api.schools.classes(school.id) });
  const teachers = useQuery({ queryKey: ['school-teachers', school.id], queryFn: () => api.schools.members(school.id), enabled: admin });
  const [f, setF] = useState({ section: '', title: '', subjectCode: '', teacherId: '', maxMarks: '100', passMarks: '50', term: '' });
  const [busy, setBusy] = useState(false);
  const staff = (teachers.data?.items ?? []).filter((m) => (m.role === 'teacher' || m.role === 'admin') && m.status === 'active');
  return (
    <div className="space-y-4">
      {admin && (
        <section className="card space-y-3 p-4">
          <h3 className="font-black">{tr.t('schools.newClass')}</h3>
          <p className="muted text-sm">{tr.t('schools.classHint')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label={tr.t('schools.section')}
              value={f.section}
              maxLength={20}
              list="school-sections"
              onChange={(e) => setF({ ...f, section: e.target.value })}
            />
            <datalist id="school-sections">
              {school.sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Input label={tr.t('schools.subject')} value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Input
              label={tr.t('schools.subjectCode')}
              value={f.subjectCode}
              maxLength={32}
              dir="ltr"
              onChange={(e) => setF({ ...f, subjectCode: e.target.value })}
            />
            <Select
              label={tr.t('schools.teacher')}
              value={f.teacherId}
              placeholder="—"
              onChange={(e) => setF({ ...f, teacherId: e.target.value })}
              options={staff.map((m) => ({ value: m.user.id, label: m.user.displayName }))}
            />
            <Input
              type="number"
              min={1}
              max={1000}
              label={tr.t('schools.maxMarks')}
              value={f.maxMarks}
              onChange={(e) => setF({ ...f, maxMarks: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              max={1000}
              label={tr.t('schools.passMarks')}
              value={f.passMarks}
              onChange={(e) => setF({ ...f, passMarks: e.target.value })}
            />
            <Input label={tr.t('schools.term')} value={f.term} maxLength={80} onChange={(e) => setF({ ...f, term: e.target.value })} />
          </div>
          <Button
            icon={<Plus className="size-4" />}
            loading={busy}
            disabled={!f.section.trim() || f.title.trim().length < 2 || !f.teacherId}
            onClick={async () => {
              setBusy(true);
              try {
                await api.schools.createClass(school.id, {
                  section: f.section.trim(),
                  title: f.title.trim(),
                  subjectCode: f.subjectCode.trim() || null,
                  teacherId: f.teacherId,
                  maxMarks: Number(f.maxMarks) || 100,
                  passMarks: Number(f.passMarks) || 0,
                  term: f.term.trim() || null,
                });
                toast(tr.t('schools.classCreated'));
                setF({ ...f, title: '', subjectCode: '' });
                await q.refetch();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('schools.newClass')}
          </Button>
        </section>
      )}
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState icon={<Building2 className="size-7" />} title={tr.t('schools.noClasses')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {d.items.map((c) => (
                <li key={c.id}>
                  <a href={`/school/${c.id}`} className="card block p-4 hover:shadow-lg">
                    <p className="font-black" dir="auto">
                      {c.title} {c.subjectCode && <span className="muted text-sm font-normal">({c.subjectCode})</span>}
                    </p>
                    <p className="muted text-sm">
                      {c.section} · {c.teacher.displayName} · {tr.t('schools.members', { count: Math.max(0, c.memberCount - 1) })}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

function Reports({ school }: { school: SchoolDto }) {
  const tr = useT();
  const [section, setSection] = useState(school.sections[0] ?? '');
  const [term, setTerm] = useState('');
  return (
    <section className="card space-y-3 p-4">
      <p className="muted text-sm">{tr.t('schools.reportsHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={tr.t('schools.pickSection')}
          value={section}
          onChange={(e) => setSection(e.target.value)}
          options={school.sections.map((s) => ({ value: s, label: s }))}
        />
        <Input label={tr.t('schools.term')} placeholder={tr.t('schools.allTerms')} value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <ButtonLink
        to={`/schools/${school.id}/report-cards?section=${encodeURIComponent(section)}${term.trim() ? `&term=${encodeURIComponent(term.trim())}` : ''}`}
        icon={<FileText className="size-4" />}
        aria-disabled={!section}
      >
        {tr.t('schools.openReports')}
      </ButtonLink>
    </section>
  );
}
