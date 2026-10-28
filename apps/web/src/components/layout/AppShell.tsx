import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router';
import { Spinner } from '@/components/ui/States';
import { startTokenKeepAlive } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/ui';
import { AnnouncementsBar, ConsentBar, OfflineBanner, VerifyEmailBar } from './Banners';
import { BottomNav } from './BottomNav';
import { BannedScreen, FeatureGate, MaintenanceScreen } from './Gates';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const CommandPalette = lazy(() => import('@/components/overlays/CommandPalette'));
const NotificationsPanel = lazy(() => import('@/components/overlays/NotificationsPanel'));
const PomodoroOverlay = lazy(() => import('@/components/overlays/Pomodoro'));
const FlashcardsOverlay = lazy(() => import('@/components/overlays/Flashcards'));
const Onboarding = lazy(() => import('@/components/overlays/Onboarding'));

function RouteRail() {
  const nav = useNavigation();
  if (nav.state === 'idle') return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[90] h-0.5 overflow-hidden" aria-hidden>
      <div className="h-full w-1/3 bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] [animation:route-rail_1s_linear_infinite]" />
    </div>
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().set({ paletteOpen: true });
      }
      if (e.key === 'Escape' && useUi.getState().zen) useUi.getState().set({ zen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Opened inside the mobile app (`?embed=1`): the app provides navigation, so the web chrome is hidden. */
function useEmbedded(): boolean {
  const [embedded] = useState(() => {
    try {
      if (new URLSearchParams(location.search).get('embed') === '1') sessionStorage.setItem('qubedu:embed', '1');
      return sessionStorage.getItem('qubedu:embed') === '1';
    } catch {
      return false;
    }
  });
  return embedded;
}

export function AppShell() {
  const embedded = useEmbedded();
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.me);
  const config = useSession((s) => s.config);
  const ui = useUi();
  const location = useLocation();
  useGlobalShortcuts();
  useEffect(() => startTokenKeepAlive(), []);
  useEffect(() => {
    document.documentElement.dataset.zen = String(ui.zen);
  }, [ui.zen]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (status === 'loading') return <Spinner className="min-h-dvh" />;
  if (me?.banned) return <BannedScreen />;
  const isStaff = me && me.role !== 'user';
  if (config?.maintenance.enabled && !isStaff) return <MaintenanceScreen message={config.maintenance.message} />;

  return (
    <div className="flex min-h-dvh">
      <RouteRail />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-card focus:p-2">
        Skip to content
      </a>
      {!embedded && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {!embedded && <Topbar />}
        <OfflineBanner />
        <AnnouncementsBar />
        <VerifyEmailBar />
        <ConsentBar />
        <main id="main" className={embedded ? 'flex-1 pb-8' : 'flex-1 pb-24 lg:pb-8'}>
          <FeatureGate>
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </FeatureGate>
        </main>
        {!embedded && <BottomNav />}
      </div>
      <Suspense fallback={null}>
        {ui.paletteOpen && <CommandPalette />}
        {ui.notificationsOpen && me && <NotificationsPanel />}
        {me && <PomodoroOverlay />}
        {ui.flashcards && me && <FlashcardsOverlay />}
        {ui.onboardingOpen && me && <Onboarding />}
      </Suspense>
    </div>
  );
}
