import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Share, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Badge } from '@/components/kit';
import { Button, Card, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/ui';
import { WEB_URL } from '@/lib/web';

export default function InviteScreen() {
  const tr = useT();
  const q = useQuery({ queryKey: ['referral'], queryFn: () => api.referrals.mine() });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  const d = q.data;
  const link = `${WEB_URL}/register?ref=${d.code}`;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text muted>{tr.t('growth.referral.subtitle', { xp: d.rewardXp })}</Text>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Text muted size={13}>
          {tr.t('growth.referral.code')}
        </Text>
        <Text weight="black" size={30} selectable style={{ letterSpacing: 4 }}>
          {d.code}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            icon="copy-outline"
            title={tr.t('growth.referral.copy')}
            onPress={() => void Clipboard.setStringAsync(link).then(() => toast(tr.t('growth.referral.copied')))}
          />
          <Button
            icon="share-social-outline"
            title={tr.t('growth.referral.share')}
            onPress={() => void Share.share({ message: tr.t('growth.referral.message', { code: d.code, link }) })}
          />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['invited', d.invited],
            ['rewarded', d.rewarded],
            ['xp', d.xpEarned],
          ] as const
        ).map(([k, v]) => (
          <Card key={k} style={{ flex: 1, alignItems: 'center' }}>
            <Text weight="black" size={22}>
              {v}
            </Text>
            <Text muted size={12}>
              {tr.t(`growth.referral.${k}`)}
            </Text>
          </Card>
        ))}
      </View>
      <Text weight="black">{tr.t('growth.referral.friends')}</Text>
      {!d.friends.length ? <Text muted>{tr.t('growth.referral.none')}</Text> : null}
      {d.friends.map((f, i) => (
        <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1 }}>{f.name}</Text>
          <Text muted size={12}>
            {formatDate(f.joinedAt, tr)}
          </Text>
          <Badge label={f.rewarded ? tr.t('growth.referral.done') : tr.t('growth.referral.waiting')} tone={f.rewarded ? 'ok' : 'neutral'} />
        </Card>
      ))}
      <Text muted size={12}>
        {tr.t('growth.referral.max', { count: d.maxRewards })}
      </Text>
    </Screen>
  );
}
