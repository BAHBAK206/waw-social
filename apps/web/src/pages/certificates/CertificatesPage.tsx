import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { Link } from 'react-router';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

export default function CertificatesPage() {
  const tr = useT();
  const q = useQuery({ queryKey: ['certificates', 'mine'], queryFn: () => api.certificates.mine() });
  return (
    <div className="page-narrow space-y-5">
      <PageHeader title={tr.t('certificates.mine')} icon={<Award className="size-6" />} />
      {q.isPending ? (
        <CardSkeletons count={2} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState icon={<Award className="size-7" />} title={tr.t('certificates.none')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {q.data.items.map((c) => (
            <li key={c.id}>
              <Link to={`/certificate/${c.code}`} className="card block space-y-1 p-4 hover:shadow-lg">
                <p className="flex items-center gap-2 font-black" dir="auto">
                  <Award className="size-5 text-warn" aria-hidden /> {c.title}
                </p>
                <p className="muted text-sm">{tr.t('certificates.issuedBy', { name: c.issuerName, date: formatDate(c.issuedAt, tr) })}</p>
                {c.revoked && <span className="badge badge-err">{tr.t('certificates.revoked')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
