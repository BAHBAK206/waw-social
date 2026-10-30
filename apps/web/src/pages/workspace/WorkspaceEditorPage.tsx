import type { WorkspaceFileDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Check, Download, Loader2, Pencil, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Whiteboard, type Stroke, type WhiteboardHandle } from '@/components/common/Whiteboard';
import { Menu } from '@/components/ui/Menu';
import { ErrorState, Spinner } from '@/components/ui/States';
import { ApiError } from '@qubedu/api-client';
import { api, sendOnHide } from '@/lib/api';
import { useFeatureOn } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { promptDialog, toastError } from '@/lib/ui';
import { DocEditor } from './DocEditor';
import { emptyBoard, emptySheet, emptySlides, type BoardContent, type SheetContent, type SlideContent } from './docs';
import { exportFile, type ExportFormat } from './exporters';
import { SheetEditor } from './SheetEditor';
import { SlidesEditor } from './SlidesEditor';

type Content = { html: string } | SheetContent | SlideContent | BoardContent;

function initial(file: WorkspaceFileDto): Content {
  const c = file.content as Partial<Content> | null | undefined;
  switch (file.kind) {
    case 'doc':
      return { html: (c as { html?: string } | null)?.html ?? '<p></p>' };
    case 'sheet':
      return { ...emptySheet(), ...(c as Partial<SheetContent> | null) };
    case 'slides':
      return (c as SlideContent | null)?.slides?.length ? (c as SlideContent) : emptySlides();
    case 'whiteboard':
      return { ...emptyBoard(), ...(c as Partial<BoardContent> | null) };
  }
}

const FORMATS: Record<WorkspaceFileDto['kind'], ExportFormat[]> = {
  doc: ['docx', 'html', 'txt', 'pdf'],
  sheet: ['xlsx', 'csv'],
  slides: ['pptx', 'pdf'],
  whiteboard: ['png'],
};

export default function WorkspaceEditorPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const exportOn = useFeatureOn('workspace-export');
  const q = useQuery({ queryKey: ['workspace-file', id], queryFn: () => api.workspace.file(id), staleTime: 0, gcTime: 0 });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<Content | null>(null);
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'conflict' | 'error'>('saved');
  const version = useRef(0);
  const dirty = useRef<{ title?: string; content?: Content }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef(false);
  const conflict = useRef(false);
  const doc = useRef<Editor | null>(null);
  const board = useRef<WhiteboardHandle>(null);

  useEffect(() => {
    if (!q.data) return;
    setTitle(q.data.title);
    setContent(initial(q.data));
    version.current = q.data.version;
    document.title = `${q.data.title} · Qubedu`;
  }, [q.data]);

  const flush = useCallback(async () => {
    if (inflight.current) return;
    const pending = dirty.current;
    if (pending.title === undefined && pending.content === undefined) return;
    dirty.current = {};
    inflight.current = true;
    setState('saving');
    try {
      const res = await api.workspace.updateFile(id, { version: version.current, ...pending });
      version.current = res.version;
      void qc.invalidateQueries({ queryKey: qk.workspace });
      setState(dirty.current.title !== undefined || dirty.current.content !== undefined ? 'dirty' : 'saved');
    } catch (e) {
      dirty.current = { ...pending, ...dirty.current };
      conflict.current = e instanceof ApiError && (e.code === 'version_conflict' || e.status === 409);
      setState(conflict.current ? 'conflict' : 'error');
    } finally {
      inflight.current = false;
      if (dirty.current.title !== undefined || dirty.current.content !== undefined) {
        // keep saving edits made while the request was in flight
        if (!conflict.current) {
          setState('dirty');
          timer.current = setTimeout(() => void flush(), 800);
        }
      }
    }
  }, [id, qc]);

  const schedule = useCallback(() => {
    if (conflict.current) return;
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  const change = useCallback(
    (c: Content) => {
      setContent(c);
      dirty.current.content = c;
      schedule();
    },
    [schedule],
  );

  // Save on leaving the page / tab.
  useEffect(() => {
    // On tab close/reload a normal request would be cancelled, so send the pending edit with keepalive instead.
    const onPageHide = () => {
      const pending = dirty.current;
      if (pending.title === undefined && pending.content === undefined) return;
      if (conflict.current || inflight.current) return;
      sendOnHide('PATCH', `/workspace/files/${id}`, { version: version.current, ...pending });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    const warn = (e: BeforeUnloadEvent) => {
      // Pending edits are sent on pagehide; only warn when they cannot be saved (version conflict).
      if (conflict.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', warn);
      clearTimeout(timer.current);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (q.isPending || !content) return q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Spinner className="py-24" />;
  const file = q.data!;
  const stateLabel = {
    saved: tr.t('workspace.savedState'),
    saving: tr.t('workspace.savingState'),
    dirty: tr.t('workspace.savingState'),
    conflict: tr.t('workspace.conflict'),
    error: tr.t('common.errorGeneric'),
  }[state];

  return (
    <div className="page !max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/workspace" className="icon-btn" aria-label={tr.t('common.back')}>
          <ArrowLeft className="size-5 flip-rtl" />
        </Link>
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-2 text-start"
          onClick={async () => {
            const t = await promptDialog({ title: tr.t('common.rename'), input: { label: tr.t('common.title'), defaultValue: title } });
            if (t) {
              setTitle(t);
              dirty.current.title = t;
              schedule();
            }
          }}
        >
          <h1 className="truncate text-2xl font-black" dir="auto">
            {title}
          </h1>
          <Pencil className="size-4 opacity-0 group-hover:opacity-60" aria-hidden />
        </button>
        <span className={`flex items-center gap-1 text-sm ${state === 'conflict' || state === 'error' ? 'text-err' : 'muted'}`} role="status">
          {state === 'saving' || state === 'dirty' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state === 'saved' ? (
            <Check className="size-4 text-ok" />
          ) : (
            <TriangleAlert className="size-4" />
          )}
          {stateLabel}
        </span>
        {exportOn && (
          <Menu
            label={tr.t('workspace.exportAs')}
            trigger={<Download className="size-5" />}
            items={FORMATS[file.kind].map((f) => ({
              label: `${tr.t('workspace.exportAs')} ${f.toUpperCase()}`,
              onSelect: async () => {
                try {
                  await exportFile(f, { title, content, editor: doc.current, board: board.current });
                } catch (e) {
                  toastError(e);
                }
              },
            }))}
          />
        )}
      </div>
      {state === 'conflict' && (
        <button type="button" className="btn btn-outline mb-4" onClick={() => location.reload()}>
          {tr.t('pwa.reload')}
        </button>
      )}
      {file.kind === 'doc' && <DocEditor html={(content as { html: string }).html} onChange={(html) => change({ html })} onReady={(e) => (doc.current = e)} />}
      {file.kind === 'sheet' && <SheetEditor value={content as SheetContent} onChange={change} />}
      {file.kind === 'slides' && <SlidesEditor value={content as SlideContent} onChange={change} />}
      {file.kind === 'whiteboard' && (
        <Whiteboard
          ref={board}
          strokes={(content as BoardContent).strokes as Stroke[]}
          onStroke={(s) => change({ strokes: [...(content as BoardContent).strokes, s] })}
          onReplace={(strokes) => change({ strokes })}
        />
      )}
    </div>
  );
}
