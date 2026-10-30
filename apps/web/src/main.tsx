import './styles/app.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { boot } from './app/boot';
import { registerServiceWorker } from './app/pwa';
import { router } from './app/router';
import { ReportHost } from './components/common/ReportDialog';
import { ConfirmHost, RewardHost, Toaster } from './components/overlays/Hosts';
import { api } from './lib/api';
import { applyAppearance, useAppearance } from './lib/appearance';
import { queryClient } from './lib/query';

applyAppearance(useAppearance.getState().appearance);
void boot();
registerServiceWorker();

let reported = 0;
const report = (message: string, stack?: string) => {
  if (reported++ > 5) return;
  void api.reportClientError({ message: message.slice(0, 500), stack: stack?.slice(0, 4000), url: location.href, kind: 'runtime' }).catch(() => undefined);
};
window.addEventListener('error', (e) => report(e.message, (e.error as Error | undefined)?.stack));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string; stack?: string; name?: string } | undefined;
  if (r?.name === 'AbortError' || r?.name === 'ApiError') return;
  report(r?.message ?? String(e.reason), r?.stack);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <RewardHost />
      <ConfirmHost />
      <ReportHost />
    </QueryClientProvider>
  </StrictMode>,
);
