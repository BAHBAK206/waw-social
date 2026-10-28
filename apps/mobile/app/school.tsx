import type { CourseDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AtRiskList } from '@/components/Family';
import { Screen } from '@/components/Screen';
import { Badge, FeatureGate, Sheet } from '@/components/kit';
import { Button, Card, Empty, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';
import { GuideHint } from '@/components/Guide';

export default function SchoolScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: ['courses'], queryFn: () => api.school.courses() });
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ title: '', subject: '', description: '' });
  const [busy, setBusy] = useState(false);
  return (
    <FeatureGate id="school">
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <GuideHint id="school" />
        <Text muted>{tr.t('school.subtitle')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button icon="enter-outline" title={tr.t('school.join')} onPress={() => setJoining(true)} />
          </View>
          {me.accountType === 'teacher' && <Button icon="add" variant="outline" title={tr.t('school.create')} onPress={() => setCreating(true)} />}
        </View>
        {me.accountType === 'teacher' && <AtRiskList />}
        {q.isPending ? (
          <Loading />
        ) : !q.data?.items.length ? (
          <Empty icon="easel-outline" title={tr.t('school.empty')} body={tr.t('school.codeHint')} />
        ) : (
          q.data.items.map((c: CourseDto) => (
            <Card
              key={c.id}
              onPress={() => router.push(`/course/${c.id}` as never)}
              style={{ gap: 6, borderTopWidth: 4, borderTopColor: c.color ?? t.primary }}
            >
              <Text weight="black" size={17}>
                {c.title}
              </Text>
              {c.subject ? <Text muted>{c.subject}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {c.myRole && <Badge tone="primary" label={tr.t(`school.roles.${c.myRole}`)} />}
                <Badge label={`${c.owner.displayName} · ${tr.t('groups.members', { count: c.memberCount })}`} />
              </View>
            </Card>
          ))
        )}
        <Sheet
          open={joining}
          onClose={() => setJoining(false)}
          title={tr.t('school.join')}
          footer={
            <Button
              title={tr.t('school.join')}
              loading={busy}
              disabled={code.trim().length < 4}
              onPress={async () => {
                setBusy(true);
                try {
                  // A class code, or a voucher for a paid course (QB-XXXX-XXXX).
                  const c = /^QB-/i.test(code.trim()) ? await api.school.redeem(code.trim()) : await api.school.join(code.trim());
                  setJoining(false);
                  setCode('');
                  await q.refetch();
                  router.push(`/course/${c.id}` as never);
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          }
        >
          <Input label={tr.t('school.code')} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} />
          <Text muted size={12}>
            {tr.t('school.codeHint')}
          </Text>
        </Sheet>
        <Sheet
          open={creating}
          onClose={() => setCreating(false)}
          title={tr.t('school.create')}
          footer={
            <Button
              title={tr.t('common.create')}
              loading={busy}
              disabled={!form.title.trim()}
              onPress={async () => {
                setBusy(true);
                try {
                  const c = await api.school.create({ title: form.title.trim(), subject: form.subject.trim() || null, description: form.description.trim() });
                  setCreating(false);
                  setForm({ title: '', subject: '', description: '' });
                  await q.refetch();
                  router.push(`/course/${c.id}` as never);
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          }
        >
          <Input label={tr.t('common.title')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
          <Input label={tr.t('academic.subject')} value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} />
          <Input label={tr.t('common.description')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        </Sheet>
      </Screen>
    </FeatureGate>
  );
}
