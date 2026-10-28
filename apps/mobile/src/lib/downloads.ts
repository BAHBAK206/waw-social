import type { CaptionTrackDto, VideoDto } from '@qubedu/shared';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { api, fileUrl } from './api';
import { useSession } from './session';

/** A lesson saved on this phone: the video file, its cover, captions (with the transcript) and the lesson details. */
export interface SavedLesson {
  video: VideoDto;
  file: string;
  thumb: string | null;
  captions: CaptionTrackDto[];
  size: number;
  savedAt: number;
  userId: string;
}

interface DownloadsState {
  loaded: boolean;
  saved: Record<string, SavedLesson>;
  /** 0..1 for downloads in progress (-1 when the size is unknown). */
  progress: Record<string, number>;
}

export const useDownloads = create<DownloadsState>(() => ({ loaded: false, saved: {}, progress: {} }));

const root = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(root(), 'index.json');
const aborts = new Map<string, AbortController>();

function ensureRoot() {
  const dir = root();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function loadDownloads() {
  if (useDownloads.getState().loaded) return;
  let saved: Record<string, SavedLesson> = {};
  try {
    const f = indexFile();
    if (f.exists) saved = JSON.parse(await f.text()) as Record<string, SavedLesson>;
    // Drop entries whose file was removed by the system (storage cleanup).
    saved = Object.fromEntries(Object.entries(saved).filter(([, s]) => new File(s.file).exists));
  } catch {
    saved = {};
  }
  useDownloads.setState({ loaded: true, saved });
}

function persist(saved: Record<string, SavedLesson>) {
  useDownloads.setState({ saved });
  try {
    ensureRoot();
    indexFile().write(JSON.stringify(saved));
  } catch {
    /* the index is rebuilt from what is on disk next time */
  }
}

const ext = (url: string, fallback: string) => /\.(\w{2,4})(?:\?|$)/.exec(url)?.[1]?.toLowerCase() ?? fallback;

/** Saves a lesson for offline viewing. Resolves when done; rejects on failure or cancel. */
export async function downloadLesson(video: VideoDto): Promise<void> {
  await loadDownloads();
  const userId = useSession.getState().me?.id;
  if (!userId || aborts.has(video.id)) return;
  const dir = ensureRoot();
  const ctrl = new AbortController();
  aborts.set(video.id, ctrl);
  const setProgress = (p: number | null) =>
    useDownloads.setState((s) => {
      const progress = { ...s.progress };
      if (p === null) delete progress[video.id];
      else progress[video.id] = p;
      return { progress };
    });
  setProgress(0);
  const target = new File(dir, `${video.id}.${ext(video.videoUrl, 'mp4')}`);
  try {
    // The original file (one progressive file plays without a connection; the adaptive stream needs one).
    const file = await File.downloadFileAsync(fileUrl(video.videoUrl)!, target, {
      idempotent: true,
      signal: ctrl.signal,
      onProgress: ({ bytesWritten, totalBytes }) => setProgress(totalBytes > 0 ? bytesWritten / totalBytes : -1),
    });
    let thumb: string | null = null;
    if (video.thumbnailUrl) {
      try {
        thumb = (
          await File.downloadFileAsync(fileUrl(video.thumbnailUrl)!, new File(dir, `${video.id}-cover.${ext(video.thumbnailUrl, 'jpg')}`), { idempotent: true })
        ).uri;
      } catch {
        thumb = null;
      }
    }
    const captions = await api.videos
      .captions(video.id)
      .then((r) => r.items)
      .catch(() => []);
    persist({ ...useDownloads.getState().saved, [video.id]: { video, file: file.uri, thumb, captions, size: file.size ?? 0, savedAt: Date.now(), userId } });
  } catch (err) {
    try {
      if (target.exists) target.delete();
    } catch {
      /* nothing to clean */
    }
    throw err;
  } finally {
    aborts.delete(video.id);
    setProgress(null);
  }
}

export function cancelDownload(id: string) {
  aborts.get(id)?.abort();
}

function deleteFiles(s: SavedLesson) {
  for (const uri of [s.file, s.thumb]) {
    if (!uri) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      /* already gone */
    }
  }
}

export async function removeDownload(id: string) {
  await loadDownloads();
  const { [id]: gone, ...rest } = useDownloads.getState().saved;
  if (gone) deleteFiles(gone);
  persist(rest);
}

/** Another person signed in on this phone: their lessons are not shown and the previous person's are removed. */
export async function keepOnlyFor(userId: string) {
  await loadDownloads();
  const saved = useDownloads.getState().saved;
  const others = Object.values(saved).filter((s) => s.userId !== userId);
  if (!others.length) return;
  others.forEach(deleteFiles);
  persist(Object.fromEntries(Object.entries(saved).filter(([, s]) => s.userId === userId)));
}

export async function removeAllDownloads() {
  await loadDownloads();
  Object.values(useDownloads.getState().saved).forEach(deleteFiles);
  persist({});
}

/** Updates the saved copy's details (title, progress) when the lesson is opened online. */
export function refreshSavedLesson(video: VideoDto) {
  const s = useDownloads.getState().saved[video.id];
  if (s) persist({ ...useDownloads.getState().saved, [video.id]: { ...s, video } });
}

export function useSavedLesson(id: string | undefined): SavedLesson | null {
  const userId = useSession((s) => s.me?.id);
  return useDownloads((s) => {
    const x = id ? s.saved[id] : undefined;
    return x && x.userId === userId ? x : null;
  });
}
