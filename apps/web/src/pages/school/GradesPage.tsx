import { useQuery } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { useState } from 'react';
import { ReportCard } from '@/components/school/Gradebook';
import { BehaviorList } from '@/components/parents/ParentTools';
import { StudentNotes } from '@/components/teachertools/StudentNotes';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Report card: a student's own, or a linked child's for parents. */
export default function GradesPage() {
  const tr = useT();
  const parent = useSession((s) => s.me?.accountType === 'parent');
  return (
    <div className="page mx-auto max-w-3xl">
      <PageHeader
        title={tr.t('gradebook.reportCard')}
        subtitle={tr.t('features.grades')}
        actions={
          !parent && (
            <ButtonLink to="/calculator" variant="outline" size="sm" icon={<Calculator className="size-4" />}>
              {tr.t('nav.calculator')}
            </ButtonLink>
          )
        }
      />
      <StudentNotes />
      {!parent && <BehaviorList />}
      {parent ? <ChildrenReportCards /> : <ReportCard />}
    </div>
  );
}

function ChildrenReportCards() {
  const tr = useT();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const children = fam.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  if (fam.isPending) return null;
  if (!children.length)
    return (
      <EmptyState
        title={tr.t('family.requestTitle')}
        body={tr.t('family.requestHint')}
        action={
          <ButtonLink to="/family" size="sm">
            {tr.t('nav.family')}
          </ButtonLink>
        }
      />
    );
  const current = picked ?? children[0]!.id;
  return (
    <div className="space-y-4">
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === current} onClick={() => setPicked(c.id)} className="chip flex items-center gap-2">
              <Avatar name={c.displayName} url={c.avatarUrl} size="xs" /> {c.displayName}
            </button>
          ))}
        </div>
      )}
      <ReportCard key={current} studentId={current} />
    </div>
  );
}
