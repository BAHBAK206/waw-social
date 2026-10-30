import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Progress, Segmented } from '@/components/kit';
import { Button, Card, Empty, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

export default function FormResponsesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'summary' | 'responses'>('summary');
  const form = useQuery({ queryKey: ['form', id], queryFn: () => api.forms.get(id!) });
  const analytics = useQuery({ queryKey: ['form', id, 'analytics'], queryFn: () => api.forms.analytics(id!) });
  const responses = useInfiniteQuery({
    queryKey: ['form', id, 'responses'],
    queryFn: ({ pageParam }) => api.forms.responses(id!, { cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: tab === 'responses',
  });
  const [busy, setBusy] = useState(false);
  const titleOf = (qid: string) => form.data?.questions.find((q) => q.id === qid)?.title ?? qid;
  const exportCsv = async () => {
    setBusy(true);
    try {
      const res = await api.forms.exportCsv(id!);
      const file = new File(Paths.cache, `form-${id}-${Date.now()}.csv`);
      file.write(await res.text());
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const header = (
    <View style={{ gap: 10, marginBottom: 6 }}>
      <Stack.Screen options={{ title: form.data?.title ?? tr.t('forms.analytics') }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small variant="outline" icon="create-outline" title={tr.t('common.edit')} onPress={() => router.push(`/form-editor?id=${id}` as never)} />
        <Button small variant="soft" icon="download-outline" title={tr.t('forms.exportCsv')} loading={busy} onPress={() => void exportCsv()} />
      </View>
      <Segmented
        tabs={[
          { key: 'summary', label: tr.t('forms.analytics') },
          { key: 'responses', label: tr.t('forms.responses', { count: analytics.data?.total ?? 0 }) },
        ]}
        value={tab}
        onChange={setTab}
      />
    </View>
  );
  if (tab === 'summary')
    return (
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={analytics.data?.questions ?? []}
        keyExtractor={(q) => q.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const total = Object.values(item.counts).reduce((a, b) => a + b, 0);
          return (
            <Card style={{ gap: 8 }}>
              <Text weight="bold">{item.title}</Text>
              {item.average !== null && (
                <Text weight="black">
                  {tr.t('common.average')}: {item.average.toFixed(1)}
                </Text>
              )}
              {Object.entries(item.counts).map(([k, n]) => (
                <View key={k} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={{ flex: 1 }} size={13}>
                      {k}
                    </Text>
                    <Text size={13} weight="bold">
                      {n}
                    </Text>
                  </View>
                  <Progress value={n} max={Math.max(1, total)} />
                </View>
              ))}
              {item.textAnswers.slice(0, 8).map((a, i) => (
                <Text key={i} muted size={13}>
                  “{a}”
                </Text>
              ))}
            </Card>
          );
        }}
        ListEmptyComponent={analytics.isPending ? <Loading /> : <Empty icon="bar-chart-outline" title={tr.t('common.empty')} />}
      />
    );
  const items = responses.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={items}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      onEndReached={() => responses.hasNextPage && !responses.isFetchingNextPage && void responses.fetchNextPage()}
      renderItem={({ item }) => (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text weight="bold" style={{ flex: 1 }}>
              {item.respondent?.displayName ?? item.email ?? tr.t('forms.anonymous')}
            </Text>
            {item.score !== null && <Text weight="black">{item.score}</Text>}
          </View>
          <Text muted size={12}>
            {relativeTime(item.createdAt, tr)}
          </Text>
          {Object.entries(item.answers).map(([qid, v]) => (
            <Text key={qid} size={13}>
              <Text weight="bold" size={13}>
                {titleOf(qid)}:{' '}
              </Text>
              {Array.isArray(v) ? v.join('، ') : String(v)}
            </Text>
          ))}
          <Button
            small
            variant="ghost"
            title={tr.t('forms.deleteResponse')}
            onPress={async () => {
              if (!(await confirm(tr.t('forms.deleteResponse'), { danger: true }))) return;
              try {
                await api.forms.deleteResponse(id!, item.id);
                await Promise.all([responses.refetch(), analytics.refetch()]);
              } catch (e) {
                toastError(e);
              }
            }}
          />
        </Card>
      )}
      ListEmptyComponent={responses.isPending ? <Loading /> : <Empty icon="file-tray-outline" title={tr.t('common.empty')} />}
    />
  );
}
