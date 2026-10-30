import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';

export default function NotFoundPage() {
  const tr = useT();
  return (
    <div className="page-narrow grid min-h-[60dvh] place-items-center text-center">
      <div className="space-y-4">
        <div className="surface-gradient mx-auto grid size-20 place-items-center rounded-3xl shadow-lg">
          <Compass className="size-10" />
        </div>
        <p className="text-6xl font-black tabular-nums">404</p>
        <h1 className="text-2xl font-black">{tr.t('notFound.title')}</h1>
        <p className="muted mx-auto max-w-sm">{tr.t('notFound.body')}</p>
        <ButtonLink to="/" size="lg">
          {tr.t('notFound.home')}
        </ButtonLink>
      </div>
    </div>
  );
}
