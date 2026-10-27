import { Lock, ShieldCheck, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router';
import { NAV_CATEGORIES, navItems } from '@/app/nav';
import { Logo } from '@/components/layout/Logo';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/ui';
import type { TKey } from '@qubedu/i18n';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const tr = useT();
  const config = useSession((s) => s.config);
  const me = useSession((s) => s.me);
  const items = navItems(config?.features ?? {});
  const location = useLocation();
  const isActive = (route: string) => {
    const [path, query] = route.split('?');
    if (path === '/') return location.pathname === '/';
    if (query) return location.pathname === path && location.search.includes(query);
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  return (
    <nav aria-label={tr.t('nav.menu')} className="space-y-5">
      {NAV_CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat}>
            <p className="mb-1.5 px-3 text-xs font-black tracking-wide text-fg-3 uppercase">{tr.t(`nav.categories.${cat}` as TKey)}</p>
            <ul className="space-y-0.5">
              {list.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.route);
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.route}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 font-bold transition-colors',
                        active ? 'bg-soft text-ink' : 'text-fg-2 hover:bg-bg-3 hover:text-fg',
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{tr.t(`nav.${item.id}` as TKey)}</span>
                      {item.locked && <Lock className="size-3.5 text-fg-3" aria-label={tr.t('gate.lockedTitle')} />}
                      {item.id === 'chat' && !!me?.unreadMessages && <span className="count-dot">{me.unreadMessages > 99 ? '99+' : me.unreadMessages}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {me && me.role !== 'user' && (
        <NavLink
          to="/admin"
          onClick={onNavigate}
          className={({ isActive: a }) =>
            cx('flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 font-bold', a ? 'bg-soft text-ink' : 'text-fg-2 hover:bg-bg-3')
          }
        >
          <ShieldCheck className="size-5" aria-hidden />
          {tr.t('nav.admin')}
        </NavLink>
      )}
    </nav>
  );
}

/** Persistent sidebar on large screens, drawer on smaller ones. */
export function Sidebar() {
  const tr = useT();
  const open = useUi((s) => s.navOpen);
  const location = useLocation();
  useEffect(() => useUi.getState().set({ navOpen: false }), [location.pathname]);

  return (
    <>
      <aside className="app-chrome scroll-thin sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-e border-line bg-card px-3 pt-4 pb-8 lg:block">
        <div className="mb-6 px-2">
          <Logo />
        </div>
        <NavList />
      </aside>
      {open && (
        <div className="app-chrome fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={tr.t('nav.menu')}>
          <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={() => useUi.getState().set({ navOpen: false })} />
          <div className="scroll-thin animate-pop absolute inset-y-0 start-0 w-[min(84vw,300px)] overflow-y-auto bg-[var(--card-solid)] px-3 pt-3 pb-10 shadow-2xl">
            <div className="mb-4 flex items-center justify-between px-2">
              <Logo />
              <button type="button" className="icon-btn" aria-label={tr.t('common.close')} onClick={() => useUi.getState().set({ navOpen: false })}>
                <X className="size-5" />
              </button>
            </div>
            <NavList onNavigate={() => useUi.getState().set({ navOpen: false })} />
          </div>
        </div>
      )}
    </>
  );
}
