import type { WorkspaceFileDto, WorkspaceFolderDto, WorkspaceKind } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileSpreadsheet, FileText, Folder, FolderPlus, Home, Import, PenTool, Presentation, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { pickFile } from '@/components/ui/Upload';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useFeatureOn } from '@/lib/features';
import { confirmDialog, promptDialog, toastError } from '@/lib/ui';
import { docFromText } from './docs';

const KIND = {
  doc: { icon: FileText, cls: 'text-info' },
  sheet: { icon: FileSpreadsheet, cls: 'text-ok' },
  slides: { icon: Presentation, cls: 'text-warn' },
  whiteboard: { icon: PenTool, cls: 'text-ink' },
} as const;

export default function WorkspacePage() {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const importOn = useFeatureOn('workspace-import');
  const q = useQuery({ queryKey: qk.workspace, queryFn: () => api.workspace.list() });
  const [folderId, setFolderId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: qk.workspace });
  const create = async (kind: WorkspaceKind) => {
    try {
      const f = await api.workspace.createFile({ title: tr.t('common.untitled'), kind, folderId });
      await refresh();
      navigate(`/workspace/${f.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="page">
      <PageHeader title={tr.t('workspace.title')} subtitle={tr.t('workspace.subtitle')} icon={<FileText className="size-6" />} />
      <div className="mb-5 flex flex-wrap gap-2">
        {(['doc', 'sheet', 'slides', 'whiteboard'] as const).map((k) => {
          const I = KIND[k].icon;
          return (
            <Button key={k} variant="soft" icon={<I className="size-4" />} onClick={() => void create(k)}>
              {tr.t(`workspace.kinds.${k}`)}
            </Button>
          );
        })}
        <Button
          variant="outline"
          icon={<FolderPlus className="size-4" />}
          onClick={async () => {
            const name = await promptDialog({ title: tr.t('workspace.newFolder'), input: { label: tr.t('common.name') }, confirmLabel: tr.t('common.create') });
            if (!name) return;
            try {
              await api.workspace.createFolder(name, folderId);
              await refresh();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('workspace.newFolder')}
        </Button>
        {importOn && (
          <Button
            variant="outline"
            icon={<Import className="size-4" />}
            onClick={async () => {
              const file = await pickFile('.docx,.xlsx,.pptx,.pdf,.txt');
              if (!file) return;
              try {
                const res = await api.workspace.import(file, file.name);
                const f = await api.workspace.createFile({
                  title: res.title,
                  kind: 'doc',
                  folderId,
                  content: docFromText(res.chunks.length ? res.chunks.map((c) => (c.heading ? `${c.heading}\n${c.text}` : c.text)).join('\n\n') : res.text),
                });
                await refresh();
                navigate(`/workspace/${f.id}`);
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('workspace.import')}
          </Button>
        )}
      </div>
      <QueryState query={q}>
        {({ folders, files }) => {
          const byId = new Map(folders.map((f) => [f.id, f]));
          const trail: WorkspaceFolderDto[] = [];
          for (let cur = folderId ? byId.get(folderId) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) trail.unshift(cur);
          const subfolders = folders.filter((f) => f.parentId === folderId);
          const here = files.filter((f) => f.folderId === folderId);
          return (
            <>
              <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm" aria-label={tr.t('workspace.folder')}>
                <button type="button" className="link inline-flex items-center gap-1" onClick={() => setFolderId(null)}>
                  <Home className="size-4" /> {tr.t('workspace.root')}
                </button>
                {trail.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight className="size-4 text-fg-3 flip-rtl" />
                    <button type="button" className="link" onClick={() => setFolderId(f.id)}>
                      {f.name}
                    </button>
                  </span>
                ))}
              </nav>
              {!subfolders.length && !here.length ? (
                <EmptyState icon={<FileText className="size-7" />} title={tr.t('workspace.empty')} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {subfolders.map((f) => (
                    <div key={f.id} className="card group flex items-center gap-3 p-3">
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setFolderId(f.id)}>
                        <Folder className="size-8 shrink-0 text-warn" />
                        <span className="truncate font-bold">{f.name}</span>
                      </button>
                      <IconButton
                        label={tr.t('common.delete')}
                        size="sm"
                        onClick={async () => {
                          if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                          try {
                            await api.workspace.deleteFolder(f.id);
                            await refresh();
                          } catch (e) {
                            toastError(e);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  ))}
                  {here.map((f: WorkspaceFileDto) => {
                    const I = KIND[f.kind].icon;
                    return (
                      <div key={f.id} className="card flex items-center gap-3 p-3">
                        <Link to={`/workspace/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <I className={`size-8 shrink-0 ${KIND[f.kind].cls}`} />
                          <span className="min-w-0">
                            <span className="block truncate font-bold" dir="auto">
                              {f.title}
                            </span>
                            <span className="muted text-xs">{relativeTime(f.updatedAt, tr)}</span>
                          </span>
                        </Link>
                        <IconButton
                          label={tr.t('common.delete')}
                          size="sm"
                          onClick={async () => {
                            if (!(await confirmDialog({ title: tr.t('workspace.deleteFile'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                            try {
                              await api.workspace.deleteFile(f.id);
                              await refresh();
                            } catch (e) {
                              toastError(e);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
