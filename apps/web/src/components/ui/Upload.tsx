import { ALLOWED_UPLOAD_MIME, IMAGE_MIME, LIMITS, type UploadResultDto } from '@qubedu/shared';
import { useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';
import { Button, type ButtonProps } from './Button';

export type UploadPurpose = 'avatar' | 'cover' | 'post' | 'chat' | 'group' | 'library' | 'course' | 'assignment' | 'form' | 'live' | 'workspace' | 'general';

/** Validates size/type on the client (the server re-checks magic bytes) and uploads. */
export function useUpload() {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, purpose: UploadPurpose, imageOnly = false): Promise<UploadResultDto | null> => {
    const allowed: readonly string[] = imageOnly ? IMAGE_MIME : ALLOWED_UPLOAD_MIME;
    if (file.type && !allowed.includes(file.type)) {
      toast(tr.t(imageOnly ? 'errors.image_required' : 'errors.unsupported_file_type'), 'err');
      return null;
    }
    if (file.size > (imageOnly ? LIMITS.imageBytes : LIMITS.uploadBytes)) {
      toast(tr.t('errors.file_too_large'), 'err');
      return null;
    }
    setBusy(true);
    try {
      return await api.upload(file, file.name, purpose);
    } catch (err) {
      toastError(err);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

/** A button that opens the file picker and uploads the chosen file. */
export function UploadButton({
  purpose,
  imageOnly,
  accept,
  onUploaded,
  children,
  ...button
}: Omit<ButtonProps, 'onClick'> & { purpose: UploadPurpose; imageOnly?: boolean; accept?: string; onUploaded: (r: UploadResultDto) => void; children?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept ?? (imageOnly ? IMAGE_MIME.join(',') : undefined)}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = await upload(f, purpose, imageOnly);
          if (r) onUploaded(r);
        }}
      />
      <Button {...button} loading={busy || button.loading} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  );
}

/** Opens a native file picker and resolves with the chosen file (no upload). */
export function pickFile(accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
