import type { Attachment } from '@qubedu/shared';
import { Mic, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Inline player for a voice note. */
export function VoiceNote({ a, label, className }: { a: Attachment; label?: string; className?: string }) {
  const tr = useT();
  return (
    <figure className={cx('flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-soft px-3 py-2', className)}>
      <figcaption className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Mic className="size-4" aria-hidden /> {label ?? tr.t('voice.note')}
      </figcaption>
      <audio controls preload="metadata" src={fileUrl(a.url)} className="h-9 max-w-full min-w-48 flex-1" aria-label={label ?? tr.t('voice.note')} />
    </figure>
  );
}

/**
 * Records a voice note with the microphone, uploads it and hands back the attachment.
 * Shows the elapsed time while recording; tap again to stop. Max length guards against forgotten recordings.
 */
export function VoiceRecordButton({
  purpose,
  onRecorded,
  maxSec = 600,
  size = 'sm',
  label,
}: {
  purpose: string;
  onRecorded: (a: Attachment) => void;
  maxSec?: number;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const tr = useT();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (!rec) return;
    const id = setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSecs(s);
      if (s >= maxSec) rec.stop();
    }, 500);
    return () => clearInterval(id);
  }, [rec, maxSec]);

  const toggle = async () => {
    if (rec) return rec.stop();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast(tr.t('lab.noRecognition'), 'err');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        if (!chunks.length || Date.now() - started.current < 800) return;
        const type = (r.mimeType || 'audio/webm').split(';')[0]!;
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setBusy(true);
        try {
          const up = await api.upload(new Blob(chunks, { type }), `voice-${Date.now()}.${ext}`, purpose);
          onRecorded({ url: up.url, name: tr.t('voice.note'), mime: up.mime, size: up.size, kind: 'audio' });
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      };
      started.current = Date.now();
      setSecs(0);
      r.start();
      setRec(r);
    } catch {
      toast(tr.t('lab.micDenied'), 'err');
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={rec ? 'danger' : 'outline'}
      loading={busy}
      aria-pressed={!!rec}
      icon={rec ? <Square className="size-4" /> : <Mic className="size-4" />}
      onClick={() => void toggle()}
    >
      {rec ? tr.t('voice.recording', { time: formatClock(secs) }) : (label ?? tr.t('voice.record'))}
    </Button>
  );
}

/** A recorded-but-not-yet-sent voice note with play and remove. */
export function PendingVoice({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const tr = useT();
  return (
    <div className="flex items-center gap-2">
      <VoiceNote a={a} className="flex-1" />
      <button type="button" className="icon-btn icon-btn-sm text-err" aria-label={tr.t('voice.remove')} onClick={onRemove}>
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
