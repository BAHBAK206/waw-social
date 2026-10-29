import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/ui';

export default function InvitePage() {
  const tr = useT();
  const q = useQuery({ queryKey: ['referral'], queryFn: () => api.referrals.mine() });
  return (
    <div className="page mx-auto max-w-2xl space-y-5">
      <QueryState query={q}>
        {(d) => {
          const link = `${window.location.origin}/register?ref=${d.code}`;
          const message = tr.t('growth.referral.message', { code: d.code, link });
          const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast(tr.t('growth.referral.copied')));
          return (
            <>
              <PageHeader
                title={tr.t('growth.referral.title')}
                subtitle={tr.t('growth.referral.subtitle', { xp: d.rewardXp })}
                icon={<Gift className="size-6" />}
              />
              <section className="card space-y-3 p-4 text-center">
                <p className="muted text-sm">{tr.t('growth.referral.code')}</p>
                <p className="select-all font-mono text-3xl font-black tracking-widest" data-testid="referral-code">
                  {d.code}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" icon={<Copy className="size-4" />} onClick={() => copy(link)}>
                    {tr.t('growth.referral.copy')}
                  </Button>
                  {typeof navigator.share === 'function' && (
                    <Button icon={<Share2 className="size-4" />} onClick={() => void navigator.share({ text: message }).catch(() => undefined)}>
                      {tr.t('growth.referral.share')}
                    </Button>
                  )}
                </div>
                <p className="muted break-all text-xs" dir="ltr">
                  {link}
                </p>
              </section>
              <ul className="grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ['invited', d.invited],
                    ['rewarded', d.rewarded],
                    ['xp', d.xpEarned],
                  ] as const
                ).map(([k, v]) => (
                  <li key={k} className="card p-3">
                    <p className="text-2xl font-black tabular-nums">{v}</p>
                    <p className="muted text-xs">{tr.t(`growth.referral.${k}`)}</p>
                  </li>
                ))}
              </ul>
              <section className="card p-4">
                <h2 className="mb-2 font-black">{tr.t('growth.referral.friends')}</h2>
                {!d.friends.length ? (
                  <p className="muted text-sm">{tr.t('growth.referral.none')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.friends.map((f, i) => (
                      <li key={i} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate" dir="auto">
                          {f.name}
                        </span>
                        <span className="muted text-xs">{formatDate(f.joinedAt, tr)}</span>
                        <span className={f.rewarded ? 'badge badge-ok' : 'badge'}>
                          {f.rewarded ? tr.t('growth.referral.done') : tr.t('growth.referral.waiting')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted mt-2 text-xs">{tr.t('growth.referral.max', { count: d.maxRewards })}</p>
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
