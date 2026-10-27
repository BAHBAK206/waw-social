import { featureIdsForLocation, featureMode, firstBlockedFeature, hasPermission } from '@qubedu/shared';
import { Ban, Construction, Lock, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/States';
import { signOut } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import type { TKey } from '@qubedu/i18n';
import { Logo } from './Logo';

function FullScreenNotice({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="surface-gradient mx-auto mb-5 grid size-16 place-items-center rounded-2xl">{icon}</div>
        <h1 className="text-2xl font-black">{title}</h1>
        {body && <p className="muted mt-2 whitespace-pre-line">{body}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

/** Applies the root admin's feature controls to the current location (deep links included). */
export function FeatureGate({ children }: { children: ReactNode }) {
  const tr = useT();
  const location = useLocation();
  const controls = useSession((s) => s.config?.features ?? {});
  const me = useSession((s) => s.me);
  const ids = featureIdsForLocation(location.pathname, location.search);
  const blocked = firstBlockedFeature(ids, controls);
  if (!blocked || (me && hasPermission(me.role, me.permissions, 'features.manage'))) return <>{children}</>;
  const mode = featureMode(controls, blocked);
  const message = controls[blocked]?.message;
  if (mode === 'locked') {
    return (
      <FullScreenNotice
        icon={<Lock className="size-7" />}
        title={`${tr.t(`nav.${blocked}` as TKey)} · ${tr.t('gate.lockedTitle')}`}
        body={message || tr.t('gate.lockedDefault')}
        action={<ButtonLink to="/">{tr.t('gate.goHome')}</ButtonLink>}
      />
    );
  }
  return (
    <FullScreenNotice
      icon={<Ban className="size-7" />}
      title={tr.t('gate.disabledTitle')}
      body={message || tr.t('gate.disabledBody')}
      action={<ButtonLink to="/">{tr.t('gate.goHome')}</ButtonLink>}
    />
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'guest') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'authed') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <>{children}</>;
}

export function MaintenanceScreen({ message }: { message: string }) {
  const tr = useT();
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="text-center">
        <Logo className="mb-8 justify-center" />
        <FullScreenNotice
          icon={<Construction className="size-7" />}
          title={tr.t('gate.maintenanceTitle')}
          body={message || tr.t('errors.maintenance')}
          action={
            <ButtonLink to="/login" variant="outline" icon={<LogIn className="size-4" />}>
              {tr.t('nav.signIn')}
            </ButtonLink>
          }
        />
      </div>
    </div>
  );
}

export function BannedScreen() {
  const tr = useT();
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <FullScreenNotice
        icon={<Ban className="size-7" />}
        title={tr.t('auth.banned')}
        body={tr.t('auth.bannedHelp')}
        action={
          <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
            {tr.t('nav.signOut')}
          </button>
        }
      />
    </div>
  );
}
