import type { AdDto, AnnouncementDto, LibraryItemDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore } from '@/components/ui/States';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { formatDateTime, fromLocalInput, toLocalInput, todayKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { qk } from '@/lib/query';
import { confirmDialog, promptDialog, toast, toastError } from '@/lib/ui';

function Row({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={`icon-btn icon-btn-sm ${danger ? 'text-err' : ''}`} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function AnnouncementDialog({ item, onClose }: { item?: AnnouncementDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: item?.title ?? '',
    text: item?.text ?? '',
    link: item?.link ?? '',
    level: item?.level ?? ('info' as AnnouncementDto['level']),
    active: item?.active ?? true,
    expiresAt: toLocalInput(item?.expiresAt),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('admin.content.newAnnouncement')}
      footer={
        <Button
          disabled={!f.title.trim()}
          onClick={async () => {
            const body = {
              title: f.title.trim(),
              text: f.text.trim(),
              imageUrl: item?.imageUrl ?? null,
              link: f.link.trim() || null,
              level: f.level,
              active: f.active,
              expiresAt: fromLocalInput(f.expiresAt),
            };
            try {
              if (item) await api.admin.updateAnnouncement(item.id, body);
              else await api.admin.createAnnouncement(body);
              await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
              await qc.invalidateQueries({ queryKey: qk.config });
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.title')} value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <Input type="url" dir="ltr" label={tr.t('common.link')} value={f.link} placeholder="https://" onChange={(e) => setF({ ...f, link: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={tr.t('admin.content.level')}
            value={f.level}
            onChange={(e) => setF({ ...f, level: e.target.value as AnnouncementDto['level'] })}
            options={(['info', 'success', 'warning', 'critical'] as const).map((k) => ({ value: k, label: tr.t(`admin.content.levels.${k}`) }))}
          />
          <Input type="datetime-local" label={tr.t('admin.content.expires')} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
        </div>
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={tr.t('admin.content.active')} />
      </div>
    </Modal>
  );
}

function AdDialog({ item, onClose }: { item?: AdDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: item?.title ?? '',
    subtitle: item?.subtitle ?? '',
    link: item?.link ?? '',
    imageUrl: item?.imageUrl ?? null,
    placement: item?.placement ?? ('both' as AdDto['placement']),
    active: item?.active ?? true,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('admin.content.newAd')}
      footer={
        <Button
          disabled={!f.title.trim()}
          onClick={async () => {
            const body = { ...f, title: f.title.trim(), subtitle: f.subtitle.trim(), link: f.link.trim() || null };
            try {
              if (item) await api.admin.updateAd(item.id, body);
              else await api.admin.createAd(body);
              await qc.invalidateQueries({ queryKey: ['admin', 'ads'] });
              await qc.invalidateQueries({ queryKey: qk.config });
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.title')} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input label={tr.t('common.description')} value={f.subtitle} maxLength={240} onChange={(e) => setF({ ...f, subtitle: e.target.value })} />
        <Input type="url" dir="ltr" label={tr.t('common.link')} value={f.link} placeholder="https://" onChange={(e) => setF({ ...f, link: e.target.value })} />
        <Select
          label={tr.t('admin.content.placement')}
          value={f.placement}
          onChange={(e) => setF({ ...f, placement: e.target.value as AdDto['placement'] })}
          options={(['home', 'quiz', 'both'] as const).map((k) => ({ value: k, label: tr.t(`admin.content.placements.${k}`) }))}
        />
        <div className="flex items-center gap-3">
          {f.imageUrl && <img src={fileUrl(f.imageUrl)} alt="" className="h-14 rounded-lg" />}
          <UploadButton variant="outline" size="sm" purpose="general" imageOnly onUploaded={(r) => setF({ ...f, imageUrl: r.url })}>
            {tr.t('common.image')}
          </UploadButton>
        </div>
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={tr.t('admin.content.active')} />
      </div>
    </Modal>
  );
}

export function ContentTab() {
  const tr = useT();
  const qc = useQueryClient();
  const ann = useQuery({ queryKey: ['admin', 'announcements'], queryFn: () => api.admin.announcements() });
  const ads = useQuery({ queryKey: ['admin', 'ads'], queryFn: () => api.admin.ads() });
  const [editAnn, setEditAnn] = useState<AnnouncementDto | 'new' | null>(null);
  const [editAd, setEditAd] = useState<AdDto | 'new' | null>(null);
  const [b, setB] = useState({ title: '', body: '', link: '', audience: 'all' as 'all' | 'students' | 'teachers' });
  const [sending, setSending] = useState(false);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-black">{tr.t('admin.content.announcements')}</h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditAnn('new')}>
            {tr.t('admin.content.newAnnouncement')}
          </Button>
        </div>
        {ann.isPending ? (
          <CardSkeletons count={2} />
        ) : ann.error ? (
          <ErrorState error={ann.error} />
        ) : !ann.data.items.length ? (
          <EmptyState title={tr.t('common.empty')} />
        ) : (
          ann.data.items.map((a) => (
            <Row
              key={a.id}
              actions={
                <>
                  <IconBtn label={tr.t('common.edit')} onClick={() => setEditAnn(a)}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label={tr.t('common.delete')}
                    danger
                    onClick={async () => {
                      if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) {
                        try {
                          await api.admin.deleteAnnouncement(a.id);
                          await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
                          await qc.invalidateQueries({ queryKey: qk.config });
                        } catch (e) {
                          toastError(e);
                        }
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </>
              }
            >
              <p className="truncate font-bold" dir="auto">
                {a.title}
              </p>
              <p className="muted text-xs">
                {tr.t(`admin.content.levels.${a.level}`)} · {a.active ? tr.t('admin.content.active') : tr.t('common.draft')}
                {a.expiresAt ? ` · ${formatDateTime(a.expiresAt, tr)}` : ''}
              </p>
            </Row>
          ))
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-black">{tr.t('admin.content.ads')}</h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditAd('new')}>
            {tr.t('admin.content.newAd')}
          </Button>
        </div>
        {ads.isPending ? (
          <CardSkeletons count={2} />
        ) : ads.error ? (
          <ErrorState error={ads.error} />
        ) : !ads.data.items.length ? (
          <EmptyState title={tr.t('common.empty')} />
        ) : (
          ads.data.items.map((a) => (
            <Row
              key={a.id}
              actions={
                <>
                  <IconBtn label={tr.t('common.edit')} onClick={() => setEditAd(a)}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label={tr.t('common.delete')}
                    danger
                    onClick={async () => {
                      if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) {
                        try {
                          await api.admin.deleteAd(a.id);
                          await qc.invalidateQueries({ queryKey: ['admin', 'ads'] });
                          await qc.invalidateQueries({ queryKey: qk.config });
                        } catch (e) {
                          toastError(e);
                        }
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </>
              }
            >
              <p className="truncate font-bold" dir="auto">
                {a.title}
              </p>
              <p className="muted text-xs">
                {tr.t(`admin.content.placements.${a.placement}`)} · {tr.t('admin.content.clicks', { count: a.clicks })} · {a.impressions} 👁{' '}
                {a.active ? '' : `· ${tr.t('common.draft')}`}
              </p>
            </Row>
          ))
        )}
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-black">{tr.t('admin.content.broadcast')}</h2>
        <Input label={tr.t('common.title')} value={b.title} maxLength={120} onChange={(e) => setB({ ...b, title: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={b.body} onChange={(e) => setB({ ...b, body: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="url"
            dir="ltr"
            label={tr.t('common.link')}
            value={b.link}
            placeholder="https://"
            onChange={(e) => setB({ ...b, link: e.target.value })}
          />
          <Select
            label={tr.t('admin.content.audience')}
            value={b.audience}
            onChange={(e) => setB({ ...b, audience: e.target.value as typeof b.audience })}
            options={(['all', 'students', 'teachers'] as const).map((k) => ({ value: k, label: tr.t(`admin.content.audiences.${k}`) }))}
          />
        </div>
        <Button
          loading={sending}
          icon={<Send className="size-4" />}
          disabled={!b.title.trim()}
          onClick={async () => {
            if (!(await confirmDialog({ title: tr.t('admin.content.broadcast'), body: tr.t(`admin.content.audiences.${b.audience}`) }))) return;
            setSending(true);
            try {
              const r = await api.admin.broadcast({
                title: b.title.trim(),
                body: b.body.trim() || undefined,
                link: b.link.trim() || undefined,
                audience: b.audience,
              });
              toast(tr.t('admin.content.sent', { count: r.recipients }));
              setB({ title: '', body: '', link: '', audience: 'all' });
            } catch (e) {
              toastError(e);
            } finally {
              setSending(false);
            }
          }}
        >
          {tr.t('common.send')}
        </Button>
      </section>
      {editAnn && <AnnouncementDialog item={editAnn === 'new' ? undefined : editAnn} onClose={() => setEditAnn(null)} />}
      {editAd && <AdDialog item={editAd === 'new' ? undefined : editAd} onClose={() => setEditAd(null)} />}
    </div>
  );
}

export function EducationTab() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy() });
  const [name, setName] = useState('');
  const [material, setMaterial] = useState<Record<string, string>>({});
  const refresh = () => qc.invalidateQueries({ queryKey: qk.taxonomy });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  if (q.isPending) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            void run(async () => {
              await api.admin.createSection({ name: name.trim(), sort: q.data.sections.length });
              setName('');
            });
        }}
      >
        <input
          className="input flex-1"
          aria-label={tr.t('admin.education.addSection')}
          placeholder={tr.t('admin.education.addSection')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <Button type="submit" icon={<Plus className="size-4" />} disabled={!name.trim()}>
          {tr.t('common.add')}
        </Button>
      </form>
      {q.data.sections.map((s) => (
        <section key={s.id} className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 font-black" dir="auto">
              {s.name}
            </h3>
            <IconBtn
              label={tr.t('common.rename')}
              onClick={async () => {
                const n = await promptDialog({ title: tr.t('common.rename'), input: { label: tr.t('common.name'), defaultValue: s.name } });
                if (n?.trim()) void run(() => api.admin.updateSection(s.id, { name: n.trim(), sort: s.sort }));
              }}
            >
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn
              label={tr.t('common.delete')}
              danger
              onClick={async () => {
                if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) void run(() => api.admin.deleteSection(s.id));
              }}
            >
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
          <ul className="flex flex-wrap gap-2">
            {s.materials.map((m) => (
              <li key={m.id} className="chip">
                <span dir="auto">{m.name}</span>
                <button
                  type="button"
                  aria-label={tr.t('common.delete')}
                  className="text-err ms-1"
                  onClick={async () => {
                    if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) void run(() => api.admin.deleteMaterial(m.id));
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = material[s.id]?.trim();
              if (v)
                void run(async () => {
                  await api.admin.createMaterial({ sectionId: s.id, name: v, sort: s.materials.length });
                  setMaterial({ ...material, [s.id]: '' });
                });
            }}
          >
            <input
              className="input flex-1"
              aria-label={tr.t('admin.education.addMaterial')}
              placeholder={tr.t('admin.education.addMaterial')}
              value={material[s.id] ?? ''}
              onChange={(e) => setMaterial({ ...material, [s.id]: e.target.value })}
              maxLength={80}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!material[s.id]?.trim()}>
              {tr.t('common.add')}
            </Button>
          </form>
        </section>
      ))}
    </div>
  );
}

export function ChallengesTab() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'challenges'], queryFn: () => api.admin.dailyChallenges() });
  const blank = { day: todayKey(), type: 'quiz' as 'quiz' | 'social', title: '', description: '', question: '', options: ['', '', '', ''], answer: 0, xp: 20 };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const options = f.options.map((o) => o.trim());
  const valid =
    !!f.title.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.day) &&
    (f.type === 'social' || (!!f.question.trim() && options.filter(Boolean).length >= 2 && !!options[f.answer]));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-2">
        {q.isPending ? (
          <CardSkeletons count={3} />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.items.length ? (
          <EmptyState title={tr.t('common.empty')} />
        ) : (
          q.data.items.map((c) => (
            <Row
              key={c.day}
              actions={
                <>
                  <IconBtn
                    label={tr.t('common.edit')}
                    onClick={() =>
                      setF({
                        day: c.day,
                        type: c.type,
                        title: c.title,
                        description: c.description,
                        question: c.question ?? '',
                        options: [...c.options, '', '', '', ''].slice(0, Math.max(4, c.options.length)),
                        answer: c.answer ?? 0,
                        xp: c.xp,
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label={tr.t('common.delete')}
                    danger
                    onClick={async () => {
                      if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) {
                        try {
                          await api.admin.deleteDailyChallenge(c.day);
                          await qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
                        } catch (e) {
                          toastError(e);
                        }
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </>
              }
            >
              <p className="truncate font-bold" dir="auto">
                {c.title}
              </p>
              <p className="muted text-xs">
                {c.day} · {tr.t(`admin.challenge.types.${c.type}`)} · {c.xp} XP
              </p>
            </Row>
          ))
        )}
      </section>
      <section className="card h-fit space-y-4 p-4">
        <Input type="date" label={tr.t('admin.challenge.day')} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
        <Select
          label={tr.t('admin.challenge.type')}
          value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value as 'quiz' | 'social' })}
          options={(['quiz', 'social'] as const).map((k) => ({ value: k, label: tr.t(`admin.challenge.types.${k}`) }))}
        />
        <Input label={tr.t('common.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {f.type === 'quiz' && (
          <>
            <Input label={tr.t('admin.challenge.question')} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
            <fieldset className="space-y-2">
              <legend className="field-label">{tr.t('admin.challenge.options')}</legend>
              {f.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="answer"
                    className="size-5 accent-[var(--primary)]"
                    checked={f.answer === i}
                    onChange={() => setF({ ...f, answer: i })}
                    aria-label={tr.t('admin.challenge.answer')}
                  />
                  <input
                    className="input flex-1"
                    value={o}
                    aria-label={`${tr.t('admin.challenge.options')} ${i + 1}`}
                    onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                </div>
              ))}
            </fieldset>
          </>
        )}
        <Input type="number" min={0} max={500} label={tr.t('admin.challenge.xp')} value={f.xp} onChange={(e) => setF({ ...f, xp: Number(e.target.value) })} />
        <Button
          block
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            try {
              const keep = f.type === 'quiz';
              await api.admin.saveDailyChallenge({
                day: f.day,
                type: f.type,
                title: f.title.trim(),
                description: f.description.trim(),
                question: keep ? f.question.trim() : null,
                options: keep ? options.filter(Boolean) : [],
                answer: keep ? options.slice(0, f.answer).filter(Boolean).length : null,
                xp: f.xp,
              });
              toast(tr.t('common.saved'));
              setF(blank);
              await qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('admin.challenge.save')}
        </Button>
      </section>
    </div>
  );
}

export function LibraryTab() {
  const tr = useT();
  const qc = useQueryClient();
  const list = usePaged<LibraryItemDto>(['admin', 'library-pending'], (cursor) => api.library.list({ pending: true, cursor, limit: 20 }));
  return (
    <div className="space-y-3">
      {list.isPending ? (
        <CardSkeletons count={3} />
      ) : !list.items.length ? (
        <EmptyState title={tr.t('common.empty')} />
      ) : (
        list.items.map((it) => (
          <Row
            key={it.id}
            actions={
              <>
                <Button
                  size="sm"
                  variant="success"
                  icon={<Check className="size-4" />}
                  onClick={async () => {
                    try {
                      await api.library.approve(it.id);
                      await qc.invalidateQueries({ queryKey: ['admin', 'library-pending'] });
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  {tr.t('library.approve')}
                </Button>
                <IconBtn
                  label={tr.t('common.delete')}
                  danger
                  onClick={async () => {
                    if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) {
                      try {
                        await api.library.remove(it.id);
                        await qc.invalidateQueries({ queryKey: ['admin', 'library-pending'] });
                      } catch (e) {
                        toastError(e);
                      }
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconBtn>
              </>
            }
          >
            <p className="truncate font-bold" dir="auto">
              {it.title}
            </p>
            <p className="muted text-xs">
              {tr.t(`library.categories.${it.category}`)} · {it.uploader.displayName}
            </p>
            <a className="link text-xs" href={fileUrl(it.fileUrl)} target="_blank" rel="noopener noreferrer">
              {tr.t('common.preview')}
            </a>
          </Row>
        ))
      )}
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}
