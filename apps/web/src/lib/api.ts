import { ApiError, createApi, RealtimeClient, type Status } from '@qubedu/api-client';
import type { UploadResultDto } from '@qubedu/shared';
import { useAppearance } from './appearance';
import { useSession } from './session';

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const api = createApi({
  baseUrl,
  platform: 'web',
  language: () => useAppearance.getState().appearance.language,
  onAuthChange: (me) => {
    useSession.getState().setMe(me);
    if (me) void realtime.reauth();
  },
});

function sameOriginWs(path: string) {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}${path}`;
}

function realtimeUrl(): string | null {
  const explicit = import.meta.env.VITE_REALTIME_URL as string | undefined;
  if (explicit) return explicit;
  if (import.meta.env.DEV) return sameOriginWs('/ws');
  return useSession.getState().config?.realtimeUrl ?? sameOriginWs('/ws');
}

export const realtime = new RealtimeClient({
  url: realtimeUrl,
  token: () => api.http.token,
  onStatus: (s: Status) => useSession.getState().setRealtimeStatus(s),
});

/** Absolute URL for API-served files (uploads, exports) when the API lives on another origin. */
export function fileUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  return `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Saves a Response (CSV, ICS, JSON export) as a download. */
export async function downloadResponse(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? fallbackName;
  downloadBlob(blob, name);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Upload with progress (XMLHttpRequest exposes upload progress; fetch does not). Retries once after a token refresh. */
export function uploadWithProgress(
  file: Blob,
  name: string,
  purpose: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResultDto> {
  const send = (): Promise<{ status: number; body: unknown }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', api.http.url('/uploads'));
      if (api.http.token) xhr.setRequestHeader('authorization', `Bearer ${api.http.token}`);
      xhr.setRequestHeader('x-requested-with', 'qubedu');
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* not json */
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new ApiError(0, 'network', 'network'));
      xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort());
      const form = new FormData();
      form.set('file', file, name);
      form.set('purpose', purpose);
      xhr.send(form);
    });
  return (async () => {
    let res = await send();
    if (res.status === 401 && (await api.http.refresh())) res = await send();
    if (res.status >= 200 && res.status < 300) return res.body as UploadResultDto;
    const err = (res.body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? 'upload failed');
  })();
}
