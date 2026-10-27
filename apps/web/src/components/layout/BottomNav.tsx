import { FEATURES, featureMode, type FeatureId } from '@qubedu/shared';
import { NavLink } from 'react-router';
import { BOTTOM_NAV, ICONS } from '@/app/nav';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import type { TKey } from '@qubedu/i18n';

export function BottomNav() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const controls = useSession((s) => s.config?.features ?? {});
  const ids = BOTTOM_NAV.filter((id) => featureMode(controls, id) !== 'hidden');
  return (
    <nav aria-label={tr.t('nav.menu')} className="app-chrome glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--card-solid)_92%,transparent)] backdrop-blur-lg lg:hidden">
      <ul className="mx-auto flex max-w-lg">
        {ids.map((id: FeatureId) => {
          const f = FEATURES.find((x) => x.id === id)!;
          const Icon = ICONS[f.icon]!;
          const route = 'route' in f ? f.route : '/';
          return (
            <li key={id} className="flex-1">
              <NavLink
                to={route}
                end={route === '/'}
                className={({ isActive }) =>
                  cx('relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', isActive ? 'text-ink' : 'text-fg-3')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('grid h-8 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-soft')}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="max-w-full truncate px-1">{tr.t(`nav.${id}` as TKey)}</span>
                    {id === 'chat' && !!me?.unreadMessages && <span className="count-dot absolute end-[22%] top-1.5">{me.unreadMessages}</span>}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
