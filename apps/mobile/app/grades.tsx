import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GuideHint } from '@/components/Guide';
import { FeatureGate } from '@/components/kit';
import { ReportCard } from '@/components/Gradebook';
import { BehaviorList } from '@/components/ParentTools';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, Empty, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Report card: the student's own, or a linked child's for parents. */
export default function GradesScreen() {
  const tr = useT();
  const parent = useSession((s) => s.me?.accountType === 'parent');
  return (
    <FeatureGate id="grades">
      <Screen>
        <GuideHint id="grades" />
        <Text muted size={13}>
          {tr.t('features.grades')}
        </Text>
        <TeacherNotes />
        {!parent ? <BehaviorList /> : null}
        {parent ? <ChildrenReportCards /> : <ReportCard />}
        {!parent ? <CalculatorLink /> : null}
      </Screen>
    </FeatureGate>
  );
}

/** Personal notes teachers wrote about the student (or the parent's children). */
function TeacherNotes() {
  const tr = useT();
  const q = useQuery({ queryKey: ['my-teacher-notes'], queryFn: () => api.teacherTools.myComments() });
  if (!q.data?.items.length) return null;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('teacherTools.comments.mineTitle')}</Text>
      {q.data.items.slice(0, 5).map((n) => (
        <View key={n.id} style={{ gap: 2 }}>
          <Text>{n.text}</Text>
          <Text muted size={12}>
            {tr.t('teacherTools.comments.from', { name: n.teacherName ?? '—', course: n.courseTitle })}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function ChildrenReportCards() {
  const tr = useT();
  const router = useRouter();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const children = fam.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  if (fam.isPending) return null;
  if (!children.length)
    return (
      <View style={{ gap: 8 }}>
        <Empty title={tr.t('family.requestTitle')} body={tr.t('family.requestHint')} />
        <Button title={tr.t('nav.family')} onPress={() => router.push('/family' as never)} />
      </View>
    );
  const current = picked ?? children[0]!.id;
  return (
    <View style={{ gap: 12 }}>
      {children.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {children.map((c) => (
            <Chip key={c.id} label={c.displayName} active={c.id === current} onPress={() => setPicked(c.id)} />
          ))}
        </View>
      ) : null}
      <ReportCard key={current} studentId={current} />
    </View>
  );
}

function CalculatorLink() {
  const tr = useT();
  const router = useRouter();
  return <Button variant="outline" icon="calculator-outline" title={tr.t('nav.calculator')} onPress={() => router.push('/calculator' as never)} />;
}
