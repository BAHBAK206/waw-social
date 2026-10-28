import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChildReport, confirmUnlink, FamilyCodeCard, RiskBadge } from '@/components/Family';
import { FamilyRequestsCard, InviteParentCard, MyControlsCard, RequestChildCard } from '@/components/Linking';
import { FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';
import { GuideHint } from '@/components/Guide';

export default function FamilyScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const params = useLocalSearchParams<{ child?: string }>();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const [picked, setPicked] = useState<string | null>(params.child ?? null);
  const selected = picked ?? fam.data?.children[0]?.id ?? null;
  const report = useQuery({ queryKey: ['family-child', selected], queryFn: () => api.family.child(selected!), enabled: !!selected });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const parent = me.accountType === 'parent';
  if (fam.isPending) return <Loading />;
  if (fam.error) return <ErrorView onRetry={() => void fam.refetch()} />;
  return (
    <FeatureGate id="family">
      <Screen refreshing={fam.isRefetching} onRefresh={() => void Promise.all([fam.refetch(), report.refetch()])}>
        <GuideHint id="family" />
        <Text muted>{tr.t('family.subtitle')}</Text>
        <FamilyRequestsCard />
        {me.accountType === 'student' ? (
          <>
            <MyControlsCard />
            <FamilyCodeCard />
            <InviteParentCard />
          </>
        ) : null}
        {parent && (
          <Card style={{ gap: 8 }}>
            <Text weight="black">{tr.t('family.linkTitle')}</Text>
            <Text muted size={13}>
              {tr.t('family.linkHint')}
            </Text>
            <Input
              label={tr.t('family.code')}
              value={code}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              onChangeText={(v) => setCode(v.toUpperCase())}
            />
            <Button
              title={tr.t('family.link')}
              icon="link-outline"
              loading={busy}
              disabled={code.trim().length !== 8}
              onPress={async () => {
                setBusy(true);
                try {
                  const res = await api.family.link(code.trim());
                  toast(
                    res.held
                      ? tr.t('family.heldForParent', { name: res.child?.displayName ?? '' })
                      : tr.t('family.linked', { name: res.child?.displayName ?? '' }),
                  );
                  setCode('');
                  await qc.invalidateQueries({ queryKey: ['family'] });
                  if (res.child) setPicked(res.child.id);
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Card>
        )}
        {parent && !fam.data.children.length && <Empty icon="people-outline" title={tr.t('family.noChildren')} />}
        {parent && fam.data.children.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {fam.data.children.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setPicked(c.id)}
                onLongPress={async () => {
                  if (!(await confirmUnlink(c.displayName))) return;
                  try {
                    await api.family.unlink(c.id);
                    setPicked(null);
                    await qc.invalidateQueries({ queryKey: ['family'] });
                  } catch (e) {
                    toastError(e);
                  }
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: selected === c.id }}
                accessibilityHint={tr.t('family.unlink')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: selected === c.id ? t.primary : t.border,
                  backgroundColor: selected === c.id ? t.primarySoft : t.card,
                }}
              >
                <Avatar name={c.displayName} url={c.avatarUrl} size={32} />
                <View>
                  <Text weight="bold" size={14}>
                    {c.displayName}
                  </Text>
                  <Text muted size={11}>
                    {tr.t('family.thisWeek', { minutes: c.minutesThisWeek })}
                  </Text>
                </View>
                <RiskBadge level={c.risk} />
              </Pressable>
            ))}
          </ScrollView>
        )}
        {parent ? <RequestChildCard /> : null}
        {parent && selected ? report.isPending ? <Loading /> : report.data ? <ChildReport report={report.data} /> : null : null}
      </Screen>
    </FeatureGate>
  );
}
