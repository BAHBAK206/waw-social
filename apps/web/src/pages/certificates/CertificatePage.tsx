import { useQuery } from '@tanstack/react-query';
import { Award, BadgeCheck, Copy, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/ui';

/** Printable certificate; also the public verification page (no sign-in). */
export default function CertificatePage() {
  const { code = '' } = useParams();
  const tr = useT();
  const q = useQuery({ queryKey: ['certificate', code], queryFn: () => api.certificates.verify(code) });
  const url = `${window.location.origin}/certificate/${code}`;
  return (
    <div className="page-narrow py-6">
      <QueryState query={q}>
        {(c) => (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
                {tr.t('certificates.print')}
              </Button>
              <Button
                variant="outline"
                icon={<Copy className="size-4" />}
                onClick={() => void navigator.clipboard.writeText(url).then(() => toast(tr.t('common.copied')))}
              >
                {tr.t('certificates.copyLink')}
              </Button>
            </div>
            <article
              className="relative overflow-hidden rounded-[var(--radius-card)] border-4 border-double border-[var(--primary)] bg-[var(--card-solid)] p-8 text-center shadow-xl print:shadow-none md:p-12"
              aria-label={tr.t('certificates.of')}
            >
              <div className="mb-6 flex justify-center">
                <Logo />
              </div>
              <Award className="mx-auto size-14 text-warn" aria-hidden />
              <p className="mt-3 text-sm font-bold tracking-widest text-fg-3 uppercase">{tr.t('certificates.of')}</p>
              <p className="muted mt-6">{tr.t('certificates.awardedTo')}</p>
              <h1 className="mt-1 text-4xl font-black" dir="auto">
                {c.holderName}
              </h1>
              <p className="muted mt-6">{tr.t('certificates.for')}</p>
              <p className="mt-1 text-2xl font-black text-ink" dir="auto">
                {c.title}
              </p>
              {c.grade !== null && <p className="mt-3 font-bold">{tr.t('certificates.grade', { pct: c.grade })}</p>}
              <p className="muted mt-8 text-sm">{tr.t('certificates.issuedBy', { name: c.issuerName, date: formatDate(c.issuedAt, tr) })}</p>
              <p className="mt-4 flex items-center justify-center gap-2 text-sm">
                {c.valid ? (
                  <span className="badge badge-ok">
                    <BadgeCheck className="size-4" aria-hidden /> {tr.t('certificates.valid')}
                  </span>
                ) : (
                  <span className="badge badge-err">{tr.t('certificates.revoked')}</span>
                )}
              </p>
              <p className="muted mt-2 text-xs" dir="ltr">
                {tr.t('certificates.code', { code })} · {tr.t('certificates.verify', { url })}
              </p>
            </article>
          </div>
        )}
      </QueryState>
    </div>
  );
}
