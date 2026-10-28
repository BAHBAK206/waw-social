import { LIMITS } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SubjectPicker } from '@/components/SubjectPicker';
import { FeatureGate, Row, SelectField, Sheet, SwitchRow } from '@/components/kit';
import { Button, Card, Input, Loading, SectionTitle, Text } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { compactNumber } from '@/lib/format';
import { useFeatureOn } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

type Visibility = 'public' | 'unlisted' | 'private';

export default function StudioScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const canUpload = useFeatureOn('video-upload');
  const overview = useQuery({ queryKey: ['studio', 'overview'], queryFn: () => api.studio.overview() });
  const quizzes = useQuery({ queryKey: ['quizzes', 'mine', 'linkable'], queryFn: () => api.quizzes.list({ mine: true, limit: 50 }) });
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [form, setForm] = useState({ title: '', description: '', materialId: '', quizId: '', visibility: 'public' as Visibility, allowComments: true });
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const durationSec = video?.duration ? Math.max(1, Math.round(video.duration / 1000)) : 0;
  const isShort = !!video && durationSec <= 90 && (video.height ?? 0) > (video.width ?? 0);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.fileSize && a.fileSize > LIMITS.videoBytes) return toast(tr.t('studio.tooBig', { mb: Math.round(LIMITS.videoBytes / 1024 / 1024) }), 'err');
    setVideo(a);
    if (!form.title && a.fileName) setForm((f) => ({ ...f, title: a.fileName!.replace(/\.[^.]+$/, '') }));
  };

  const publish = async () => {
    if (!video || !form.title.trim()) return;
    setPhase('uploading');
    try {
      const up = await uploadFile({ uri: video.uri, name: video.fileName ?? 'lesson.mp4', mimeType: video.mimeType ?? 'video/mp4' }, 'video');
      setPhase('saving');
      const created = await api.videos.create({
        kind: isShort ? 'short' : 'video',
        title: form.title.trim(),
        description: form.description.trim(),
        videoUrl: up.url,
        durationSec,
        visibility: form.visibility,
        materialId: form.materialId || null,
        quizId: form.quizId || null,
        allowComments: form.allowComments,
      });
      toast(tr.t('studio.published'));
      setOpen(false);
      setVideo(null);
      setForm({ title: '', description: '', materialId: '', quizId: '', visibility: 'public', allowComments: true });
      void qc.invalidateQueries({ queryKey: ['studio'] });
      router.push(`/video/${created.id}` as never);
    } catch (e) {
      toastError(e);
    } finally {
      setPhase('idle');
    }
  };

  const totals = overview.data?.totals;
  return (
    <FeatureGate id="studio">
      <Screen refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()}>
        <Text muted>{tr.t('features.studio')}</Text>
        {canUpload && <Button icon="cloud-upload-outline" title={tr.t('studio.upload')} onPress={() => setOpen(true)} />}
        {overview.isPending ? (
          <Loading />
        ) : totals ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(
              [
                ['views', totals.views],
                ['watchTime', totals.watchMinutes],
                ['subscribers', totals.subscribers],
                ['likes', totals.likes],
                ['comments', totals.comments],
                ['videos', totals.videos],
              ] as const
            ).map(([k, v]) => (
              <Card key={k} style={{ flexBasis: '30%', flexGrow: 1, gap: 2 }}>
                <Text weight="black" size={20}>
                  {compactNumber(v, tr)}
                </Text>
                <Text muted size={11}>
                  {tr.t(`studio.totals.${k}`)}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}
        {!!overview.data?.topVideos.length && (
          <>
            <SectionTitle>{tr.t('studio.topVideos')}</SectionTitle>
            {overview.data.topVideos.map((v) => (
              <Row
                key={v.id}
                icon="play-circle-outline"
                title={v.title}
                subtitle={tr.t('watch.views', { count: v.views })}
                onPress={() => router.push(`/video/${v.id}` as never)}
              />
            ))}
          </>
        )}
        <Sheet
          open={open}
          onClose={() => phase === 'idle' && setOpen(false)}
          title={tr.t('studio.uploadTitle')}
          footer={
            <Button
              title={phase === 'uploading' ? tr.t('studio.uploading', { pct: '…' }) : tr.t('studio.publish')}
              loading={phase !== 'idle'}
              disabled={!video || !form.title.trim()}
              onPress={() => void publish()}
            />
          }
        >
          <Button
            variant="outline"
            icon="film-outline"
            title={video ? (video.fileName ?? tr.t('studio.chooseFile')) : tr.t('studio.chooseFile')}
            onPress={() => void pick()}
          />
          {video && (
            <Text muted size={12}>
              {Math.floor(durationSec / 60)}:{String(durationSec % 60).padStart(2, '0')} · {isShort ? tr.t('studio.kinds.short') : tr.t('studio.kinds.video')}
            </Text>
          )}
          <Input label={tr.t('studio.titleLabel')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} maxLength={100} />
          <Input
            label={tr.t('studio.descriptionLabel')}
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            multiline
            placeholder="0:00 …"
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          <SubjectPicker
            label={tr.t('studio.subject')}
            value={form.materialId}
            onChange={(v) => setForm({ ...form, materialId: v })}
            placeholder={tr.t('studio.noSubject')}
          />
          <SelectField
            label={tr.t('studio.linkedQuiz')}
            value={form.quizId}
            placeholder={tr.t('studio.noQuiz')}
            onChange={(v) => setForm({ ...form, quizId: v })}
            options={(quizzes.data?.items ?? []).filter((q) => q.published).map((q) => ({ value: q.id, label: q.title }))}
          />
          <Text muted size={12}>
            {tr.t('studio.linkedQuizHint')}
          </Text>
          <SelectField
            label={tr.t('studio.visibility')}
            value={form.visibility}
            onChange={(v) => v && setForm({ ...form, visibility: v })}
            options={(['public', 'unlisted', 'private'] as const).map((v) => ({ value: v, label: tr.t(`studio.visibilities.${v}`) }))}
          />
          <SwitchRow label={tr.t('studio.allowComments')} value={form.allowComments} onChange={(v) => setForm({ ...form, allowComments: v })} />
          <Text muted size={11} style={{ color: t.text3 }}>
            {tr.t('studio.dropHere')}
          </Text>
        </Sheet>
      </Screen>
    </FeatureGate>
  );
}
