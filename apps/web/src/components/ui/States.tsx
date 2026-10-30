import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { errorMessage, useT } from '@/lib/i18n';
import { Button } from './Button';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const tr = useT();
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 py-10 text-fg-3', className)}>
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label ?? tr.t('common.loading')}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function CardSkeletons({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cx('grid gap-3', className)} aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center px-4 py-12 text-center', className)}>
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-soft text-ink">{icon ?? <Inbox className="size-7" />}</div>
      <p className="text-lg font-bold">{title}</p>
      {body && <p className="muted mt-1 max-w-md">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const tr = useT();
  return (
    <div role="alert" className={cx('flex flex-col items-center px-4 py-12 text-center', className)}>
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--err)_14%,transparent)] text-err">
        <AlertTriangle className="size-7" />
      </div>
      <p className="font-bold">{errorMessage(error, tr)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          {tr.t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/** Renders loading / error / content for a TanStack query result. */
export function QueryState<T>({
  query,
  children,
  loading,
  empty,
  isEmpty,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
}) {
  if (query.isPending) return <>{loading ?? <Spinner />}</>;
  if (query.error || query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-center gap-3 md:mb-6">
      {icon && <div className="surface-gradient grid size-12 shrink-0 place-items-center rounded-2xl shadow-lg">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-black md:text-3xl">{title}</h1>
        {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  const tr = useT();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center py-4">
      <Button variant="outline" loading={loading} onClick={onClick}>
        {tr.t('common.loadMore')}
      </Button>
    </div>
  );
}
