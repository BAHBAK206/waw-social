import type { Me } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Clock, Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

/** Teacher accounts: ask the administrators to verify you (unlocks the public catalog, open classes, verified answers). */
export function TeacherVerification({ me }: { me: Me }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['teacher-verification'], queryFn: () => api.me.teacherVerification(), enabled: me.accountType === 'teacher' });
  const [f, setF] = useState({ institution: me.institution ?? '', subject: '', note: '', proofUrl: '' });
  const [busy, setBusy] = useState(false);
  if (me.accountType !== 'teacher' || !q.data) return null;
  const r = q.data.request;
  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-black">{tr.t('verification.title')}</h2>
      {q.data.verified ? (
        <p className="flex items-center gap-2 font-bold text-ok">
          <BadgeCheck className="size-5" aria-hidden /> {tr.t('verification.verified')}
        </p>
      ) : r?.status === 'pending' ? (
        <p className="flex items-center gap-2">
          <Clock className="size-5 text-warn" aria-hidden /> {tr.t('verification.pending')}
        </p>
      ) : (
        <>
          <p className="muted text-sm">{tr.t('verification.hint')}</p>
          {r?.status === 'rejected' && (
            <p className="rounded-[var(--radius-control)] bg-soft p-3 text-sm">{tr.t('verification.rejected', { reason: r.reason || '—' })}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={tr.t('verification.institution')}
              value={f.institution}
              maxLength={160}
              onChange={(e) => setF({ ...f, institution: e.target.value })}
            />
            <Input label={tr.t('verification.subject')} value={f.subject} maxLength={120} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </div>
          <Input
            type="url"
            dir="ltr"
            label={tr.t('verification.proofUrl')}
            hint={tr.t('verification.proofHint')}
            value={f.proofUrl}
            onChange={(e) => setF({ ...f, proofUrl: e.target.value })}
          />
          <Textarea label={tr.t('verification.note')} value={f.note} maxLength={1000} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Button
            icon={<Send className="size-4" />}
            loading={busy}
            disabled={f.institution.trim().length < 2 || f.subject.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                await api.me.requestVerification({
                  institution: f.institution.trim(),
                  subject: f.subject.trim(),
                  note: f.note.trim(),
                  proofUrl: f.proofUrl.trim() || null,
                });
                toast(tr.t('verification.sent'));
                await q.refetch();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('verification.send')}
          </Button>
        </>
      )}
      <p className="muted text-xs">{tr.t('verification.unlocks')}</p>
    </section>
  );
}
