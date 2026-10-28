import { calculateGrade, type CalcPart } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { FeatureGate, SelectField } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type Row = { name: string; max: string; earned: string };
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));

/** "What do I need on the final?" — can start from the student's real marks in a class. */
export default function CalculatorScreen() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me);
  const [rows, setRows] = useState<Row[]>(() => [
    { name: tr.t('calculator.defaultParts.homework'), max: '10', earned: '' },
    { name: tr.t('calculator.defaultParts.tests'), max: '20', earned: '' },
    { name: tr.t('calculator.defaultParts.final'), max: '30', earned: '' },
  ]);
  const [pass, setPass] = useState('30');
  const [target, setTarget] = useState('');
  const report = useQuery({ queryKey: ['report-card', 'me', ''], queryFn: () => api.school.reportCard(), enabled: me?.accountType === 'student' });
  const subjects = report.data?.subjects.filter((s) => s.components.length > 0) ?? [];
  const parts: CalcPart[] = rows.map((r) => ({ name: r.name, max: num(r.max) ?? 0, earned: num(r.earned) }));
  const r = calculateGrade(parts, { passMarks: num(pass) ?? 0, target: num(target) });
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const needLine = (need: number | null) =>
    need === null ? tr.t('calculator.impossible') : need === 0 ? tr.t('calculator.safe') : tr.t('calculator.need', { need, remaining: r.remaining });
  return (
    <FeatureGate id="calculator">
      <Screen>
        <Text muted size={13}>
          {tr.t('calculator.hint')}
        </Text>
        {subjects.length ? (
          <SelectField
            label={tr.t('calculator.fromClass')}
            value=""
            placeholder={tr.t('calculator.blank')}
            options={subjects.map((s) => ({ value: s.courseId, label: s.title }))}
            onChange={(id) => {
              const s = subjects.find((x) => x.courseId === id);
              if (!s) return;
              setRows(s.components.map((c) => ({ name: c.name, max: String(c.maxMarks), earned: c.earned === null ? '' : String(c.earned) })));
              setPass(String(s.grading.passMarks));
            }}
          />
        ) : null}
        <Card style={{ gap: 10 }}>
          {rows.map((row, i) => (
            <View key={i} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input label={tr.t('calculator.part')} value={row.name} onChangeText={(v) => set(i, { name: v })} />
                </View>
                {rows.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr.t('calculator.remove')}
                    onPress={() => setRows(rows.filter((_, j) => j !== i))}
                    style={{ padding: 10 }}
                  >
                    <Text color={t.err}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label={tr.t('calculator.mark')}
                    keyboardType="decimal-pad"
                    value={row.earned}
                    placeholder="—"
                    onChangeText={(v) => set(i, { earned: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label={tr.t('calculator.outOf')} keyboardType="decimal-pad" value={row.max} onChangeText={(v) => set(i, { max: v })} />
                </View>
              </View>
            </View>
          ))}
          <Button variant="ghost" icon="add" title={tr.t('calculator.addPart')} onPress={() => setRows([...rows, { name: '', max: '10', earned: '' }])} />
          <Text weight="bold">{tr.t('calculator.total', { total: r.total })}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input label={tr.t('calculator.passMarks')} keyboardType="decimal-pad" value={pass} onChangeText={setPass} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={tr.t('calculator.target')} keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
            </View>
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          {r.percentSoFar === null ? (
            <Text muted>{tr.t('calculator.noMarks')}</Text>
          ) : (
            <>
              <Text>
                <Text weight="bold">{tr.t('calculator.soFar')}: </Text>
                {tr.t('calculator.soFarValue', { earned: r.earned, max: r.gradedMax, percent: r.percentSoFar })}
                {r.ratingSoFar ? ` · ${tr.t(`gradebook.ratings.${r.ratingSoFar}`)}` : ''}
              </Text>
              {r.remaining > 0 ? (
                <>
                  <Text>
                    <Text weight="bold">{tr.t('calculator.toPass')}: </Text>
                    {needLine(r.neededToPass)}
                  </Text>
                  {num(target) !== null ? (
                    <Text>
                      <Text weight="bold">{tr.t('calculator.toTarget')}: </Text>
                      {needLine(r.neededForTarget)}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <Text muted size={13}>
                {tr.t('calculator.range', { worst: r.worst, best: r.best, total: r.total })}
              </Text>
            </>
          )}
        </Card>
      </Screen>
    </FeatureGate>
  );
}
