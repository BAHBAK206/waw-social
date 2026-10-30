import { STAGES, type ChildReportDto, type GradeLevel, type ParentalControls, type Stage } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { SelectField, SwitchRow } from './kit';
import { Avatar, Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

/** School year picker grouped by stage. */
export function GradeLevelField({ value, onChange, label }: { value: GradeLevel | ''; onChange: (v: GradeLevel | '') => void; label?: string }) {
  const tr = useT();
  return (
    <SelectField
      label={label ?? tr.t('stages.label')}
      value={value}
      placeholder="—"
      onChange={onChange}
      options={(Object.keys(STAGES) as Stage[]).flatMap((s) =>
        STAGES[s].map((g) => ({ value: g, label: tr.t(`stages.grades.${g}`), group: tr.t(`stages.groups.${s}`) })),
      )}
    />
  );
}

export function InviteParentCard() {
  const tr = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('family.inviteTitle')}</Text>
      <Text muted size={13}>
        {tr.t('family.inviteHint')}
      </Text>
      <Input label={tr.t('family.parentEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button
        small
        icon="send-outline"
        title={tr.t('family.send')}
        loading={busy}
        disabled={!/.+@.+\..+/.test(email)}
        onPress={async () => {
          setBusy(true);
          try {
            await api.family.invite(email.trim());
            toast(tr.t('family.inviteSent'));
            setEmail('');
            await qc.invalidateQueries({ queryKey: ['family'] });
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

export function RequestChildCard() {
  const tr = useT();
  const qc = useQueryClient();
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('family.requestTitle')}</Text>
      <Text muted size={13}>
        {tr.t('family.requestHint')}
      </Text>
      <Input label={tr.t('family.who')} value={who} onChangeText={setWho} autoCapitalize="none" />
      <Button
        small
        icon="mail-outline"
        title={tr.t('family.send')}
        loading={busy}
        disabled={who.trim().length < 3}
        onPress={async () => {
          setBusy(true);
          try {
            await api.family.request(who.trim());
            toast(tr.t('family.requestSent'));
            setWho('');
            await qc.invalidateQueries({ queryKey: ['family'] });
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

export function FamilyRequestsCard() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const items = fam.data?.requests ?? [];
  if (!items.length) return null;
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['family'] });
      useSession.getState().setMe(await api.me.get());
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('family.requests')}</Text>
      {items.map((r) => {
        const name = r.person?.displayName ?? r.email ?? '';
        const text = r.child
          ? tr.t('family.approveParent', { name, child: r.child.displayName })
          : r.awaitingGuardian
            ? tr.t('family.waitingParent', { name })
            : r.direction === 'outgoing'
              ? tr.t('family.outgoing', { name })
              : me.accountType === 'parent'
                ? tr.t('family.incomingChild', { name })
                : tr.t('family.incoming', { name });
        return (
          <View key={r.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.person ? <Avatar name={r.person.displayName} url={r.person.avatarUrl} size={30} /> : null}
              <Text style={{ flex: 1 }} size={14}>
                {text}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {r.direction === 'incoming' ? (
                <Button
                  small
                  icon="checkmark"
                  title={tr.t('family.accept')}
                  onPress={() =>
                    void act(async () => {
                      const res = await api.family.acceptRequest(r.id);
                      toast(res.held ? tr.t('family.heldForParent', { name }) : tr.t('family.linked', { name }));
                    })
                  }
                />
              ) : null}
              <Button
                small
                variant="ghost"
                icon="close"
                title={r.direction === 'incoming' ? tr.t('family.decline') : tr.t('family.cancel')}
                onPress={() => void act(() => api.family.removeRequest(r.id))}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export function MyControlsCard() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me)!;
  if (me.ageTier === 'adult') return null;
  const c = me.parentalControls;
  const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text size={13} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text size={13} weight="bold" color={ok === undefined ? undefined : ok ? t.ok : t.err}>
        {value}
      </Text>
    </View>
  );
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('family.myControls')}</Text>
      {me.ageTier === 'child' && !me.guardianCount ? (
        <Text muted size={13}>
          {tr.t('family.myControlsDefault')}
        </Text>
      ) : null}
      <Row
        label={tr.t('family.controls.messages')}
        value={c.messages === 'classes' ? tr.t('family.controls.messagesClasses') : tr.t('family.controls.messagesKnown')}
      />
      {(['publicPosts', 'joinGroups', 'ai', 'aiHints'] as const).map((k) => (
        <Row key={k} label={tr.t(`family.controls.${k}`)} value={c[k] ? tr.t('family.on') : tr.t('family.off')} ok={c[k]} />
      ))}
      <Text muted size={11}>
        {tr.t('family.controls.never')}
      </Text>
    </Card>
  );
}

/** Parent: what a child under 18 can do, plus their school year. */
export function ControlsEditorCard({ report }: { report: ChildReportDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [c, setC] = useState<ParentalControls>(report.controls);
  const [grade, setGrade] = useState<GradeLevel | ''>(report.gradeLevel ?? '');
  const [busy, setBusy] = useState(false);
  if (report.ageTier === 'adult') return null;
  const name = report.child.displayName;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('family.controls.title', { name })}</Text>
      <Text muted size={13}>
        {tr.t('family.controls.hint')}
      </Text>
      <SelectField
        label={tr.t('family.controls.messages')}
        value={c.messages}
        onChange={(v) => v && setC({ ...c, messages: v })}
        options={[
          { value: 'classes' as const, label: tr.t('family.controls.messagesClasses') },
          { value: 'known' as const, label: tr.t('family.controls.messagesKnown') },
        ]}
      />
      {(['publicPosts', 'joinGroups', 'ai', 'aiHints'] as const).map((k) => (
        <SwitchRow key={k} label={tr.t(`family.controls.${k}`)} value={c[k]} onChange={(v) => setC({ ...c, [k]: v })} />
      ))}
      <GradeLevelField label={tr.t('family.controls.gradeLevel')} value={grade} onChange={setGrade} />
      <Text muted size={11}>
        {tr.t('family.controls.never')}
      </Text>
      <Button
        title={tr.t('common.save')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const r = await api.family.setControls(report.child.id, { ...c, ...(grade ? { gradeLevel: grade } : {}) });
            setC(r.controls);
            toast(tr.t('family.controls.saved', { name }));
            await qc.invalidateQueries({ queryKey: ['family-child', report.child.id] });
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text muted size={12}>
        {tr.t('family.limits')}
      </Text>
    </Card>
  );
}
