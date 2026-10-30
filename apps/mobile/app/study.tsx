import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { FeatureGate, Segmented } from '@/components/kit';
import { FlashcardsTab } from '@/study/Flashcards';
import { ExamsTab, FocusTab, MasteryTab, PlanTab, SessionsTab, TodayTab } from '@/study/Tabs';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { GuideHint } from '@/components/Guide';

const TABS = ['today', 'plan', 'sessions', 'exams', 'cards', 'mastery', 'focus'] as const;
type Tab = (typeof TABS)[number];

export default function StudyScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(params.tab ?? '') ? (params.tab as Tab) : 'today');
  const [refreshing, setRefreshing] = useState(false);
  return (
    <FeatureGate id="academic">
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await qc.invalidateQueries();
              setRefreshing(false);
            }}
          />
        }
      >
        <GuideHint id="academic" />
        <Segmented
          tabs={TABS.map((k) => ({ key: k, label: tr.t(`academic.tabs.${k}`) }))}
          value={tab}
          onChange={(k) => {
            setTab(k);
            router.setParams({ tab: k });
          }}
        />
        <View>
          {tab === 'today' && <TodayTab />}
          {tab === 'plan' && <PlanTab />}
          {tab === 'sessions' && <SessionsTab />}
          {tab === 'exams' && <ExamsTab />}
          {tab === 'cards' && <FlashcardsTab />}
          {tab === 'mastery' && <MasteryTab />}
          {tab === 'focus' && <FocusTab />}
        </View>
      </ScrollView>
    </FeatureGate>
  );
}
