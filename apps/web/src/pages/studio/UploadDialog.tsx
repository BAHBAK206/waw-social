import { LIMITS } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileVideo, ImagePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/Charts';
import { pickFile } from '@/components/ui/Upload';
import { api, uploadWithProgress } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { LinkedQuizSelect } from '@/components/video/LinkedQuizSelect';
import { qk } from '@/lib/query';
import { toast, toastError } from '@/lib/ui';

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/** Grabs a frame from a local video file as a JPEG (max 1280px wide). */
function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((video.videoWidth || 1280) * scale);
  canvas.height = Math.round((video.videoHeight || 720) * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

interface Props {
  onClose: () => void;
}

export function UploadDialog({ onClose }: Props) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ duration: number; portrait: boolean } | null>(null);
  const [thumb, setThumb] = useState<{ blob: Blob; url: string; custom: boolean } | null>(null);
  const [frameAt, setFrameAt] = useState(0);
  const [form, setForm] = useState({
    kind: 'video' as 'video' | 'short',
    title: '',
    description: '',
    tags: '',
    visibility: 'public' as 'public' | 'unlisted' | 'private',
    sectionId: '',
    materialId: '',
    quizId: '',
    allowComments: true,
  });
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [pct, setPct] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const probe = useRef<HTMLVideoElement>(null);
  const maxMb = Math.round(LIMITS.videoBytes / 1024 / 1024);

  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );

  const choose = useCallback(
    (f: File | null) => {
      if (!f) return;
      if (!VIDEO_TYPES.includes(f.type)) return toast(tr.t('studio.notVideo'), 'err');
      if (f.size > LIMITS.videoBytes) return toast(tr.t('studio.tooBig', { mb: maxMb }), 'err');
      if (src) URL.revokeObjectURL(src);
      setFile(f);
      setSrc(URL.createObjectURL(f));
      setMeta(null);
      setThumb(null);
      setForm((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }));
    },
    [maxMb, src, tr],
  );

  const grab = useCallback(async (custom = false) => {
    const v = probe.current;
    if (!v) return;
    const blob = await captureFrame(v);
    if (blob) setThumb((old) => (old?.custom && !custom ? old : { blob, url: URL.createObjectURL(blob), custom }));
  }, []);

  // Seek the hidden probe element when the user moves the frame slider.
  useEffect(() => {
    const v = probe.current;
    if (!v || !meta) return;
    const onSeeked = () => void grab();
    v.addEventListener('seeked', onSeeked, { once: true });
    v.currentTime = frameAt;
    return () => v.removeEventListener('seeked', onSeeked);
  }, [frameAt, meta, grab]);

  const tooLongShort = form.kind === 'short' && !!meta && meta.duration > 90;
  const taxMaterials = taxonomy.data?.sections.find((s) => s.id === form.sectionId)?.materials ?? [];
  const ready = !!file && !!meta && form.title.trim().length > 0 && !tooLongShort && phase === 'idle';

  const publish = async () => {
    if (!file || !meta) return;
    setPhase('uploading');
    setPct(0);
    abort.current = new AbortController();
    try {
      const video = await uploadWithProgress(file, file.name, 'video', setPct, abort.current.signal);
      let thumbnailUrl: string | null = null;
      if (thumb) thumbnailUrl = (await api.upload(thumb.blob, 'thumbnail.jpg', 'thumbnail')).url;
      setPhase('saving');
      const created = await api.videos.create({
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        videoUrl: video.url,
        thumbnailUrl,
        durationSec: Math.max(1, Math.round(meta.duration)),
        visibility: form.visibility,
        tags: form.tags
          .split(/[,،\s]+/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean)
          .slice(0, 15),
        sectionId: form.sectionId || null,
        materialId: form.materialId || null,
        quizId: form.quizId || null,
        allowComments: form.allowComments,
      });
      toast(tr.t('studio.published'));
      void qc.invalidateQueries({ queryKey: ['studio'] });
      void qc.invalidateQueries({ queryKey: ['videos'] });
      onClose();
      navigate(created.kind === 'short' ? `/shorts/${created.id}` : `/watch/${created.id}`);
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') toastError(e);
      setPhase('idle');
    }
  };

  return (
    <Modal
      open
      size="xl"
      dismissible={phase === 'idle'}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title={tr.t('studio.uploadTitle')}
      footer={
        <>
          {phase === 'uploading' && (
            <div className="me-auto min-w-40 flex-1">
              <p className="mb-1 text-sm font-bold tabular-nums">{tr.t('studio.uploading', { pct })}</p>
              <ProgressBar value={pct} />
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              abort.current?.abort();
              onClose();
            }}
          >
            {tr.t('common.cancel')}
          </Button>
          <Button disabled={!ready} loading={phase !== 'idle'} onClick={() => void publish()}>
            {tr.t('studio.publish')}
          </Button>
        </>
      }
    >
      {!file ? (
        <div
          className="grid min-h-72 place-items-center rounded-[var(--radius-card)] border-2 border-dashed border-line p-6 text-center hover:border-primary"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0] ?? null);
          }}
        >
          <div>
            <div className="surface-gradient mx-auto mb-4 grid size-20 place-items-center rounded-full">
              <FileVideo className="size-9" />
            </div>
            <p className="font-bold">{tr.t('studio.dropHere')}</p>
            <p className="muted mt-1 text-sm">MP4 · WebM · MOV — {maxMb} MB</p>
            <Button className="mt-4" onClick={async () => choose(await pickFile(VIDEO_TYPES.join(',')))}>
              {tr.t('studio.chooseFile')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={tr.t('studio.kind')}
                value={form.kind}
                error={tooLongShort ? tr.t('studio.shortTooLong') : undefined}
                onChange={(e) => setForm({ ...form, kind: e.target.value as 'video' | 'short' })}
                options={[
                  { value: 'video', label: tr.t('studio.kinds.video') },
                  { value: 'short', label: tr.t('studio.kinds.short') },
                ]}
              />
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
                value={form.materialId}
                placeholder="—"
                disabled={!taxMaterials.length}
                onChange={(e) => setForm({ ...form, materialId: e.target.value })}
                options={taxMaterials.map((m) => ({ value: m.id, label: m.name }))}
              />
            </div>
            <LinkedQuizSelect value={form.quizId} onChange={(quizId) => setForm({ ...form, quizId })} />
            <Switch checked={form.allowComments} onChange={(v) => setForm({ ...form, allowComments: v })} label={tr.t('studio.allowComments')} />
          </div>
          <div className="space-y-3">
            <div className={cx('overflow-hidden rounded-[var(--radius-control)] bg-black', meta?.portrait ? 'mx-auto aspect-[9/16] max-h-80' : 'aspect-video')}>
              <video
                ref={probe}
                src={src ?? undefined}
                muted
                playsInline
                preload="auto"
                className="size-full object-contain"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  const portrait = v.videoHeight > v.videoWidth;
                  setMeta({ duration: v.duration, portrait });
                  setFrameAt(Math.min(1, v.duration * 0.1));
                  if (portrait && v.duration <= 90) setForm((x) => ({ ...x, kind: 'short' }));
                }}
                onError={() => {
                  toast(tr.t('studio.notVideo'), 'err');
                  setFile(null);
                }}
              />
            </div>
            {!meta ? (
              <p className="muted text-sm">{tr.t('studio.reading')}</p>
            ) : (
              <>
                <p className="muted text-sm tabular-nums" dir="ltr">
                  {formatClock(meta.duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <div>
                  <p className="field-label">{tr.t('studio.thumbnail')}</p>
                  {thumb && <img src={thumb.url} alt="" className="mb-2 aspect-video w-full rounded-[var(--radius-control)] object-cover" />}
                  {!thumb?.custom && (
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, meta.duration - 0.1)}
                      step={0.1}
                      value={frameAt}
                      onChange={(e) => setFrameAt(Number(e.target.value))}
                      className="w-full accent-[var(--primary)]"
                      aria-label={tr.t('studio.thumbnail')}
                    />
                  )}
                  <p className="muted text-xs">{thumb?.custom ? '' : tr.t('studio.thumbnailAuto')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    icon={<ImagePlus className="size-4" />}
                    onClick={async () => {
                      const img = await pickFile('image/jpeg,image/png,image/webp');
                      if (img) setThumb({ blob: img, url: URL.createObjectURL(img), custom: true });
                    }}
                  >
                    {tr.t('studio.chooseThumbnail')}
                  </Button>
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={phase !== 'idle'}>
              {tr.t('common.change')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
