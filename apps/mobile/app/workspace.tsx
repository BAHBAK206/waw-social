import { Ionicons } from '@expo/vector-icons';
import type { WorkspaceFileDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { FeatureGate } from '@/components/kit';
import { Button, Card, Empty, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

const KIND_ICON: Record<WorkspaceFileDto['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  doc: 'document-text-outline',
  sheet: 'grid-outline',
  slides: 'easel-outline',
  whiteboard: 'brush-outline',
};

/** Files and folders. Documents open in the native editor; sheets, slides and whiteboards open the web tools. */
export default function WorkspaceScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['workspace', 'list'], queryFn: () => api.workspace.list() });
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const webTool = (path: string, title: string) => router.push(`/web?path=${encodeURIComponent(path)}&title=${encodeURIComponent(title)}` as never);
  const open = (f: WorkspaceFileDto) => (f.kind === 'doc' ? router.push(`/doc/${f.id}` as never) : webTool(`/workspace/${f.id}`, f.title));

  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const folders = q.data.folders.filter((f) => (f.parentId ?? null) === folderId);
  const files = q.data.files.filter((f) => (f.folderId ?? null) === folderId);
  const here = q.data.folders.find((f) => f.id === folderId);

  return (
    <FeatureGate id="workspace">
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <Text muted size={13}>
          {tr.t('workspace.subtitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            icon="document-text-outline"
            title={tr.t('docs.newDoc')}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const f = await api.workspace.createFile({ title: tr.t('docs.untitled'), kind: 'doc', folderId, content: { html: '' } });
                void qc.invalidateQueries({ queryKey: ['workspace', 'list'] });
                router.push(`/doc/${f.id}` as never);
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button variant="outline" icon="apps-outline" title={tr.t('docs.otherTools')} onPress={() => webTool('/workspace', tr.t('workspace.title'))} />
        </View>
        {here ? (
          <Pressable
            onPress={() => setFolderId(here.parentId ?? null)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
          >
            <Ionicons name={tr.locale === 'ar' ? 'chevron-forward' : 'chevron-back'} size={18} color={t.primaryInk} />
            <Text weight="bold" color={t.primaryInk}>
              {here.name}
            </Text>
          </Pressable>
        ) : null}
        {folders.map((f) => (
          <Card key={f.id} onPress={() => setFolderId(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="folder-outline" size={22} color={t.primaryInk} />
            <Text weight="bold" style={{ flex: 1 }}>
              {f.name}
            </Text>
          </Card>
        ))}
        {!folders.length && !files.length ? <Empty icon="document-text-outline" title={tr.t('workspace.empty')} /> : null}
        {files.map((f) => (
          <Card key={f.id} onPress={() => open(f)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={KIND_ICON[f.kind]} size={22} color={t.text2} />
            <View style={{ flex: 1 }}>
              <Text weight="bold" numberOfLines={1}>
                {f.title}
              </Text>
              <Text muted size={11}>
                {tr.t(`workspace.kinds.${f.kind}`)} · {relativeTime(f.updatedAt, tr)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr.t('common.delete')}
              hitSlop={10}
              onPress={async () => {
                if (!(await confirm(tr.t('workspace.deleteFile'), { danger: true }))) return;
                try {
                  await api.workspace.deleteFile(f.id);
                  await q.refetch();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Ionicons name="trash-outline" size={20} color={t.text3} />
            </Pressable>
          </Card>
        ))}
      </Screen>
    </FeatureGate>
  );
}
