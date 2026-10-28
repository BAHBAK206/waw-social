import { GUIDE_IDS, type GuideId } from '@qubedu/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { GuideBody, GuideIcon, useGuide } from '@/components/help/Guide';
import { EmptyState, PageHeader } from '@/components/ui/States';
import { useT } from '@/lib/i18n';

export default function GuidePage() {
  const { id = '' } = useParams();
  const tr = useT();
  if (!GUIDE_IDS.includes(id as GuideId)) return <EmptyState title={tr.t('helpCenter.notFound')} />;
  return <Guide id={id as GuideId} />;
}

function Guide({ id }: { id: GuideId }) {
  const tr = useT();
  const g = useGuide(id);
  return (
    <div className="page mx-auto max-w-3xl space-y-4">
      <Link to="/help" className="link inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {tr.t('helpCenter.allGuides')}
      </Link>
      <PageHeader title={g.title} icon={<GuideIcon id={id} className="size-6" />} />
      <article className="card p-5 md:p-8">
        <GuideBody id={id} />
      </article>
    </div>
  );
}
