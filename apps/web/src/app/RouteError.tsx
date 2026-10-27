import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/** Shown when a route fails to load or render; reports the error once. */
export function RouteError() {
  const err = useRouteError();
  const tr = useT();
  const chunkFailed = err instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed/i.test(err.message);
  useEffect(() => {
    if (isRouteErrorResponse(err)) return;
    const e = err instanceof Error ? err : new Error(String(err));
    void api.reportClientError({ message: e.message.slice(0, 500), stack: e.stack?.slice(0, 4000), url: location.href, kind: 'route' }).catch(() => undefined);
  }, [err]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-black">{chunkFailed ? tr.t('pwa.updateAvailable') : tr.t('common.errorGeneric')}</h1>
        <button type="button" className="btn btn-primary mt-6" onClick={() => location.reload()}>
          <RefreshCw className="size-4" /> {chunkFailed ? tr.t('pwa.reload') : tr.t('common.retry')}
        </button>
      </div>
    </div>
  );
}
