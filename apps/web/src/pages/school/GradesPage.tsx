import { ReportCard } from '@/components/school/Gradebook';
import { PageHeader } from '@/components/ui/States';
import { useT } from '@/lib/i18n';

/** The signed-in student's report card across all their classes. */
export default function GradesPage() {
  const tr = useT();
  return (
    <div className="page mx-auto max-w-3xl">
      <PageHeader title={tr.t('gradebook.reportCard')} subtitle={tr.t('features.grades')} />
      <ReportCard />
    </div>
  );
}
