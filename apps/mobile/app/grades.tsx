import { FeatureGate } from '@/components/kit';
import { ReportCard } from '@/components/Gradebook';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** The signed-in student's report card across all their classes. */
export default function GradesScreen() {
  const tr = useT();
  return (
    <FeatureGate id="grades">
      <Screen>
        <Text muted size={13}>
          {tr.t('features.grades')}
        </Text>
        <ReportCard />
      </Screen>
    </FeatureGate>
  );
}
