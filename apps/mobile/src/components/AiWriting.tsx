import type { RubricFeedbackDto, SimilarityReportDto } from '@qubedu/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge } from './kit';
import { Button, Card, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toastError } from '@/lib/ui';

export function RubricFeedbackCard({ fb }: { fb: RubricFeedbackDto }) {
  const tr = useT();
  const t = useTheme();
  return (
    <View style={{ gap: 6, backgroundColor: t.bg2, borderRadius: t.radiusControl, padding: 10 }}>
      <Text weight="black">{tr.t('aiGuard.feedbackTitle')}</Text>
      {fb.criteria.map((c) => (
        <View key={c.index} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text weight="bold" style={{ flex: 1 }}>
              {c.title}
            </Text>
            {c.levelLabel ? <Badge label={c.levelLabel} /> : null}
          </View>
          <Text size={13}>{c.comment}</Text>
          {c.missing.length ? (
            <Text size={12} style={{ color: t.warn }}>
              {tr.t('aiGuard.missing', { list: c.missing.join(', ') })}
            </Text>
          ) : null}
        </View>
      ))}
      <Text size={13}>{fb.overall}</Text>
      <Text muted size={12}>
        {tr.t('aiGuard.stats', fb.stats)}
      </Text>
    </View>
  );
}

/** Student: formative feedback on the draft against the rubric. */
export function DraftFeedback({ assignmentId, text }: { assignmentId: string; text: string }) {
  const tr = useT();
  const [fb, setFb] = useState<RubricFeedbackDto | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Button
        small
        variant="soft"
        icon="sparkles-outline"
        title={tr.t('aiGuard.feedback')}
        loading={busy}
        disabled={text.trim().length < 20}
        onPress={async () => {
          setBusy(true);
          try {
            setFb(await api.ai.rubricFeedback({ assignmentId, text }));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      {fb ? (
        <>
          <Text muted size={12}>
            {tr.t('aiGuard.feedbackHint')}
          </Text>
          <RubricFeedbackCard fb={fb} />
        </>
      ) : null}
    </View>
  );
}

/** Teacher: possible copying among the submissions and from the class's materials. */
export function SimilarityCard({ assignmentId }: { assignmentId: string }) {
  const tr = useT();
  const [r, setR] = useState<SimilarityReportDto | null>(null);
  const [busy, setBusy] = useState(false);
  const pct = (n: number) => Math.round(n * 100);
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="black">{tr.t('aiGuard.similarity')}</Text>
      <Text muted size={12}>
        {tr.t('aiGuard.similarityHint')}
      </Text>
      <Button
        small
        variant="outline"
        icon="scan-outline"
        title={tr.t('aiGuard.similarityRun')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            setR(await api.school.similarity(assignmentId));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      {r ? (
        !r.pairs.length && !r.sources.length ? (
          <Text size={13}>{tr.t('aiGuard.similarityNone', { count: r.checked })}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {r.pairs.map((p, i) => (
              <View key={`p${i}`} style={{ gap: 2 }}>
                <Text weight="bold">
                  {p.a.displayName} ↔ {p.b.displayName} · {tr.t('aiGuard.score', { pct: pct(p.score) })}
                </Text>
                {p.excerpt ? (
                  <Text muted size={12} numberOfLines={3}>
                    “{p.excerpt}”
                  </Text>
                ) : null}
              </View>
            ))}
            {r.sources.map((p, i) => (
              <View key={`s${i}`} style={{ gap: 2 }}>
                <Text weight="bold">
                  {p.student.displayName} → {p.material} · {tr.t('aiGuard.score', { pct: pct(p.score) })}
                </Text>
                {p.excerpt ? (
                  <Text muted size={12} numberOfLines={3}>
                    “{p.excerpt}”
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )
      ) : null}
    </Card>
  );
}
