import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Badge, SelectField, SwitchRow } from '@/components/kit';
import { Button, Card, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';
import { WEB_URL, openWeb } from '@/lib/web';

export default function PortfolioScreen() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['portfolio'], queryFn: () => api.portfolio.mine() });
  const [f, setF] = useState({ slug: '', headline: '', bio: '' });
  const [item, setItem] = useState({ kind: 'project' as 'project' | 'award', title: '', description: '', url: '' });
  // Fill the form once from the server; later refreshes (a switch flipped) must not wipe what is being typed.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (q.data && !filled) {
      setF({ slug: q.data.slug, headline: q.data.headline, bio: q.data.bio });
      setFilled(true);
    }
  }, [q.data, filled]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['portfolio'] });
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.portfolio.save>[0]) => api.portfolio.save(body),
    onSuccess: () => {
      toast(tr.t('growth.portfolio.saved'));
      void refresh();
    },
    onError: toastError,
  });
  const add = useMutation({
    mutationFn: () => api.portfolio.addItem({ kind: item.kind, title: item.title.trim(), description: item.description.trim(), url: item.url.trim() || null }),
    onSuccess: () => {
      setItem({ ...item, title: '', description: '', url: '' });
      void refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.portfolio.removeItem(id), onSuccess: refresh, onError: toastError });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  const p = q.data;
  const link = `${WEB_URL}/p/${p.slug}`;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text muted>{tr.t('growth.portfolio.subtitle')}</Text>
      <Card style={{ gap: 10 }}>
        {p.blocked ? (
          <Text size={13} style={{ lineHeight: 20 }}>
            {tr.t('growth.portfolio.needsGuardian')}
          </Text>
        ) : null}
        <SwitchRow label={tr.t('growth.portfolio.public')} value={p.enabled} onChange={(v) => save.mutate({ enabled: v })} />
        {p.enabled ? (
          <View style={{ gap: 6 }}>
            <Text size={13} selectable>
              {link}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                small
                variant="outline"
                icon="copy-outline"
                title={tr.t('growth.portfolio.copy')}
                onPress={() => void Clipboard.setStringAsync(link).then(() => toast(tr.t('growth.portfolio.copied')))}
              />
              <Button small variant="soft" icon="open-outline" title={tr.t('growth.portfolio.open')} onPress={() => void openWeb(`/p/${p.slug}`)} />
            </View>
          </View>
        ) : null}
        <Input
          label={tr.t('growth.portfolio.address')}
          value={f.slug}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(v) => setF({ ...f, slug: v.toLowerCase() })}
        />
        <Input label={tr.t('growth.portfolio.headline')} value={f.headline} maxLength={120} onChangeText={(v) => setF({ ...f, headline: v })} />
        <Input label={tr.t('growth.portfolio.bio')} value={f.bio} multiline numberOfLines={4} maxLength={1000} onChangeText={(v) => setF({ ...f, bio: v })} />
        <SwitchRow label={tr.t('growth.portfolio.showCertificates')} value={p.showCertificates} onChange={(v) => save.mutate({ showCertificates: v })} />
        <SwitchRow label={tr.t('growth.portfolio.showStats')} value={p.showStats} onChange={(v) => save.mutate({ showStats: v })} />
        <Button
          title={tr.t('common.save')}
          loading={save.isPending}
          onPress={() => save.mutate({ slug: f.slug.trim(), headline: f.headline.trim(), bio: f.bio.trim() })}
        />
      </Card>
      <Text weight="black">{tr.t('growth.portfolio.items')}</Text>
      {!p.items.length ? <Text muted>{tr.t('growth.portfolio.none')}</Text> : null}
      {p.items.map((i) => (
        <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Badge label={tr.t(`growth.portfolio.${i.kind}`)} />
          <View style={{ flex: 1 }}>
            <Text weight="bold">{i.title}</Text>
            {i.description ? (
              <Text muted size={13}>
                {i.description}
              </Text>
            ) : null}
          </View>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={tr.t('common.delete')} onPress={() => remove.mutate(i.id)}>
            <Ionicons name="trash-outline" size={20} />
          </Pressable>
        </Card>
      ))}
      <Card style={{ gap: 10 }}>
        <SelectField
          label={tr.t('growth.portfolio.itemKind')}
          value={item.kind}
          options={[
            { value: 'project', label: tr.t('growth.portfolio.project') },
            { value: 'award', label: tr.t('growth.portfolio.award') },
          ]}
          onChange={(v) => v && setItem({ ...item, kind: v })}
        />
        <Input label={tr.t('growth.portfolio.itemTitle')} value={item.title} maxLength={120} onChangeText={(v) => setItem({ ...item, title: v })} />
        <Input label={tr.t('growth.portfolio.itemText')} value={item.description} maxLength={600} onChangeText={(v) => setItem({ ...item, description: v })} />
        <Input
          label={tr.t('growth.portfolio.itemUrl')}
          value={item.url}
          autoCapitalize="none"
          keyboardType="url"
          onChangeText={(v) => setItem({ ...item, url: v })}
        />
        <Button
          variant="outline"
          icon="add"
          title={tr.t('growth.portfolio.addItem')}
          disabled={item.title.trim().length < 2}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      </Card>
    </Screen>
  );
}
