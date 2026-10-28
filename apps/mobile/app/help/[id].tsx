import { GUIDE_IDS, type GuideId } from '@qubedu/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GuideBody, useGuide } from '@/components/Guide';
import { Screen } from '@/components/Screen';
import { Button, Card, Empty } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function GuideScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  if (!GUIDE_IDS.includes(id as GuideId)) return <Empty title={tr.t('helpCenter.notFound')} />;
  return <Guide id={id as GuideId} />;
}

function Guide({ id }: { id: GuideId }) {
  const tr = useT();
  const router = useRouter();
  const g = useGuide(id);
  return (
    <Screen>
      <Stack.Screen options={{ title: g.title }} />
      <Card>
        <GuideBody id={id} />
      </Card>
      <Button variant="ghost" title={tr.t('helpCenter.allGuides')} onPress={() => router.push('/help' as never)} />
    </Screen>
  );
}
