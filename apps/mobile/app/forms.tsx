import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@/components/Screen';
import { FeatureGate, Row } from '@/components/kit';
import { Button, Card, Input, Loading, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/** Accepts a full form link (…/f/slug) or just the slug. */
const slugFrom = (v: string) => v.trim().replace(/\/+$/, '').split('/f/').pop()?.split(/[?#]/)[0]?.split('/').pop() ?? '';

export default function FormsScreen() {
  const tr = useT();
  const router = useRouter();
  const mine = useQuery({ queryKey: ['forms', 'mine'], queryFn: () => api.forms.mine() });
  const [link, setLink] = useState('');
  return (
    <FeatureGate id="forms">
      <Screen refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()}>
        <Card style={{ gap: 8 }}>
          <Text weight="black">{tr.t('forms.openForm')}</Text>
          <Text muted size={13}>
            {tr.t('forms.openHint')}
          </Text>
          <Input value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="https://…/f/…" />
          <Button title={tr.t('common.open')} disabled={!slugFrom(link)} onPress={() => router.push(`/form/${slugFrom(link)}` as never)} />
        </Card>
        <SectionTitle>{tr.t('forms.mine')}</SectionTitle>
        {mine.isPending ? (
          <Loading />
        ) : !mine.data?.items.length ? (
          <Text muted>{tr.t('forms.empty')}</Text>
        ) : (
          mine.data.items.map((f) => (
            <Row
              key={f.id}
              icon="clipboard-outline"
              title={f.title}
              subtitle={`${tr.t('forms.responses', { count: f.responseCount })}${f.published ? '' : ` · ${tr.t('common.draft')}`}`}
              onPress={() => router.push(`/form-responses/${f.id}` as never)}
            />
          ))
        )}
        <Button icon="add" title={tr.t('forms.newForm')} onPress={() => router.push('/form-editor' as never)} />
      </Screen>
    </FeatureGate>
  );
}
