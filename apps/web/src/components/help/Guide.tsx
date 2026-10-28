import { GUIDES, type TKey } from '@qubedu/i18n';
import { CAPABILITY_TABLE, FEATURES, GUIDE_LIST, type AccountType, type GuideId } from '@qubedu/shared';
import { ArrowUpRight, Check, Lightbulb, Minus, ShieldCheck, Users } from 'lucide-react';
import { ICONS } from '@/app/nav';
import { ButtonLink } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export function useGuide(id: GuideId) {
  const tr = useT();
  return GUIDES[tr.locale][id];
}

export function guideRoute(id: GuideId): string | null {
  const meta = GUIDE_LIST.find((g) => g.id === id);
  const f = FEATURES.find((x) => x.id === meta?.feature);
  return f && 'route' in f && !f.route.includes(':') ? f.route : null;
}

export function GuideIcon({ id, className }: { id: GuideId; className?: string }) {
  const meta = GUIDE_LIST.find((g) => g.id === id)!;
  const f = FEATURES.find((x) => x.id === meta.feature)!;
  const Icon = id === 'safety' ? ShieldCheck : id === 'verification' ? Users : (ICONS[f.icon] ?? Lightbulb);
  return <Icon className={className} aria-hidden />;
}

/** A guide's body: steps, tips and per-account notes (the signed-in account's note first). */
export function GuideBody({ id, compact, onNavigate }: { id: GuideId; compact?: boolean; onNavigate?: () => void }) {
  const tr = useT();
  const g = useGuide(id);
  const me = useSession((s) => s.me);
  const route = guideRoute(id);
  const roles = g.roles
    ? (['student', 'teacher', 'parent'] as AccountType[]).sort((a, b) => Number(b === me?.accountType) - Number(a === me?.accountType))
    : [];
  return (
    <div className="space-y-5">
      <p className="leading-relaxed">{g.summary}</p>
      <section aria-labelledby={`steps-${id}`}>
        <h3 id={`steps-${id}`} className="mb-2 font-black">
          {tr.t('helpCenter.steps')}
        </h3>
        <ol className="space-y-2">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="surface-gradient grid size-7 shrink-0 place-items-center rounded-full text-sm font-black">{i + 1}</span>
              <span className="pt-0.5 leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </section>
      {!!g.tips?.length && (
        <section aria-labelledby={`tips-${id}`} className="rounded-[var(--radius-card)] bg-soft p-4">
          <h3 id={`tips-${id}`} className="mb-2 flex items-center gap-2 font-black">
            <Lightbulb className="size-4" aria-hidden /> {tr.t('helpCenter.tips')}
          </h3>
          <ul className="list-disc space-y-1 ps-5 text-sm leading-relaxed">
            {g.tips.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {g.roles && !compact && (
        <section aria-labelledby={`roles-${id}`}>
          <h3 id={`roles-${id}`} className="mb-2 font-black">
            {tr.t('helpCenter.roles')}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <li
                key={r}
                className={cx('rounded-[var(--radius-control)] border p-3 text-sm', r === me?.accountType ? 'border-primary bg-soft' : 'border-line')}
              >
                <p className="mb-1 font-black">
                  {tr.t(`capabilities.${r}` as TKey)}
                  {r === me?.accountType && <span className="muted ms-1 text-xs font-bold">· {tr.t('helpCenter.forYou')}</span>}
                </p>
                <p className="leading-relaxed">{g.roles![r]}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {g.roles && compact && me && <p className="rounded-[var(--radius-control)] border border-primary bg-soft p-3 text-sm">{g.roles[me.accountType]}</p>}
      {route && (
        <ButtonLink to={route} variant="outline" size="sm" icon={<ArrowUpRight className="size-4 rtl:-scale-x-100" />} onClick={onNavigate}>
          {tr.t('helpCenter.open')}
        </ButtonLink>
      )}
    </div>
  );
}

/** "Who can do what" for students, teachers and parents. */
export function CapabilityTable() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const cols: AccountType[] = ['student', 'teacher', 'parent'];
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{tr.t('capabilities.title')}</caption>
        <thead className="bg-bg-3">
          <tr>
            <th scope="col" className="p-3 text-start font-black" />
            {cols.map((c) => (
              <th key={c} scope="col" className={cx('p-3 text-center font-black', c === me?.accountType && 'text-ink')}>
                {tr.t(`capabilities.${c}` as TKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {CAPABILITY_TABLE.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="p-3 text-start font-bold">
                {tr.t(`capabilities.keys.${row.key}` as TKey)}
              </th>
              {cols.map((c) => {
                const v = row[c];
                return (
                  <td key={c} className={cx('p-3 text-center', c === me?.accountType && 'bg-soft')}>
                    {v === 'yes' ? (
                      <Check className="mx-auto size-5 text-ok" aria-label={tr.t('capabilities.values.yes')} />
                    ) : v === 'no' ? (
                      <Minus className="mx-auto size-4 text-fg-3" aria-label={tr.t('capabilities.values.no')} />
                    ) : (
                      <span className="text-xs font-bold">{tr.t(`capabilities.values.${v}` as TKey)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
