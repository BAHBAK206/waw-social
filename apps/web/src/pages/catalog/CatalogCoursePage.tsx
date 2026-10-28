import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { QueryState } from '@/components/ui/States';
import { RichText } from '@/components/common/RichText';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';
import { PriceTag } from './CatalogPage';
import { OnlinePay, TransferPay } from '@/components/catalog/PayOptions';

export default function CatalogCoursePage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gate = useAuthGate();
  const [params] = useSearchParams();
  const authed = useSession((s) => s.status === 'authed');
  const q = useQuery({ queryKey: ['catalog', 'course', id, authed], queryFn: () => api.catalog.get(id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [voucher, setVoucher] = useState('');
  // Back from Stripe: enrollment arrives with the payment webhook, usually within seconds.
  const paid = params.get('paid') === '1';
  useEffect(() => {
    if (!paid || q.data?.enrolled) return;
    const t = setInterval(() => void q.refetch(), 2500);
    return () => clearInterval(t);
  }, [paid, q.data?.enrolled, q]);
  useEffect(() => {
    if (paid && q.data?.enrolled) toast(tr.t('catalog.paid'));
  }, [paid, q.data?.enrolled, tr]);

  const run = (key: string, fn: () => Promise<void>) =>
    gate(async () => {
      setBusy(key);
      try {
        await fn();
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="page-narrow">
      <QueryState query={q}>
        {(c) => (
          <article className="space-y-5">
            <header className="relative overflow-hidden rounded-[var(--radius-card)] p-6 text-white" style={{ background: c.color ?? '#6c5ce7' }}>
              {c.coverUrl && <img src={fileUrl(c.coverUrl)} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
              <div className="relative space-y-2">
                <PriceTag c={c} />
                <h1 className="text-3xl font-black" dir="auto">
                  {c.title}
                </h1>
                <p className="flex items-center gap-2 opacity-90">
                  <Avatar name={c.owner.displayName} url={c.owner.avatarUrl} size="sm" /> {tr.t('catalog.by', { name: c.owner.displayName })}
                </p>
                <p className="text-sm opacity-90">
                  {tr.t('catalog.members', { count: c.memberCount })} · {tr.t('catalog.outline', c.outline)}
                </p>
              </div>
            </header>
            {c.description && (
              <section className="card p-4">
                <RichText text={c.description} />
              </section>
            )}
            <section className="card space-y-3 p-4">
              {c.enrolled ? (
                <>
                  <p className="font-bold text-ok">{tr.t('catalog.enrolled')}</p>
                  <Button icon={<GraduationCap className="size-4" />} onClick={() => navigate(`/school/${c.id}`)}>
                    {tr.t('catalog.open')}
                  </Button>
                </>
              ) : c.priceCents === 0 ? (
                <Button
                  icon={<GraduationCap className="size-4" />}
                  loading={busy === 'enroll'}
                  onClick={() =>
                    void run('enroll', async () => {
                      await api.catalog.enroll(c.id);
                      await qc.invalidateQueries({ queryKey: ['catalog'] });
                      navigate(`/school/${c.id}`);
                    })
                  }
                >
                  {tr.t('catalog.enroll')}
                </Button>
              ) : (
                <>
                  <OnlinePay c={c} run={(k, fn) => void run(k, fn)} busy={busy} />
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('voucher', async () => {
                        await api.school.redeem(voucher.trim());
                        await qc.invalidateQueries({ queryKey: ['catalog'] });
                        navigate(`/school/${c.id}`);
                      });
                    }}
                  >
                    <Input
                      label={tr.t('catalog.voucher')}
                      placeholder="QB-XXXX-XXXX"
                      value={voucher}
                      dir="ltr"
                      className="font-mono uppercase"
                      onChange={(e) => setVoucher(e.target.value.toUpperCase())}
                      wrapperClassName="w-56"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      icon={<Ticket className="size-4" />}
                      loading={busy === 'voucher'}
                      disabled={voucher.trim().length < 6}
                    >
                      {tr.t('catalog.redeem')}
                    </Button>
                  </form>
                  {c.transferInfo && <TransferPay c={c} authed={authed} login={gate(() => undefined)} />}
                </>
              )}
            </section>
          </article>
        )}
      </QueryState>
    </div>
  );
}
