import type { ComplaintDto, SchoolDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

function Row({ schoolId, c }: { schoolId: string; c: ComplaintDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [status, setStatus] = useState(c.status);
  const [reply, setReply] = useState(c.reply ?? '');
  const save = useMutation({
    mutationFn: () => api.wellbeing.reviewComplaint(schoolId, c.id, { status, reply: reply.trim() || undefined }),
    onSuccess: () => {
      toast(tr.t('wellbeing.complaints.saved'));
      void qc.invalidateQueries({ queryKey: ['school', schoolId, 'complaints'] });
    },
    onError: toastError,
  });
  const urgent = c.category === 'safety' || c.category === 'harassment';
  return (
    <li className="card space-y-2 p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cx('badge', urgent ? 'badge-err' : 'badge-warn')}>{tr.t(`wellbeing.complaints.${c.category}`)}</span>
        <span className="badge">{tr.t(`wellbeing.complaints.${c.status}`)}</span>
        <span className="muted text-xs">{formatDate(c.createdAt, tr)}</span>
      </p>
      <p className="whitespace-pre-wrap" dir="auto">
        {c.text}
      </p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Select
          label={tr.t('wellbeing.complaints.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as ComplaintDto['status'])}
          options={(['new', 'seen', 'resolved'] as const).map((s) => ({ value: s, label: tr.t(`wellbeing.complaints.${s}`) }))}
        />
        <Textarea label={tr.t('wellbeing.complaints.reply')} rows={2} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        {tr.t('wellbeing.complaints.save')}
      </Button>
    </li>
  );
}

/** School supervisors read the anonymous complaints and answer them. */
export function SchoolComplaints({ school }: { school: SchoolDto }) {
  const tr = useT();
  const q = useQuery({ queryKey: ['school', school.id, 'complaints'], queryFn: () => api.wellbeing.complaints(school.id) });
  return (
    <div className="space-y-3">
      <p className="muted text-sm">{tr.t('wellbeing.complaints.hint')}</p>
      <QueryState query={q}>
        {(d) =>
          !d.items.length ? (
            <EmptyState title={tr.t('wellbeing.complaints.empty')} />
          ) : (
            <ul className="space-y-3">
              {d.items.map((c) => (
                <Row key={c.id} schoolId={school.id} c={c} />
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}
