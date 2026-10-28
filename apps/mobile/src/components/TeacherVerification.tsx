import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

/** Teacher accounts: ask the administrators to verify you. */
export function TeacherVerificationCard() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: ['teacher-verification'], queryFn: () => api.me.teacherVerification(), enabled: me.accountType === 'teacher' });
  const [f, setF] = useState({ institution: me.institution ?? '', subject: '', note: '', proofUrl: '' });
  const [busy, setBusy] = useState(false);
  if (me.accountType !== 'teacher' || !q.data) return null;
  const r = q.data.request;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('verification.title')}</Text>
      {q.data.verified ? (
        <Badge tone="ok" icon="school" label={tr.t('verification.verified')} />
      ) : r?.status === 'pending' ? (
        <Badge tone="warn" icon="time-outline" label={tr.t('verification.pending')} />
      ) : (
        <>
          <Text muted size={13}>
            {tr.t('verification.hint')}
          </Text>
          {r?.status === 'rejected' ? (
            <Text size={13} style={{ backgroundColor: t.primarySoft, padding: 10, borderRadius: 10 }}>
              {tr.t('verification.rejected', { reason: r.reason || '—' })}
            </Text>
          ) : null}
          <Input label={tr.t('verification.institution')} value={f.institution} maxLength={160} onChangeText={(v) => setF({ ...f, institution: v })} />
          <Input label={tr.t('verification.subject')} value={f.subject} maxLength={120} onChangeText={(v) => setF({ ...f, subject: v })} />
          <Input
            label={tr.t('verification.proofUrl')}
            value={f.proofUrl}
            onChangeText={(v) => setF({ ...f, proofUrl: v })}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text muted size={12}>
            {tr.t('verification.proofHint')}
          </Text>
          <Input label={tr.t('verification.note')} value={f.note} maxLength={1000} onChangeText={(v) => setF({ ...f, note: v })} multiline />
          <Button
            icon="send-outline"
            title={tr.t('verification.send')}
            loading={busy}
            disabled={f.institution.trim().length < 2 || f.subject.trim().length < 2}
            onPress={async () => {
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
          />
        </>
      )}
      <Text muted size={12}>
        {tr.t('verification.unlocks')}
      </Text>
    </Card>
  );
}
