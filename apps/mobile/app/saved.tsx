import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SelectField, Sheet, SwitchRow } from '@/components/kit';
import { Button, Card, Chip, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { openSaved } from '@/lib/saved';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';
import { WEB_URL } from '@/lib/web';

export default function SavedScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [collectionId, setCollectionId] = useState('');
  const q = useQuery({ queryKey: ['saved', collectionId], queryFn: () => api.saved.list({ collectionId: collectionId || undefined }) });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', isPublic: false });
  const [moving, setMoving] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState({ title: '', url: '' });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  const collections = q.data.collections;
  const current = collections.find((c) => c.id === collectionId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved'] });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={tr.t('saved.all')} active={!collectionId} onPress={() => setCollectionId('')} />
        {collections.map((c) => (
          <Chip
            key={c.id}
            label={`${c.isPublic ? '🌐 ' : ''}${c.name} (${c.itemCount})`}
            active={collectionId === c.id}
            onPress={() => setCollectionId(c.id)}
          />
        ))}
        <Chip label={`+ ${tr.t('saved.newCollection')}`} onPress={() => setCreating(true)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button small variant="outline" icon="link-outline" title={tr.t('saved.addLink')} onPress={() => setLinking(true)} />
        {current?.isPublic && (
          <Button
            small
            variant="soft"
            icon="share-social-outline"
            title={tr.t('saved.share')}
            onPress={() => void Share.share({ message: `${current.name}\n${WEB_URL}/c/${current.shareSlug}` })}
          />
        )}
        {current && (
          <Button
            small
            variant="ghost"
            title={tr.t('common.delete')}
            onPress={async () => {
              if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
              try {
                await api.saved.deleteCollection(current.id);
                setCollectionId('');
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        )}
      </View>
      {!q.data.items.length ? <Empty title={tr.t('saved.empty')} icon="bookmark-outline" /> : null}
      {q.data.items.map((i) => (
        <Card key={i.id} onPress={() => openSaved(i, (h) => router.push(h as never))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text muted size={11}>
              {tr.t(`saved.types.${i.itemType}`)}
              {i.collectionId ? ` · ${collections.find((c) => c.id === i.collectionId)?.name ?? ''}` : ''}
            </Text>
            <Text weight="bold" numberOfLines={2}>
              {i.title}
            </Text>
            {i.note ? (
              <Text muted size={12} numberOfLines={2}>
                {i.note}
              </Text>
            ) : null}
          </View>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={tr.t('saved.addToCollection')} onPress={() => setMoving(i.id)}>
            <Ionicons name="folder-open-outline" size={20} color={t.text2} />
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr.t('common.remove')}
            onPress={async () => {
              try {
                await api.saved.remove(i.id);
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color={t.text3} />
          </Pressable>
        </Card>
      ))}
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={tr.t('saved.newCollection')}
        footer={
          <Button
            title={tr.t('common.create')}
            disabled={!form.name.trim()}
            onPress={async () => {
              try {
                const c = await api.saved.createCollection({ name: form.name.trim(), isPublic: form.isPublic });
                setCreating(false);
                setForm({ name: '', isPublic: false });
                await refresh();
                setCollectionId(c.id);
              } catch (e) {
                toastError(e);
              }
            }}
          />
        }
      >
        <Input label={tr.t('common.name')} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <SwitchRow label={tr.t('saved.publicCollection')} value={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} />
      </Sheet>
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={tr.t('saved.addToCollection')}>
        <SelectField
          label={tr.t('saved.collections')}
          value=""
          placeholder={tr.t('saved.all')}
          options={collections.map((c) => ({ value: c.id, label: c.name }))}
          onChange={async (v) => {
            try {
              await api.saved.update(moving!, { collectionId: v || null });
              setMoving(null);
              await refresh();
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </Sheet>
      <Sheet
        open={linking}
        onClose={() => setLinking(false)}
        title={tr.t('saved.addLink')}
        footer={
          <Button
            title={tr.t('common.save')}
            disabled={!/^https?:\/\/\S+/.test(link.url.trim())}
            onPress={async () => {
              try {
                await api.saved.add({
                  itemType: 'link',
                  title: link.title.trim() || link.url.trim(),
                  url: link.url.trim(),
                  collectionId: collectionId || null,
                });
                setLinking(false);
                setLink({ title: '', url: '' });
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        }
      >
        <Input label={tr.t('common.title')} value={link.title} onChangeText={(v) => setLink({ ...link, title: v })} />
        <Input
          label={tr.t('common.link')}
          value={link.url}
          onChangeText={(v) => setLink({ ...link, url: v })}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://"
        />
      </Sheet>
    </Screen>
  );
}
