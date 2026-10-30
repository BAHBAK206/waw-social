import { Ionicons } from '@expo/vector-icons';
import type { Attachment } from '@qubedu/shared';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { VoiceCard } from '@/components/Voice';
import { useT } from '@/lib/i18n';
import { fileUrl } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Attachment chips; tapping opens the file in the in-app browser. Optional remove button. */
export function Files({ files, onRemove }: { files: Attachment[]; onRemove?: (i: number) => void }) {
  const t = useTheme();
  const tr = useT();
  if (!files.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {files.map((f, i) =>
        f.kind === 'audio' && !onRemove ? (
          <View key={`${f.url}-${i}`} style={{ width: '100%' }}>
            <VoiceCard a={f} label={tr.t('voice.teacherVoice')} />
          </View>
        ) : (
          <View
            key={`${f.url}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: t.bg3,
              maxWidth: '100%',
            }}
          >
            <Pressable
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(fileUrl(f.url)!)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
            >
              <Ionicons
                name={f.kind === 'image' ? 'image-outline' : f.kind === 'audio' ? 'musical-notes-outline' : 'document-attach-outline'}
                size={16}
                color={t.primaryInk}
              />
              <Text size={12} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {f.name} · {size(f.size)}
              </Text>
            </Pressable>
            {onRemove ? (
              <Pressable hitSlop={8} onPress={() => onRemove(i)} accessibilityRole="button" accessibilityLabel="remove">
                <Ionicons name="close" size={16} color={t.text3} />
              </Pressable>
            ) : null}
          </View>
        ),
      )}
    </View>
  );
}
