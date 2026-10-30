import { CURRICULUM_SYSTEMS, type GradeLevel } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GuideHint } from '@/components/Guide';
import { FeatureGate, Row, SelectField } from '@/components/kit';
import { GradeLevelField } from '@/components/Linking';
import { Screen } from '@/components/Screen';
import { Empty, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Subjects of the official curriculum for a system and school year. */
export default function CurriculumScreen() {
  const tr = useT();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [system, setSystem] = useState<string>('');
  const [grade, setGrade] = useState<GradeLevel | ''>((me?.gradeLevel as GradeLevel | null) ?? '');
  const q = useQuery({
    queryKey: ['curriculum', system, grade],
    queryFn: () => api.curriculum.subjects({ system: system || undefined, gradeLevel: grade || undefined }),
  });
  return (
    <FeatureGate id="curriculum">
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <GuideHint id="curriculum" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SelectField
              label={tr.t('curriculum.system')}
              value={system}
              placeholder={tr.t('common.all')}
              onChange={(v) => setSystem(v)}
              options={[{ value: '', label: tr.t('common.all') }, ...CURRICULUM_SYSTEMS.map((s) => ({ value: s, label: tr.t(`curriculum.systems.${s}`) }))]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <GradeLevelField label={tr.t('curriculum.grade')} value={grade} onChange={setGrade} />
          </View>
        </View>
        {q.isPending ? (
          <Loading />
        ) : !q.data?.items.length ? (
          <Empty icon="map-outline" title={tr.t('curriculum.empty')} />
        ) : (
          q.data.items.map((s) => (
            <Row
              key={s.id}
              icon="book-outline"
              title={s.code ? `${s.title} (${s.code})` : s.title}
              subtitle={[s.gradeLevel ? tr.tDyn(`stages.grades.${s.gradeLevel}`) : null, tr.t(`curriculum.systems.${s.system}`)].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/curriculum/${s.id}` as never)}
            />
          ))
        )}
        <Text muted size={12}>
          {tr.t('features.curriculum')}
        </Text>
      </Screen>
    </FeatureGate>
  );
}
