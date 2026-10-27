import { Bell, LogOut, Menu as MenuIcon, MessageCircle, Moon, Search, Settings, ShieldCheck, Sun, Timer, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { actionVisible } from '@/app/nav';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { resolvedMode, useAppearance } from '@/lib/appearance';
import { signOut } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/ui';
import { Logo } from './Logo';

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="count-dot absolute -end-0.5 -top-0.5">{n > 99 ? '99+' : n}</span>;
}

function UserMenu() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-start font-bold hover:bg-bg-3';
  return (
    <div ref={ref} className="relative">
      <button type="button" className="rounded-full" aria-haspopup="menu" aria-expanded={open} aria-label={me.displayName} onClick={() => setOpen((o) => !o)}>
        <Avatar name={me.displayName} url={me.avatarUrl} size="sm" className="ring-2 ring-white/60" />
      </button>
      {open && (
        <div role="menu" className="card animate-pop absolute end-0 z-50 mt-2 w-64 overflow-hidden bg-[var(--card-solid)] py-1 text-fg">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-black">{me.displayName}</p>
            <p className="muted truncate text-sm">{me.email}</p>
          </div>
          <Link role="menuitem" to="/profile" className={item} onClick={() => setOpen(false)}>
            <User className="size-4" /> {tr.t('nav.profile')}
          </Link>
          <Link role="menuitem" to="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings className="size-4" /> {tr.t('nav.settings')}
          </Link>
          {me.role !== 'user' && (
            <Link role="menuitem" to="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck className="size-4" /> {tr.t('nav.admin')}
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            className={cx(item, 'text-err')}
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/');
            }}
          >
            <LogOut className="size-4" /> {tr.t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const controls = useSession((s) => s.config?.features ?? {});
  const appearance = useAppearance((s) => s.appearance);
  const dark = resolvedMode(appearance) === 'dark';
  const ui = useUi.getState();
  const btn = 'icon-btn relative text-white/90 hover:bg-white/15 hover:text-white';

  return (
    <header className="app-chrome surface-gradient sticky top-0 z-40 shadow-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-2 md:px-4">
        <button type="button" className={cx(btn, 'lg:hidden')} aria-label={tr.t('nav.menu')} onClick={() => ui.set({ navOpen: true })}>
          <MenuIcon className="size-6" />
        </button>
        <div className="lg:hidden">
          <Logo light />
        </div>
        {actionVisible(controls, 'search') && (
          <button
            type="button"
            onClick={() => ui.set({ paletteOpen: true })}
            className="ms-2 hidden h-11 max-w-md flex-1 items-center gap-2 rounded-full bg-white/15 px-4 text-start text-white/85 hover:bg-white/20 md:flex"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-sm">{tr.t('nav.searchPlaceholder')}</span>
            <kbd className="rounded bg-white/15 px-1.5 text-[11px]">{tr.t('palette.hint')}</kbd>
          </button>
        )}
        <div className="flex-1" />
        {actionVisible(controls, 'search') && (
          <button type="button" className={cx(btn, 'md:hidden')} aria-label={tr.t('nav.search')} onClick={() => ui.set({ paletteOpen: true })}>
            <Search className="size-5" />
          </button>
        )}
        {actionVisible(controls, 'theme') && (
          <button
            type="button"
            className={btn}
            aria-label={tr.t('features.theme')}
            title={tr.t('features.theme')}
            onClick={() => useAppearance.getState().update({ theme: dark ? 'light' : 'dark' })}
          >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        )}
        {me ? (
          <>
            {actionVisible(controls, 'pomodoro') && (
              <button type="button" className={cx(btn, 'hidden sm:inline-flex')} aria-label={tr.t('features.pomodoro')} title={tr.t('features.pomodoro')} onClick={() => ui.set({ pomodoroOpen: true })}>
                <Timer className="size-5" />
              </button>
            )}
            <Link to="/chat" className={cx(btn, 'hidden sm:inline-flex')} aria-label={tr.t('nav.chat')} title={tr.t('nav.chat')}>
              <MessageCircle className="size-5" />
              <Count n={me.unreadMessages} />
            </Link>
            {actionVisible(controls, 'notifications') && (
              <button type="button" className={btn} aria-label={tr.t('nav.notifications')} title={tr.t('nav.notifications')} onClick={() => ui.set({ notificationsOpen: true })}>
                <Bell className="size-5" />
                <Count n={me.unreadNotifications} />
              </button>
            )}
            <div className="ms-1">
              <UserMenu />
            </div>
          </>
        ) : (
          <ButtonLink to="/login" variant="outline" size="sm" className="ms-2 border-white/40 bg-white/10 text-white hover:text-white">
            {tr.t('nav.signIn')}
          </ButtonLink>
        )}
      </div>
    </header>
  );
}
