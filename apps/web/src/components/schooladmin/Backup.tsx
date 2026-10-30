import type { SchoolDto } from '@qubedu/shared';
import { Archive } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** One click: a ZIP with everything the school keeps in Qubedu. */
export function SchoolBackup({ school }: { school: SchoolDto }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-2 p-4">
      <h3 className="flex items-center gap-2 font-black">
        <Archive className="size-4" aria-hidden /> {tr.t('ops.export.title')}
      </h3>
      <p className="muted text-sm">{tr.t('ops.export.hint')}</p>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api.schools.exportAll(school.id);
            downloadBlob(await res.blob(), `qubedu-${school.name.replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.zip`);
            toast(tr.t('ops.export.done'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? tr.t('ops.export.busy') : tr.t('ops.export.button')}
      </Button>
      <p className="muted text-xs">{tr.t('ops.export.note')}</p>
    </section>
  );
}
