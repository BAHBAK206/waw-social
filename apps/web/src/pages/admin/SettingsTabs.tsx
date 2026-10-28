import { FEATURES, FEATURE_MODES, type FeatureControlMap, type FeatureMode } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { CardSkeletons, ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { confirmDialog, toast, toastError } from '@/lib/ui';

export function FeaturesTab() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'features'], queryFn: () => api.admin.features() });
  const [map, setMap] = useState<FeatureControlMap>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setMap(q.data.features);
  }, [q.data]);
  const rows = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return FEATURES.filter((f) => !t || f.id.includes(t) || tr.tDyn(`nav.${f.id}`, undefined, f.id).toLowerCase().includes(t));
  }, [filter, tr]);
  if (q.isPending) return <CardSkeletons count={4} />;
  if (q.error) return <ErrorState error={q.error} />;
  const dirty = JSON.stringify(map) !== JSON.stringify(q.data.features);
  const set = (id: string, patch: Partial<{ mode: FeatureMode; message: string }>) =>
    setMap((m) => {
      const cur = (m as Record<string, { mode: FeatureMode; message: string }>)[id] ?? { mode: 'enabled' as FeatureMode, message: '' };
      const next = { ...cur, ...patch };
      const copy = { ...m } as Record<string, { mode: FeatureMode; message: string }>;
      if (next.mode === 'enabled' && !next.message) delete copy[id];
      else copy[id] = next;
      return copy as FeatureControlMap;
    });
  return (
    <div className="space-y-4">
      <p className="muted">{tr.t('admin.features.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs flex-1"
          placeholder={tr.t('admin.features.filter')}
          aria-label={tr.t('admin.features.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button variant="outline" onClick={() => setMap({})}>
          {tr.t('admin.features.resetAll')}
        </Button>
        <Button
          loading={busy}
          disabled={!dirty}
          onClick={async () => {
            setBusy(true);
            try {
              await api.admin.saveFeatures(map);
              await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'features'] }), qc.invalidateQueries({ queryKey: qk.config })]);
              toast(tr.t('common.saved'));
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      </div>
      <div className="card divide-y divide-line">
        {rows.map((f) => {
          const c = map[f.id as keyof FeatureControlMap];
          const mode = c?.mode ?? 'enabled';
          return (
            <div key={f.id} className="grid items-center gap-3 p-3 md:grid-cols-[12rem_14rem_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="truncate font-bold">{tr.tDyn(`nav.${f.id}`, undefined, f.id)}</p>
                <p className="muted truncate text-xs" dir="ltr">
                  {f.id} · {f.kind}
                </p>
              </div>
              <Select
                aria-label={f.id}
                value={mode}
                onChange={(e) => set(f.id, { mode: e.target.value as FeatureMode })}
                options={FEATURE_MODES.map((m) => ({ value: m, label: tr.t(`admin.features.modes.${m}`) }))}
              />
              <input
                className="input"
                disabled={mode === 'enabled'}
                aria-label={tr.t('admin.features.message')}
                placeholder={tr.t('admin.features.message')}
                value={c?.message ?? ''}
                maxLength={420}
                onChange={(e) => set(f.id, { message: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One word or phrase per line. Empty lines are kept while typing and dropped on save.
const wordsText = (list: string[]) => list.join('\n');
const parseWords = (text: string) => text.split('\n').slice(0, 500);
const cleanWords = (list: string[]) => [...new Set(list.map((w) => w.trim().slice(0, 60)).filter(Boolean))];

export function SiteTab() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.admin.settings() });
  const [s, setS] = useState<typeof q.data>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  if (q.isPending || !s) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} />;
  const contact = s.contact;
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      toast(tr.t('admin.site.done', { result: JSON.stringify(r) }));
    } catch (e) {
      toastError(e);
    }
    void label;
  };
  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5">
        <Switch
          checked={s.maintenance.enabled}
          onChange={(v) => setS({ ...s, maintenance: { ...s.maintenance, enabled: v } })}
          label={tr.t('admin.site.maintenance')}
        />
        <Textarea
          label={tr.t('admin.site.maintenanceMessage')}
          value={s.maintenance.message}
          onChange={(e) => setS({ ...s, maintenance: { ...s.maintenance, message: e.target.value } })}
        />
        <Switch checked={s.registrationOpen} onChange={(v) => setS({ ...s, registrationOpen: v })} label={tr.t('admin.site.registration')} />
        <Switch checked={s.uploads.enabled} onChange={(v) => setS({ ...s, uploads: { enabled: v } })} label={tr.t('admin.site.uploads')} />
        <Switch checked={s.ai.enabled} onChange={(v) => setS({ ...s, ai: { ...s.ai, enabled: v } })} label={tr.t('admin.site.ai')} />
        <Input
          type="number"
          min={0}
          max={1000}
          label={tr.t('admin.site.aiQuota')}
          value={s.ai.dailyQuota}
          onChange={(e) => setS({ ...s, ai: { ...s.ai, dailyQuota: Number(e.target.value) } })}
        />
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-black">{tr.t('admin.site.moderation')}</h2>
        <p className="muted text-sm">{tr.t('admin.site.moderationIntro')}</p>
        <Switch
          checked={s.moderation.enabled}
          onChange={(v) => setS({ ...s, moderation: { ...s.moderation, enabled: v } })}
          label={tr.t('admin.site.moderationOn')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label={tr.t('admin.site.maskWords')}
            rows={5}
            dir="auto"
            value={wordsText(s.moderation.mask)}
            onChange={(e) => setS({ ...s, moderation: { ...s.moderation, mask: parseWords(e.target.value) } })}
          />
          <Textarea
            label={tr.t('admin.site.blockWords')}
            rows={5}
            dir="auto"
            value={wordsText(s.moderation.block)}
            onChange={(e) => setS({ ...s, moderation: { ...s.moderation, block: parseWords(e.target.value) } })}
          />
        </div>
        <Input
          type="number"
          min={0}
          max={50}
          label={tr.t('admin.site.autoHide')}
          value={s.moderation.autoHideReports}
          onChange={(e) => setS({ ...s, moderation: { ...s.moderation, autoHideReports: Math.max(0, Math.min(50, Number(e.target.value) || 0)) } })}
        />
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-black">{tr.t('admin.site.contact')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {['email', 'phone', 'whatsapp', 'address', 'facebook', 'instagram', 'telegram'].map((k) => (
            <Input key={k} label={k} dir="ltr" value={contact[k] ?? ''} onChange={(e) => setS({ ...s, contact: { ...contact, [k]: e.target.value } })} />
          ))}
        </div>
      </section>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.admin.saveSettings({
              maintenance: s.maintenance,
              registrationOpen: s.registrationOpen,
              contact: s.contact,
              ai: s.ai,
              uploads: s.uploads,
              moderation: { ...s.moderation, mask: cleanWords(s.moderation.mask), block: cleanWords(s.moderation.block) },
            });
            await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'settings'] }), qc.invalidateQueries({ queryKey: qk.config })]);
            toast(tr.t('common.saved'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr.t('common.save')}
      </Button>
      <section className="card flex flex-wrap gap-3 p-5">
        <Button variant="outline" onClick={() => void run('cleanup', () => api.admin.cleanup())}>
          {tr.t('admin.site.cleanup')}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            if (await confirmDialog({ title: tr.t('admin.site.recompute') })) void run('recompute', () => api.admin.recomputeLevels());
          }}
        >
          {tr.t('admin.site.recompute')}
        </Button>
      </section>
    </div>
  );
}
