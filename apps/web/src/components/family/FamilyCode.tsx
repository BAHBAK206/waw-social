import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

/** For students: create a one-time code for a parent, and see / remove parents who follow you. */
export function FamilyCode() {
  const tr = useT();
  const qc = useQueryClient();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('family.studentTitle')}</h2>
      <p className="muted text-sm">{tr.t('family.studentHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="soft"
          icon={<KeyRound className="size-4" />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setCode((await api.family.code()).code);
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('family.makeCode')}
        </Button>
        {code && (
          <p className="text-lg font-black" aria-live="polite">
            {tr.t('family.codeIs', { code: '' })}
            <span className="rounded-lg bg-soft px-2 py-1 font-mono tracking-[0.3em]" dir="ltr">
              {code}
            </span>
          </p>
        )}
      </div>
      {fam.data && !fam.data.guardians.length && <p className="muted text-sm">{tr.t('family.noGuardians')}</p>}
      <ul className="space-y-2">
        {fam.data?.guardians.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <Avatar name={g.displayName} url={g.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1" dir="auto">
              {g.displayName}
            </span>
            <IconButton
              size="sm"
              label={tr.t('family.remove')}
              onClick={async () => {
                try {
                  await api.family.unlink(g.id);
                  await qc.invalidateQueries({ queryKey: ['family'] });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
