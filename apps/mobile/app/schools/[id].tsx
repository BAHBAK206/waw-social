import { parseSchoolCsv, SCHOOL_ROLES, toCsv, type SchoolImportResultDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, FeatureGate, Segmented, pickDocument } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';
import { openWebSignedIn } from '@/lib/web';

type Tab = 'overview' | 'people' | 'classes' | 'reports';

export default function SchoolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['school', id], queryFn: () => api.schools.get(id!) });
  const [tab, setTab] = useState<Tab>('overview');
  const [role, setRole] = useState<string>('');
  const [term, setTerm] = useState('');
  const members = useQuery({
    queryKey: ['school-members', id, role, term],
    queryFn: () => api.schools.members(id!, { role: role || undefined, q: term || undefined }),
    enabled: tab === 'people',
  });
  const classes = useQuery({ queryKey: ['school-classes', id], queryFn: () => api.schools.classes(id!), enabled: tab === 'classes' });
  const [result, setResult] = useState<SchoolImportResultDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const s = q.data;
  const admin = s.myRole === 'admin';

  const importFile = async () => {
    const f = await pickDocument(['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel']);
    if (!f) return;
    const parsed = parseSchoolCsv(await new File(f.uri).text());
    const problems = parsed.errors
      .slice(0, 8)
      .map((e) => tr.t('schools.line', { line: e.line, reason: tr.t(`schools.reasons.${e.reason}` as never) }))
      .join('\n');
    Alert.alert(tr.t('schools.ready', { count: parsed.rows.length }), problems ? `${tr.t('schools.problems')}\n${problems}` : '', [
      { text: tr.t('common.cancel'), style: 'cancel' },
      {
        text: tr.t('schools.run'),
        onPress: async () => {
          if (!parsed.rows.length) return;
          setBusy('import');
          try {
            const r = await api.schools.importRows(s.id, parsed.rows.slice(0, 300));
            setResult(r);
            toast(tr.t('schools.done', { created: r.created.length, invited: r.invited }));
            await qc.invalidateQueries({ queryKey: ['school-members', s.id] });
            await qc.invalidateQueries({ queryKey: ['school', s.id] });
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };
  const shareCredentials = async () => {
    if (!result) return;
    const file = new File(Paths.cache, `school-accounts-${Date.now()}.csv`);
    file.write(
      `\uFEFF${toCsv([
        [tr.t('schools.name'), tr.t('schools.role'), tr.t('schools.section'), tr.t('schools.number'), tr.t('schools.login'), tr.t('schools.password')],
        ...result.created.map((c) => [c.name, tr.t(`schools.roles.${c.role}` as never), c.section ?? '', c.studentNumber ?? '', c.login, c.password]),
      ])}`,
    );
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  };

  return (
    <FeatureGate id="schools">
      <Stack.Screen options={{ title: s.name }} />
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Segmented
          tabs={(['overview', 'people', 'classes', 'reports'] as const).map((k) => ({ key: k, label: tr.t(`schools.tabs.${k}`) }))}
          value={tab}
          onChange={setTab}
        />
        {tab === 'overview' && (
          <Card style={{ gap: 6 }}>
            {(['students', 'teachers', 'parents', 'classes', 'invited'] as const).map((k) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text muted>{tr.t(`schools.stats.${k}`)}</Text>
                <Text weight="black">{k === 'teachers' ? s.counts.teachers + s.counts.admins : s.counts[k]}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {(admin
                ? (['dashboard', 'fees', 'news', 'timetable', 'surveys', 'complaints', 'plan'] as const)
                : (['news', 'timetable', 'surveys'] as const)
              ).map((k) => (
                <Button
                  key={k}
                  small
                  variant="soft"
                  title={tr.t(`schools.tabs.${k}`)}
                  loading={busy === k}
                  onPress={async () => {
                    setBusy(k);
                    try {
                      await openWebSignedIn(`/schools/${s.id}?tab=${k}`);
                    } catch (e) {
                      toastError(e);
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
              ))}
            </View>
          </Card>
        )}
        {tab === 'people' && (
          <View style={{ gap: 10 }}>
            {admin ? (
              <Card style={{ gap: 8 }}>
                <Text weight="black">{tr.t('schools.import')}</Text>
                <Text muted size={12}>
                  {tr.t('schools.importHint')}
                </Text>
                <Button icon="cloud-upload-outline" title={tr.t('schools.pick')} loading={busy === 'import'} onPress={() => void importFile()} />
                {result?.created.length ? (
                  <View style={{ gap: 6 }}>
                    <Text weight="bold" style={{ color: t.warn }}>
                      {tr.t('schools.credentialsHint')}
                    </Text>
                    <Button variant="outline" icon="share-outline" title={tr.t('schools.download')} onPress={() => void shareCredentials()} />
                    {result.created.slice(0, 30).map((c, i) => (
                      <Text key={i} size={12} selectable>
                        {c.name} · {c.login} · {c.password}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {result?.skipped.length ? (
                  <Text size={12} muted>
                    {tr.t('schools.skipped')}: {result.skipped.map((x) => `${x.name} (${tr.t(`schools.skip.${x.reason}` as never)})`).join(', ')}
                  </Text>
                ) : null}
              </Card>
            ) : null}
            <Segmented
              tabs={[{ key: '', label: tr.t('schools.allRoles') }, ...SCHOOL_ROLES.map((r) => ({ key: r, label: tr.t(`schools.roles.${r}`) }))]}
              value={role}
              onChange={setRole}
            />
            <Input placeholder={tr.t('schools.search')} value={term} onChangeText={setTerm} />
            {(members.data?.items ?? []).map((m) => (
              <Card key={m.user.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text weight="bold" style={{ flex: 1 }}>
                    {m.user.displayName}
                  </Text>
                  <Badge label={tr.t(`schools.roles.${m.role}`)} />
                  {m.status === 'invited' ? <Badge tone="primary" label={tr.t('schools.invitedBadge')} /> : null}
                </View>
                <Text muted size={12}>
                  {[m.section, m.studentNumber, m.user.email].filter(Boolean).join(' · ')}
                </Text>
                {admin && m.managed && m.role !== 'admin' ? (
                  <Button
                    small
                    variant="ghost"
                    icon="key-outline"
                    title={tr.t('schools.resetPassword')}
                    onPress={async () => {
                      try {
                        const r = await api.schools.resetPassword(s.id, m.user.id);
                        Alert.alert(
                          tr.t('schools.resetPassword'),
                          tr.t('schools.resetDone', { name: m.user.displayName, password: r.password, login: r.login }),
                        );
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  />
                ) : null}
              </Card>
            ))}
          </View>
        )}
        {tab === 'classes' &&
          (classes.data?.items.length ? (
            classes.data.items.map((c) => (
              <Card key={c.id} style={{ gap: 4 }}>
                <Text weight="black">
                  {c.title}
                  {c.subjectCode ? ` (${c.subjectCode})` : ''}
                </Text>
                <Text muted size={13}>
                  {c.section} · {c.teacher.displayName} · {tr.t('schools.members', { count: Math.max(0, c.memberCount - 1) })}
                </Text>
              </Card>
            ))
          ) : (
            <Text muted>{tr.t('schools.noClasses')}</Text>
          ))}
        {tab === 'reports' && (
          <Card style={{ gap: 8 }}>
            <Text muted size={13}>
              {tr.t('schools.reportsHint')}
            </Text>
            {s.sections.map((sec) => (
              <Button
                key={sec}
                variant="outline"
                icon="print-outline"
                title={`${tr.t('schools.section')} ${sec}`}
                loading={busy === sec}
                onPress={async () => {
                  setBusy(sec);
                  try {
                    await openWebSignedIn(`/schools/${s.id}/report-cards?section=${encodeURIComponent(sec)}`);
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ))}
          </Card>
        )}
      </Screen>
    </FeatureGate>
  );
}
