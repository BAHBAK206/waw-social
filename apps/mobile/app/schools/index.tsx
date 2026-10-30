import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toastError } from '@/lib/ui';
import { openWebSignedIn } from '@/lib/web';

/** My schools and invitations; students and parents open the official report card from here. */
export default function SchoolsScreen() {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() });
  const kids = useQuery({ queryKey: ['family'], queryFn: () => api.family.get(), enabled: me?.accountType === 'parent' });
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['schools'] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const report = (schoolId: string, studentId: string) =>
    void act(`r${studentId}`, () => openWebSignedIn(`/schools/${schoolId}/report-cards?studentId=${studentId}`));
  return (
    <FeatureGate id="schools">
      <Stack.Screen options={{ title: tr.t('schools.title') }} />
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        {!q.data.items.length ? (
          <Empty icon="business-outline" title={tr.t('schools.empty')} body={q.data.canCreate ? tr.t('schools.createHint') : undefined} />
        ) : (
          q.data.items.map((s) => (
            <Card key={s.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text weight="black" style={{ flex: 1 }}>
                  {s.name}
                </Text>
                {s.myStatus === 'invited' ? <Badge tone="primary" label={tr.t('schools.invitedBadge')} /> : null}
              </View>
              <Text muted size={13}>
                {s.myRole ? tr.t(`schools.roles.${s.myRole}`) : ''}
              </Text>
              {s.myStatus === 'invited' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    small
                    title={tr.t('schools.accept')}
                    loading={busy === `a${s.id}`}
                    onPress={() => void act(`a${s.id}`, () => api.schools.accept(s.id))}
                  />
                  <Button
                    small
                    variant="outline"
                    title={tr.t('schools.decline')}
                    loading={busy === `d${s.id}`}
                    onPress={() => void act(`d${s.id}`, () => api.schools.leave(s.id))}
                  />
                </View>
              ) : s.myRole === 'admin' || s.myRole === 'teacher' ? (
                <Button small title={tr.t('common.open')} onPress={() => router.push(`/schools/${s.id}` as never)} />
              ) : s.myRole === 'student' ? (
                <Button
                  small
                  variant="soft"
                  icon="document-text-outline"
                  title={tr.t('schools.myReport')}
                  loading={busy === `r${me?.id}`}
                  onPress={() => report(s.id, me!.id)}
                />
              ) : (
                (kids.data?.children ?? []).map((k) => (
                  <Button
                    key={k.id}
                    small
                    variant="soft"
                    icon="document-text-outline"
                    title={tr.t('schools.childReport', { name: k.displayName })}
                    loading={busy === `r${k.id}`}
                    onPress={() => report(s.id, k.id)}
                  />
                ))
              )}
            </Card>
          ))
        )}
        {q.data.canCreate ? (
          <Text muted size={13}>
            {tr.t('schools.createHint')}
          </Text>
        ) : null}
      </Screen>
    </FeatureGate>
  );
}
