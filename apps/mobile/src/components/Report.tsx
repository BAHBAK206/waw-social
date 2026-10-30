import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';
import { Sheet } from './kit';
import { Button, Chip, Input } from './ui';

export type ReportTargetType = 'user' | 'post' | 'comment' | 'message' | 'group' | 'form' | 'library' | 'video' | 'video_comment' | 'story' | 'event';
const REASONS = ['spam', 'abuse', 'inappropriate', 'impersonation', 'copyright', 'other'] as const;

interface Target {
  targetType: ReportTargetType;
  targetId: string;
}

const useReport = create<{ target: Target | null }>(() => ({ target: null }));

/** Opens the report sheet from anywhere (same reasons and rules as the website). */
export function reportContent(target: Target) {
  useReport.setState({ target });
}

/** A small flag button; hidden for guests. */
export function ReportButton({ targetType, targetId, size = 18 }: Target & { size?: number }) {
  const t = useTheme();
  const tr = useT();
  const authed = useSession((s) => s.status === 'authed');
  if (!authed) return null;
  return (
    <Pressable
      onPress={() => reportContent({ targetType, targetId })}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={tr.t('common.report')}
      style={{ padding: 4 }}
    >
      <Ionicons name="flag-outline" size={size} color={t.text3} />
    </Pressable>
  );
}

export function ReportHost() {
  const tr = useT();
  const target = useReport((s) => s.target);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    useReport.setState({ target: null });
    setDetails('');
    setReason('spam');
  };
  return (
    <Sheet
      open={!!target}
      onClose={close}
      title={tr.t('common.report')}
      footer={
        <Button
          title={tr.t('common.report')}
          variant="danger"
          loading={busy}
          onPress={async () => {
            if (!target) return;
            setBusy(true);
            try {
              const res = await api.report({ ...target, reason, details: details.trim() || undefined });
              toast(tr.t(res.hidden ? 'report.hidden' : 'report.sent'));
              close();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      {REASONS.map((r) => (
        <Chip key={r} label={tr.tDyn(`report.reasons.${r}`, undefined, r)} active={reason === r} onPress={() => setReason(r)} />
      ))}
      <Input label={tr.t('common.description')} value={details} onChangeText={setDetails} maxLength={1000} multiline />
    </Sheet>
  );
}
