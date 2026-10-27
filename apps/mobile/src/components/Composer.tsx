import { Ionicons } from '@expo/vector-icons';
import { LIMITS } from '@qubedu/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Button, Card, Input } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

export function Composer({ groupId, onPosted }: { groupId?: string; onPosted: () => void }) {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me)!;
  const [text, setText] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) setImage(res.assets[0] ?? null);
  };

  const submit = async () => {
    if (!text.trim() && !image) return;
    setBusy(true);
    try {
      let imageUrl: string | null = null;
      if (image) {
        const up = await uploadFile({ uri: image.uri, name: image.fileName ?? 'photo.jpg', mimeType: image.mimeType ?? 'image/jpeg' }, 'post');
        imageUrl = up.url;
      }
      await api.posts.create({ text: text.trim(), imageUrl, groupId: groupId ?? null });
      setText('');
      setImage(null);
      toast(tr.t('feed.posted'));
      onPosted();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Avatar name={me.displayName} url={me.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Input
            value={text}
            onChangeText={setText}
            placeholder={tr.t('feed.composer')}
            multiline
            maxLength={LIMITS.postText}
            style={{ minHeight: 56, textAlignVertical: 'top' }}
          />
        </View>
      </View>
      {image && (
        <View>
          <Image source={{ uri: image.uri }} style={{ width: '100%', aspectRatio: 1.6, borderRadius: 12 }} contentFit="cover" />
          <Pressable
            onPress={() => setImage(null)}
            accessibilityLabel={tr.t('common.remove')}
            style={{ position: 'absolute', top: 8, end: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, padding: 4 }}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={pick}
          accessibilityRole="button"
          accessibilityLabel={tr.t('feed.addPhoto')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}
        >
          <Ionicons name="image-outline" size={22} color={t.primaryInk} />
        </Pressable>
        <Button title={tr.t('feed.post')} small onPress={submit} loading={busy} disabled={!text.trim() && !image} />
      </View>
    </Card>
  );
}
