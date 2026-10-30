import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, IdCard, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input type="checkbox" role="switch" className="size-5 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="font-bold">{label}</span>
    </label>
  );
}

export default function PortfolioPage() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['portfolio'], queryFn: () => api.portfolio.mine() });
  const [f, setF] = useState({ slug: '', headline: '', bio: '' });
  const [item, setItem] = useState({ kind: 'project' as 'project' | 'award', title: '', description: '', url: '' });
  // Fill the form once from the server; later refreshes (a switch flipped) must not wipe what is being typed.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (q.data && !filled) {
      setF({ slug: q.data.slug, headline: q.data.headline, bio: q.data.bio });
      setFilled(true);
    }
  }, [q.data, filled]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['portfolio'] });
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.portfolio.save>[0]) => api.portfolio.save(body),
    onSuccess: () => {
      toast(tr.t('growth.portfolio.saved'));
      void refresh();
    },
    onError: toastError,
  });
  const add = useMutation({
    mutationFn: () => api.portfolio.addItem({ kind: item.kind, title: item.title.trim(), description: item.description.trim(), url: item.url.trim() || null }),
    onSuccess: () => {
      setItem({ ...item, title: '', description: '', url: '' });
      void refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.portfolio.removeItem(id), onSuccess: refresh, onError: toastError });
  return (
    <div className="page mx-auto max-w-2xl space-y-5">
      <PageHeader title={tr.t('growth.portfolio.title')} subtitle={tr.t('growth.portfolio.subtitle')} icon={<IdCard className="size-6" />} />
      <QueryState query={q}>
        {(p) => {
          const link = `${window.location.origin}/p/${p.slug}`;
          return (
            <>
              <section className="card space-y-3 p-4">
                {p.blocked && <p className="rounded-[var(--radius-control)] bg-warn/15 p-3 text-sm">{tr.t('growth.portfolio.needsGuardian')}</p>}
                <Switch label={tr.t('growth.portfolio.public')} checked={p.enabled} onChange={(v) => save.mutate({ enabled: v })} />
                {p.enabled && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-soft px-2 py-1 text-sm" dir="ltr">
                      {link}
                    </code>
                    <IconButton
                      label={tr.t('growth.portfolio.copy')}
                      onClick={() => void navigator.clipboard.writeText(link).then(() => toast(tr.t('growth.portfolio.copied')))}
                    >
                      <Copy className="size-4" />
                    </IconButton>
                    <ButtonLink to={`/p/${p.slug}`} size="sm" variant="outline" icon={<ExternalLink className="size-4" />}>
                      {tr.t('growth.portfolio.open')}
                    </ButtonLink>
                  </div>
                )}
                <Input
                  label={tr.t('growth.portfolio.address')}
                  value={f.slug}
                  dir="ltr"
                  maxLength={40}
                  onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })}
                />
                <Input
                  label={tr.t('growth.portfolio.headline')}
                  value={f.headline}
                  maxLength={120}
                  onChange={(e) => setF({ ...f, headline: e.target.value })}
                />
                <Textarea label={tr.t('growth.portfolio.bio')} rows={4} maxLength={1000} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
                <Switch label={tr.t('growth.portfolio.showCertificates')} checked={p.showCertificates} onChange={(v) => save.mutate({ showCertificates: v })} />
                <Switch label={tr.t('growth.portfolio.showStats')} checked={p.showStats} onChange={(v) => save.mutate({ showStats: v })} />
                <Button loading={save.isPending} onClick={() => save.mutate({ slug: f.slug.trim(), headline: f.headline.trim(), bio: f.bio.trim() })}>
                  {tr.t('common.save')}
                </Button>
              </section>
              <section className="card space-y-3 p-4">
                <h2 className="font-black">{tr.t('growth.portfolio.items')}</h2>
                {!p.items.length && <p className="muted text-sm">{tr.t('growth.portfolio.none')}</p>}
                <ul className="divide-y divide-line">
                  {p.items.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 py-2">
                      <span className="badge">{tr.t(`growth.portfolio.${i.kind}`)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold" dir="auto">
                          {i.title}
                        </p>
                        {i.description && (
                          <p className="muted text-sm" dir="auto">
                            {i.description}
                          </p>
                        )}
                      </div>
                      <IconButton label={tr.t('common.delete')} onClick={() => remove.mutate(i.id)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
                <form
                  className="space-y-2 border-t border-line pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    add.mutate();
                  }}
                >
                  <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <Select
                      label={tr.t('growth.portfolio.itemKind')}
                      value={item.kind}
                      onChange={(e) => setItem({ ...item, kind: e.target.value as 'project' | 'award' })}
                      options={[
                        { value: 'project', label: tr.t('growth.portfolio.project') },
                        { value: 'award', label: tr.t('growth.portfolio.award') },
                      ]}
                    />
                    <Input
                      label={tr.t('growth.portfolio.itemTitle')}
                      value={item.title}
                      maxLength={120}
                      onChange={(e) => setItem({ ...item, title: e.target.value })}
                    />
                  </div>
                  <Input
                    label={tr.t('growth.portfolio.itemText')}
                    value={item.description}
                    maxLength={600}
                    onChange={(e) => setItem({ ...item, description: e.target.value })}
                  />
                  <Input
                    label={tr.t('growth.portfolio.itemUrl')}
                    type="url"
                    dir="ltr"
                    value={item.url}
                    onChange={(e) => setItem({ ...item, url: e.target.value })}
                  />
                  <Button type="submit" variant="outline" icon={<Plus className="size-4" />} loading={add.isPending} disabled={item.title.trim().length < 2}>
                    {tr.t('growth.portfolio.addItem')}
                  </Button>
                </form>
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
