import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError, useUi } from '@/lib/ui';

type TargetType = 'user' | 'post' | 'comment' | 'message' | 'group' | 'form' | 'library' | 'video' | 'video_comment' | 'story' | 'event';
const REASONS = ['spam', 'abuse', 'inappropriate', 'impersonation', 'copyright', 'other'] as const;

interface Target {
  targetType: TargetType;
  targetId: string;
}

/** Opens the report dialog from anywhere: `reportContent({ targetType: 'post', targetId })`. */
export function reportContent(target: Target) {
  useUi.getState().set({ report: target });
}

export function ReportHost() {
  const target = useUi((s) => s.report);
  const tr = useT();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    useUi.getState().set({ report: null });
    setDetails('');
  };
  if (!target) return null;
  return (
    <Modal
      open
      size="sm"
      onClose={close}
      title={tr.t('common.report')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.report({ ...target, reason, details: details.trim() || undefined });
                toast(tr.t('report.sent'));
                close();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr.t('common.report')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label={tr.t('admin.reports.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          options={REASONS.map((r) => ({ value: r, label: tr.tDyn(`report.reasons.${r}`, undefined, r) }))}
        />
        <Textarea label={tr.t('common.description')} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
      </div>
    </Modal>
  );
}
