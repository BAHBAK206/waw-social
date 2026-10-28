import { Ionicons } from '@expo/vector-icons';
import type { MessageDto } from '@qubedu/shared';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { VoicePlayer, VoiceRecorder } from '@/components/Voice';
import { pickDocument } from '@/components/kit';
import { reportContent } from '@/components/Report';
import { Avatar, Loading, Text } from '@/components/ui';
import { api, fileUrl, realtime, uploadFile } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { FONT, useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';
import { channels, useRealtimeChannel } from '@/lib/useRealtime';

type Page = { items: MessageDto[]; nextCursor: string | null; peerLastReadAt: number | null };
type Data = InfiniteData<Page, string | undefined>;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const key = ['messages', id];
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.chat.get(id!) });
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.chat.messages(id!, { cursor: pageParam, limit: 40 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const [text, setText] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messages = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]); // newest first (list is inverted)

  const upsert = (m: MessageDto) =>
    qc.setQueryData<Data>(key, (old) => {
      if (!old) return old;
      let found = false;
      const pages = old.pages.map((p) => ({
        ...p,
        items: p.items.map((i) => (i.id === m.id || (m.clientId && i.clientId === m.clientId) ? ((found = true), m) : i)),
      }));
      if (!found && pages[0]) pages[0] = { ...pages[0], items: [m, ...pages[0].items] };
      return { ...old, pages };
    });

  const markRead = () =>
    void api.chat
      .read(id!)
      .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => undefined);
  useEffect(markRead, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtimeChannel(channels.conv(id!), (f) => {
    if (f.type !== 'event') return;
    if (f.event === 'message:new' || f.event === 'message:updated') {
      upsert(f.data as MessageDto);
      if (f.event === 'message:new') markRead();
    } else if (f.event === 'typing' && f.from && f.from.uid !== me.id) {
      setTyping(f.from.name);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(null), 4000);
    } else if (f.event === 'stop-typing') setTyping(null);
  });

  const send = async (body: { text: string; attachment?: MessageDto['attachment'] }) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    upsert({
      id: `tmp-${clientId}`,
      conversationId: id!,
      sender: me,
      text: body.text,
      attachment: body.attachment ?? null,
      replyTo: null,
      reactions: {},
      createdAt: Date.now(),
      editedAt: null,
      deleted: false,
      clientId,
    });
    try {
      upsert(await api.chat.send(id!, { ...body, clientId }));
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      qc.setQueryData<Data>(key, (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.clientId !== clientId) })) });
      toastError(e);
    }
  };

  // Long press on a message: delete your own, report someone else's.
  const messageActions = async (m: MessageDto, mine: boolean) => {
    if (m.id.startsWith('tmp-')) return;
    if (!mine) {
      reportContent({ targetType: 'message', targetId: m.id });
      return;
    }
    if (!(await confirm(tr.t('chat.deleteConfirm'), { danger: true, confirmLabel: tr.t('common.delete') }))) return;
    try {
      await api.chat.remove(m.id);
      upsert({ ...m, deleted: true, text: '', attachment: null });
    } catch (e) {
      toastError(e);
    }
  };

  const attach = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try {
      const up = await uploadFile({ uri: a.uri, name: a.fileName ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg' }, 'chat');
      await send({ text: '', attachment: { url: up.url, name: a.fileName ?? 'photo.jpg', mime: up.mime, size: up.size, kind: 'image' } });
    } catch (e) {
      toastError(e);
    }
  };

  const attachFile = async () => {
    try {
      const f = await pickDocument();
      if (!f) return;
      const up = await uploadFile(f, 'chat');
      await send({ text: '', attachment: { url: up.url, name: f.name, mime: up.mime, size: up.size, kind: up.kind } });
    } catch (e) {
      toastError(e);
    }
  };

  const sendVoice = async ({ uri }: { uri: string; seconds: number }) => {
    try {
      const up = await uploadFile({ uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4' }, 'chat');
      await send({ text: '', attachment: { url: up.url, name: tr.t('chat.record'), mime: up.mime, size: up.size, kind: 'audio' } });
    } catch (e) {
      toastError(e);
    }
  };

  const peerRead = q.data?.pages[0]?.peerLastReadAt ?? null;
  const direct = conv.data?.kind === 'direct';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: conv.data?.title ?? tr.t('chat.title') }} />
      {q.isPending ? (
        <Loading />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.clientId ?? m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: m, index }) => {
            const mine = m.sender.id === me.id;
            const older = messages[index + 1];
            const showName = !direct && !mine && older?.sender.id !== m.sender.id;
            return (
              <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                {!mine && !direct ? <Avatar name={m.sender.displayName} url={m.sender.avatarUrl} size={28} /> : null}
                <Pressable
                  onLongPress={m.deleted ? undefined : () => messageActions(m, mine)}
                  delayLongPress={350}
                  accessibilityHint={m.deleted ? undefined : tr.t(mine ? 'common.delete' : 'common.report')}
                  style={{ maxWidth: '78%', backgroundColor: mine ? t.primary : t.bg3, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}
                >
                  {showName ? (
                    <Text weight="bold" size={11} color={t.primaryInk}>
                      {m.sender.displayName}
                    </Text>
                  ) : null}
                  {m.replyTo ? (
                    <View style={{ borderStartWidth: 3, borderStartColor: mine ? t.onPrimary : t.primary, paddingStart: 8, opacity: 0.85 }}>
                      <Text size={11} weight="bold" color={mine ? t.onPrimary : undefined}>
                        {m.replyTo.senderName}
                      </Text>
                      <Text size={12} numberOfLines={2} color={mine ? t.onPrimary : undefined}>
                        {m.replyTo.text}
                      </Text>
                    </View>
                  ) : null}
                  {m.deleted ? (
                    <Text muted={!mine} color={mine ? t.onPrimary : undefined} style={{ fontStyle: 'italic' }}>
                      {tr.t('chat.deleted')}
                    </Text>
                  ) : (
                    <>
                      {m.attachment?.kind === 'image' ? (
                        <Image
                          source={{ uri: fileUrl(m.attachment.url) }}
                          style={{ width: 220, height: 160, borderRadius: 12 }}
                          contentFit="cover"
                          accessibilityLabel={m.attachment.name}
                        />
                      ) : m.attachment?.kind === 'audio' ? (
                        <VoicePlayer uri={fileUrl(m.attachment.url)!} color={mine ? t.onPrimary : t.primaryInk} />
                      ) : m.attachment ? (
                        <Pressable
                          onPress={() => void Linking.openURL(fileUrl(m.attachment!.url)!)}
                          accessibilityRole="link"
                          style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
                        >
                          <Ionicons name="document-attach-outline" size={20} color={mine ? t.onPrimary : t.text} />
                          <Text weight="bold" color={mine ? t.onPrimary : undefined} numberOfLines={1}>
                            {m.attachment.name}
                          </Text>
                        </Pressable>
                      ) : null}
                      {m.text ? <Text color={mine ? t.onPrimary : undefined}>{m.text}</Text> : null}
                    </>
                  )}
                  <View style={{ flexDirection: 'row', alignSelf: 'flex-end', gap: 4, alignItems: 'center' }}>
                    <Text size={10} color={mine ? t.onPrimary : undefined} muted={!mine} style={{ opacity: 0.75 }}>
                      {formatTime(m.createdAt, tr)}
                    </Text>
                    {mine && !m.deleted ? (
                      <Ionicons
                        name={peerRead && m.createdAt <= peerRead ? 'checkmark-done' : 'checkmark'}
                        size={13}
                        color={t.onPrimary}
                        style={{ opacity: 0.85 }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
      )}
      <View style={{ height: 22, paddingHorizontal: 16 }}>
        {typing ? (
          <Text size={12} weight="bold" color={t.primaryInk}>
            {tr.t('chat.typing', { name: typing })}
          </Text>
        ) : null}
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: t.cardSolid, borderTopWidth: 1, borderTopColor: t.border }}
      >
        <Pressable
          onPress={attach}
          accessibilityRole="button"
          accessibilityLabel={tr.t('chat.attach')}
          style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="image-outline" size={24} color={t.primaryInk} />
        </Pressable>
        <Pressable
          onPress={attachFile}
          accessibilityRole="button"
          accessibilityLabel={tr.t('common.file')}
          style={{ width: 34, height: 42, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="attach" size={24} color={t.primaryInk} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (v && Date.now() - lastTyping.current > 2500) {
              lastTyping.current = Date.now();
              realtime.publish(channels.conv(id!), 'typing');
            }
          }}
          placeholder={tr.t('chat.placeholder')}
          placeholderTextColor={t.text3}
          multiline
          maxLength={4000}
          accessibilityLabel={tr.t('chat.placeholder')}
          style={{
            flex: 1,
            maxHeight: 120,
            minHeight: 42,
            borderRadius: 21,
            backgroundColor: t.bg2,
            borderWidth: 1,
            borderColor: t.border,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            color: t.text,
            fontFamily: FONT.regular,
            fontSize: 15,
            textAlign: 'auto',
          }}
        />
        {!text.trim() ? (
          <VoiceRecorder onRecorded={(f) => void sendVoice(f)} />
        ) : (
          <Pressable
            disabled={!text.trim()}
            onPress={() => {
              const v = text.trim();
              setText('');
              realtime.publish(channels.conv(id!), 'stop-typing');
              lastTyping.current = 0;
              void send({ text: v });
            }}
            accessibilityRole="button"
            accessibilityLabel={tr.t('common.send')}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: text.trim() ? t.primary : t.bg3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="send" size={19} color={text.trim() ? t.onPrimary : t.text3} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
