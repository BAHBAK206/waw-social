import { ACHIEVEMENTS } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { achievementName } from '@/lib/ui';

/** A student's public page (no sign-in). Certificates link to the public verification page. */
export default function PublicPortfolioPage() {
  const { slug = '' } = useParams();
  const tr = useT();
  const q = useQuery({ queryKey: ['portfolio', 'public', slug], queryFn: () => api.portfolio.publicPage(slug), retry: false });
  return (
    <div className="page-narrow space-y-5 py-6">
      <QueryState query={q}>
        {(p) => (
          <>
            <header className="card flex flex-wrap items-center gap-4 p-5">
              <Avatar name={p.name} url={p.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black" dir="auto">
                  {p.name}
                </h1>
                {p.headline && (
                  <p className="font-bold text-primary" dir="auto">
                    {p.headline}
                  </p>
                )}
                <p className="muted text-sm">
                  {tr.t('growth.portfolio.level', { level: p.level, xp: p.xp })}
                  {p.streak > 0 ? ` · ${tr.t('growth.portfolio.streak', { count: p.streak })}` : ''} ·{' '}
                  {tr.t('growth.portfolio.member', { date: formatDate(p.joinedAt, tr) })}
                </p>
              </div>
            </header>
            {p.bio && (
              <section className="card p-5">
                <p className="whitespace-pre-wrap" dir="auto">
                  {p.bio}
                </p>
              </section>
            )}
            {p.stats && (
              <section className="card space-y-2 p-5">
                <p className="font-bold">{tr.t('growth.portfolio.quizzes', { count: p.stats.quizzes, avg: p.stats.averagePct })}</p>
                {!!p.topics.length && (
                  <>
                    <h2 className="font-black">{tr.t('growth.portfolio.strong')}</h2>
                    <ul className="flex flex-wrap gap-2">
                      {p.topics.map((t) => (
                        <li key={t.topic} className="badge badge-ok" dir="auto">
                          {t.topic} · {t.mastery}%
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
            {!!p.certificates.length && (
              <section className="card space-y-2 p-5">
                <h2 className="font-black">{tr.t('growth.portfolio.certificates')}</h2>
                <ul className="divide-y divide-line">
                  {p.certificates.map((c) => (
                    <li key={c.code} className="flex flex-wrap items-center gap-3 py-2">
                      <BadgeCheck className="size-5 text-ok" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold" dir="auto">
                          {c.title}
                        </p>
                        <p className="muted text-xs">{tr.t('growth.portfolio.issued', { name: c.issuerName, date: formatDate(c.issuedAt, tr) })}</p>
                      </div>
                      <Link to={`/certificate/${c.code}`} className="text-sm font-bold underline">
                        {tr.t('growth.portfolio.verify')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!p.items.length && (
              <section className="card space-y-2 p-5">
                <ul className="divide-y divide-line">
                  {p.items.map((i) => (
                    <li key={i.id} className="py-2">
                      <p className="flex items-center gap-2 font-bold" dir="auto">
                        <span className="badge">{tr.t(`growth.portfolio.${i.kind}`)}</span> {i.title}
                        {i.url && (
                          <a href={i.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={i.title}>
                            <ExternalLink className="size-4" />
                          </a>
                        )}
                      </p>
                      {i.description && (
                        <p className="muted text-sm" dir="auto">
                          {i.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!p.achievements.length && (
              <section className="card space-y-2 p-5">
                <h2 className="font-black">{tr.t('growth.portfolio.achievements')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {p.achievements.map((a) => (
                    <li key={a} className="badge">
                      {ACHIEVEMENTS.find((d) => d.id === a)?.icon} {achievementName(a)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="text-center">
              <Link to="/" className="muted text-sm underline">
                {tr.t('growth.portfolio.verified')} · {tr.t('growth.portfolio.back')}
              </Link>
            </p>
          </>
        )}
      </QueryState>
    </div>
  );
}
