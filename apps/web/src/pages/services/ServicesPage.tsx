import type { TKey } from '@qubedu/i18n';
import { LayoutGrid, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { NAV_CATEGORIES, navItems } from '@/app/nav';
import { PageHeader } from '@/components/ui/States';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Every enabled tool grouped by category, with a one-line description. */
export default function ServicesPage() {
  const tr = useT();
  const config = useSession((s) => s.config);
  const me = useSession((s) => s.me);
  const items = navItems(config?.features ?? {}, me?.accountType).filter((i) => i.id !== 'services' && (me || !i.auth));
  return (
    <div className="page space-y-8">
      <PageHeader title={tr.t('nav.services')} subtitle={tr.t('features.services')} icon={<LayoutGrid className="size-6" />} />
      {NAV_CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="mb-3 text-lg font-black">
              {tr.t(`nav.categories.${cat}` as TKey)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((i) => {
                const Icon = i.icon;
                return (
                  <li key={i.id}>
                    <Link to={i.route} className="card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-lg">
                      <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-xl">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-black">
                          {tr.t(`nav.${i.id}` as TKey)}
                          {i.locked && <Lock className="size-3.5 text-fg-3" />}
                        </span>
                        <span className="muted mt-0.5 line-clamp-2 block text-sm">{tr.t(`features.${i.id}` as TKey)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
