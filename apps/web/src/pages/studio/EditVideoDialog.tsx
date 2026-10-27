import type { VideoDto } from '@qubedu/shared';
import { LIMITS } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { pickFile } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';

export function EditVideoDialog({ video, onClose }: { video: VideoDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const [form, setForm] = useState({
    title: video.title,
    description: video.description,
    tags: video.tags.join(', '),
    visibility: video.visibility,
    sectionId: video.section?.id ?? '',
    materialId: video.material?.id ?? '',
    allowComments: video.allowComments,
  });
  const [thumb, setThumb] = useState<string | null>(video.thumbnailUrl);
  const [busy, setBusy] = useState(false);
  const materials = taxonomy.data?.sections.find((s) => s.id === form.sectionId)?.materials ?? [];

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={tr.t('studio.editVideo')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={!form.title.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await api.videos.update(video.id, {
                  title: form.title.trim(),
                  description: form.description.trim(),
                  tags: form.tags
                    .split(/[,،\s]+/)
                    .map((t) => t.replace(/^#/, '').trim())
                    .filter(Boolean)
                    .slice(0, 15),
                  visibility: form.visibility,
                  sectionId: form.sectionId || null,
                  materialId: form.materialId || null,
                  allowComments: form.allowComments,
                  thumbnailUrl: thumb,
                });
                toast(tr.t('studio.saved'));
                void qc.invalidateQueries({ queryKey: ['studio'] });
                void qc.invalidateQueries({ queryKey: ['video', video.id] });
                void qc.invalidateQueries({ queryKey: ['videos'] });
                onClose();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-4">
          <Input
            label={tr.t('studio.titleLabel')}
            value={form.title}
            maxLength={LIMITS.videoTitle}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            label={tr.t('studio.descriptionLabel')}
            value={form.description}
            maxLength={LIMITS.videoDescription}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input label={tr.t('studio.tagsLabel')} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label={tr.t('studio.visibility')}
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value as typeof form.visibility })}
              options={(['public', 'unlisted', 'private'] as const).map((v) => ({ value: v, label: tr.t(`studio.visibilities.${v}`) }))}
            />
            <Select
              label={tr.t('studio.subject')}
              value={form.sectionId}
              placeholder={tr.t('studio.noSubject')}
              onChange={(e) => setForm({ ...form, sectionId: e.target.value, materialId: '' })}
              options={(taxonomy.data?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              aria-label={tr.t('studio.subject')}
              label="&nbsp;"
              value={form.materialId}
              placeholder="—"
              disabled={!materials.length}
              onChange={(e) => setForm({ ...form, materialId: e.target.value })}
              options={materials.map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>
          <Switch checked={form.allowComments} onChange={(v) => setForm({ ...form, allowComments: v })} label={tr.t('studio.allowComments')} />
        </div>
        <div>
          <p className="field-label">{tr.t('studio.thumbnail')}</p>
          <div className="aspect-video overflow-hidden rounded-[var(--radius-control)] bg-bg-3">
            {thumb && <img src={fileUrl(thumb)} alt="" className="size-full object-cover" />}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            icon={<ImagePlus className="size-4" />}
            onClick={async () => {
              const img = await pickFile('image/jpeg,image/png,image/webp');
              if (!img) return;
              try {
                setThumb((await api.upload(img, img.name, 'thumbnail')).url);
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('studio.chooseThumbnail')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
