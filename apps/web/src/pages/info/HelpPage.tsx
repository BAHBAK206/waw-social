import { GUIDES } from '@qubedu/i18n';
import { GUIDE_LIST, normalizeSearch } from '@qubedu/shared';
import { Bot, LifeBuoy, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CapabilityTable, GuideIcon } from '@/components/help/Guide';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/States';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useInfo } from './InfoShell';

/** Help center: every feature explained (step-by-step guides for the big ones), who can do what, and common questions. */
export default function HelpPage() {
  const tr = useT();
  const help = useInfo().help;
  const me = useSession((s) => s.me);
  const book = GUIDES[tr.locale];
  const [term, setTerm] = useState('');
  const q = normalizeSearch(term.trim());
  const match = (text: string) => !q || normalizeSearch(text).includes(q);
  const guides = useMemo(
    () => GUIDE_LIST.filter((g) => match([book[g.id].title, book[g.id].summary, ...book[g.id].steps, ...(book[g.id].tips ?? [])].join(' '))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, q],
  );
  const faq = help.faq.filter((f) => match(`${f.question} ${f.answer}`));
  const detailed = guides.filter((g) => g.detailed);
  const quick = guides.filter((g) => !g.detailed);
  return (
    <div className="page mx-auto max-w-5xl space-y-8">
      <PageHeader title={tr.t('helpCenter.title')} subtitle={tr.t('helpCenter.intro')} icon={<LifeBuoy className="size-6" />} />
      <div className="relative">
        <Search className="muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
        <input
          type="search"
          className="input ps-9"
          placeholder={tr.t('helpCenter.search')}
          aria-label={tr.t('helpCenter.search')}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {!guides.length && !faq.length && <p className="muted text-center">{tr.t('helpCenter.noResults')}</p>}
      {detailed.length > 0 && (
        <section aria-labelledby="help-detailed">
          <h2 id="help-detailed" className="mb-3 text-lg font-black">
            {tr.t('helpCenter.detailed')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detailed.map((g) => (
              <li key={g.id}>
                <Link to={`/help/${g.id}`} className="card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-lg">
                  <span className="surface-gradient grid size-11 shrink-0 place-items-center rounded-xl">
                    <GuideIcon id={g.id} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-black">{book[g.id].title}</span>
                    <span className="muted mt-0.5 line-clamp-3 block text-sm">{book[g.id].summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {quick.length > 0 && (
        <section aria-labelledby="help-quick">
          <h2 id="help-quick" className="mb-3 text-lg font-black">
            {tr.t('helpCenter.quick')}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {quick.map((g) => (
              <li key={g.id}>
                <Link to={`/help/${g.id}`} className="flex items-start gap-3 rounded-[var(--radius-control)] p-2 hover:bg-bg-3">
                  <GuideIcon id={g.id} className="mt-0.5 size-5 shrink-0 text-fg-2" />
                  <span className="min-w-0">
                    <span className="block font-bold">{book[g.id].title}</span>
                    <span className="muted block text-sm">{book[g.id].summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!q && (
        <section aria-labelledby="help-caps" className="space-y-3">
          <div>
            <h2 id="help-caps" className="text-lg font-black">
              {tr.t('capabilities.title')}
            </h2>
            <p className="muted text-sm">{tr.t('capabilities.hint')}</p>
          </div>
          <CapabilityTable />
        </section>
      )}
      {faq.length > 0 && (
        <section aria-labelledby="help-faq">
          <h2 id="help-faq" className="mb-3 text-lg font-black">
            {tr.t('helpCenter.faq')}
          </h2>
          <div className="card divide-y divide-line">
            {faq.map((f) => (
              <details key={f.question} className="group p-4">
                <summary className="cursor-pointer list-none font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="me-2 inline-block transition-transform group-open:rotate-90 rtl:group-open:-rotate-90" aria-hidden>
                    ›
                  </span>
                  {f.question}
                </summary>
                <p className="muted mt-2 leading-relaxed">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {me && (
          <ButtonLink to="/assistant" icon={<Bot className="size-4" />}>
            {tr.t('helpCenter.askAi')}
          </ButtonLink>
        )}
        <Link to="/contact" className="link">
          {tr.t('nav.contact')}
        </Link>
      </div>
    </div>
  );
}
