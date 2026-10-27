import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '@/lib/i18n';
import { InfoShell, useInfo } from './InfoShell';

export default function HelpPage() {
  const tr = useT();
  const help = useInfo().help;
  const [term, setTerm] = useState('');
  const faq = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? help.faq.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(t)) : help.faq;
  }, [help.faq, term]);
  return (
    <InfoShell title={help.title} intro={help.intro}>
      <div className="relative">
        <Search className="muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
        <input
          type="search"
          className="input ps-9"
          placeholder={tr.t('common.search')}
          aria-label={tr.t('common.search')}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
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
        {!faq.length && <p className="muted p-6 text-center">{tr.t('common.empty')}</p>}
      </div>
      <p className="text-center">
        <Link to="/contact" className="link">
          {tr.t('nav.contact')}
        </Link>
      </p>
    </InfoShell>
  );
}
