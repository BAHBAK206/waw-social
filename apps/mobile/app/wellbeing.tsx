import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { MoodCard, SpeakCard, TrackCard } from '@/components/Wellbeing';
import { Card, Text } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export default function WellbeingScreen() {
  const tr = useT();
  const t = useTheme();
  return (
    <Screen>
      <Text muted>{tr.t('wellbeing.subtitle')}</Text>
      <MoodCard />
      <SpeakCard />
      <TrackCard />
      <Card style={{ flexDirection: 'row', gap: 10 }}>
        <Ionicons name="help-buoy-outline" size={24} color={t.warn} />
        <View style={{ flex: 1 }}>
          <Text weight="black">{tr.t('wellbeing.help.title')}</Text>
          <Text size={13}>{tr.t('wellbeing.help.text')}</Text>
        </View>
      </Card>
    </Screen>
  );
}
