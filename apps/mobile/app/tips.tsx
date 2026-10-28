import { Ionicons } from '@expo/vector-icons';
import { LIMITS, STORY_REACTIONS, type StoryGroupDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { FeatureGate, Sheet } from '@/components/kit';
import { Avatar, Button, Empty, Input, Loading, Text } from '@/components/ui';
import { api, fileUrl, uploadFile } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

const BACKGROUNDS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#2d3436', '#e84393', '#fdcb6e'];

function Viewer({ groups, start, onClose }: { groups: StoryGroupDto[]; start: number; onClose: () => void }) {
  const tr = useT();
  const [g, setG] = useState(start);
  const [i, setI] = useState(0);
  const group = groups[g];
  const story = group?.stories[i];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mine, setMine] = useState<string | null>(null);

  const next = () => {
    if (!group) return onClose();
    if (i < group.stories.length - 1) setI(i + 1);
    else if (g < groups.length - 1) {
      setG(g + 1);
      setI(0);
    } else onClose();
  };
  const prev = () => {
    if (i > 0) setI(i - 1);
    else if (g > 0) {
      setG(g - 1);
      setI(0);
    }
  };
  useEffect(() => {
    if (!story) return;
    setMine(story.myReaction);
    if (!group!.isMine && !story.viewed) void api.stories.view(story.id).catch(() => undefined);
    timer.current = setTimeout(next, Math.max(4, story.durationSec) * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);
  if (!group || !story) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: story.mediaKind === 'text' ? story.bgColor : '#000' }}>
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 48 }}>
          {group.stories.map((s, k) => (
            <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: k <= i ? '#fff' : 'rgba(255,255,255,0.35)' }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
          <Avatar name={group.author.displayName} url={group.author.avatarUrl} size={34} />
          <View style={{ flex: 1 }}>
            <Text weight="bold" color="#fff">
              {group.author.displayName}
            </Text>
            <Text size={11} color="rgba(255,255,255,0.8)">
              {relativeTime(story.createdAt, tr)}
            </Text>
          </View>
          {group.isMine && (
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tr.t('stories.delete')}
              onPress={async () => {
                if (!(await confirm(tr.t('stories.deleteConfirm'), { danger: true }))) return;
                try {
                  await api.stories.remove(story.id);
                  onClose();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </Pressable>
          )}
          <Pressable hitSlop={10} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.t('common.close')}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          {story.mediaKind === 'image' && story.mediaUrl ? (
            <Image source={{ uri: fileUrl(story.mediaUrl) }} style={{ width: '100%', height: '80%' }} contentFit="contain" />
          ) : null}
          {story.text ? (
            <Text weight="black" size={story.mediaKind === 'text' ? 28 : 18} color="#fff" style={{ textAlign: 'center', marginTop: 12 }}>
              {story.text}
            </Text>
          ) : null}
        </View>
        <View style={{ position: 'absolute', top: 120, bottom: 110, start: 0, end: 0, flexDirection: 'row' }}>
          <Pressable style={{ flex: 1 }} onPress={tr.dir === 'rtl' ? next : prev} accessibilityLabel={tr.t('common.previous')} />
          <Pressable style={{ flex: 1 }} onPress={tr.dir === 'rtl' ? prev : next} accessibilityLabel={tr.t('common.next')} />
        </View>
        {!group.isMine ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingBottom: 40 }}>
            {STORY_REACTIONS.map((e) => (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityState={{ selected: mine === e }}
                onPress={async () => {
                  try {
                    const r = await api.stories.react(story.id, mine === e ? null : e);
                    setMine(r.myReaction);
                  } catch (err) {
                    toastError(err);
                  }
                }}
                style={{ padding: 8, borderRadius: 24, backgroundColor: mine === e ? 'rgba(255,255,255,0.3)' : 'transparent' }}
              >
                <Text size={26}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text color="#fff" style={{ textAlign: 'center', paddingBottom: 40 }}>
            👁 {story.viewCount}
          </Text>
        )}
      </View>
    </Modal>
  );
}

export default function TipsScreen() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me)!;
  const q = useQuery({ queryKey: ['stories'], queryFn: () => api.stories.tray() });
  const [viewing, setViewing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[0]!);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = q.data?.items ?? [];
  const share = async () => {
    setBusy(true);
    try {
      if (image) {
        const up = await uploadFile({ uri: image.uri, name: image.fileName ?? 'tip.jpg', mimeType: image.mimeType ?? 'image/jpeg' }, 'story');
        await api.stories.create({ mediaKind: 'image', mediaUrl: up.url, text: text.trim() });
      } else await api.stories.create({ mediaKind: 'text', text: text.trim(), bgColor: bg });
      toast(tr.t('stories.shared'));
      setOpen(false);
      setText('');
      setImage(null);
      void q.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FeatureGate id="stories">
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Button icon="add" title={tr.t('stories.add')} onPress={() => setOpen(true)} />
        {q.isPending ? (
          <Loading />
        ) : !groups.length ? (
          <Empty icon="flash-outline" title={tr.t('stories.empty')} />
        ) : (
          groups.map((gr, k) => (
            <Pressable
              key={gr.author.id}
              onPress={() => setViewing(k)}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: t.radiusCard,
                backgroundColor: t.cardSolid,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <View style={{ padding: 2, borderRadius: 30, borderWidth: 2.5, borderColor: gr.allViewed ? t.border : t.primary }}>
                <Avatar name={gr.author.displayName} url={gr.author.avatarUrl} size={48} />
              </View>
              <View style={{ flex: 1 }}>
                <Text weight="bold">{gr.isMine ? tr.t('stories.yourStory') : gr.author.displayName}</Text>
                <Text muted size={12} numberOfLines={1}>
                  {gr.stories[gr.stories.length - 1]?.text || '📷'} · {relativeTime(gr.stories[gr.stories.length - 1]!.createdAt, tr)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
      {viewing !== null && (
        <Viewer
          groups={groups}
          start={viewing}
          onClose={() => {
            setViewing(null);
            void q.refetch();
          }}
        />
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('stories.create')}
        footer={<Button title={tr.t('stories.share')} loading={busy} disabled={!text.trim() && !image} onPress={() => void share()} />}
      >
        <View style={{ minHeight: 160, borderRadius: 16, padding: 16, justifyContent: 'center', backgroundColor: image ? '#000' : bg }}>
          {image ? <Image source={{ uri: image.uri }} style={{ width: '100%', height: 160 }} contentFit="contain" /> : null}
          <Text weight="black" size={20} color="#fff" style={{ textAlign: 'center' }}>
            {text || tr.t('stories.textPlaceholder')}
          </Text>
        </View>
        <Input value={text} onChangeText={setText} placeholder={tr.t('stories.textPlaceholder')} multiline maxLength={LIMITS.storyTextMax} />
        {!image && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {BACKGROUNDS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setBg(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: bg === c }}
                accessibilityLabel={c}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: bg === c ? 3 : 0, borderColor: t.text }}
              />
            ))}
          </View>
        )}
        <Button
          variant="outline"
          icon={image ? 'close' : 'image-outline'}
          title={image ? tr.t('common.remove') : tr.t('stories.photoTab')}
          onPress={async () => {
            if (image) return setImage(null);
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (!r.canceled) setImage(r.assets[0] ?? null);
          }}
        />
        <Text muted size={12}>
          {me.displayName} · 24h
        </Text>
      </Sheet>
    </FeatureGate>
  );
}
