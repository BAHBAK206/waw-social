import { INFO_CONTENT, type InfoPage as InfoPageData } from '@qubedu/i18n';
import { Link } from 'react-router';
import { useT } from '@/lib/i18n';

const LINKS = [
  { to: '/about', key: 'about' },
  { to: '/help', key: 'help' },
  { to: '/privacy', key: 'privacy' },
  { to: '/terms', key: 'terms' },
  { to: '/contact', key: 'contact' },
] as const;

export function useInfo() {
  const tr = useT();
  return INFO_CONTENT[tr.locale];
}

export function InfoShell({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const tr = useT();
  return (
    <div className="page-narrow">
      <article className="card space-y-6 p-6 md:p-10">
        <header>
          <h1 className="text-3xl font-black">{title}</h1>
          {intro && <p className="muted mt-3 text-lg">{intro}</p>}
        </header>
        {children}
      </article>
      <nav aria-label={tr.t('nav.categories.help')} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="link">
            {tr.t(`nav.${l.key}`)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Sections({ page }: { page: InfoPageData }) {
  return (
    <div className="space-y-6">
      {page.sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-xl font-black">{s.title}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="list-disc space-y-1.5 ps-6 leading-relaxed">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
