import { currentT } from '@/lib/i18n';
import { useUi } from '@/lib/ui';

/** Registers the service worker; when a new version is waiting, asks before reloading. */
export function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/sw.js');
    wb.addEventListener('waiting', () => {
      const tr = currentT();
      useUi.setState({
        confirm: {
          title: tr.t('pwa.updateAvailable'),
          confirmLabel: tr.t('pwa.reload'),
          resolve: (ok) => {
            if (!ok) return;
            wb.addEventListener('controlling', () => window.location.reload());
            wb.messageSkipWaiting();
          },
        },
      });
    });
    void wb.register();
  });
}

let deferredPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as typeof deferredPrompt;
});

export function canInstall() {
  return deferredPrompt !== null;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  deferredPrompt = null;
  return true;
}
