import { Ionicons } from '@expo/vector-icons';
import type { AssistantMessageDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { ReadAloud } from '@/components/ReadAloud';
import { FeatureGate, Sheet } from '@/components/kit';
import { Chip, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { appPath } from '@/lib/links';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { canRecognize, listen, MicDeniedError } from '@/lib/recognition';
import { speak } from '@/lib/speech';
import { confirm, toast, toastError } from '@/lib/ui';
import { GuideHint } from '@/components/Guide';

function Bubble({ m }: { m: AssistantMessageDto }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [rating, setRating] = useState(m.rating);
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      <View
        style={{
          maxWidth: '88%',
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: mine ? t.primary : t.cardSolid,
          borderWidth: mine ? 0 : 1,
          borderColor: t.border,
        }}
      >
        <Text color={mine ? t.onPrimary : undefined}>{m.content}</Text>
      </View>
      {!mine && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 }}>
          <ReadAloud text={m.content} size={18} />
          {(['up', 'down'] as const).map((r) => (
            <Pressable
              key={r}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: rating === r }}
              accessibilityLabel={r === 'up' ? tr.t('assistant.helpful') : tr.t('assistant.notHelpful')}
              onPress={async () => {
                try {
                  await api.assistant.feedback(m.id, r);
                  setRating(r);
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Ionicons
                name={r === 'up' ? (rating === 'up' ? 'thumbs-up' : 'thumbs-up-outline') : rating === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                size={17}
                color={t.text2}
              />
            </Pressable>
          ))}
        </View>
      )}
      {!mine && m.actions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.actions.map((a) => {
            const href = appPath(a.link);
            return href ? <Chip key={a.link} label={a.label} onPress={() => router.push(href as never)} /> : null;
          })}
        </View>
      )}
      {!mine && m.sources.length > 0 && (
        <Text muted size={11}>
          {m.sources.map((s) => `📄 ${s.title}${s.page ? ` · ${tr.t('ai.page', { page: s.page })}` : ''}`).join('\n')}
        </Text>
      )}
    </View>
  );
}

export default function AssistantScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const language = useSession((s) => s.me?.appearance.language);
  const threads = useQuery({ queryKey: ['assistant', 'threads'], queryFn: () => api.assistant.threads() });
  const [threadId, setThreadId] = useState<string | null>(null);
  const thread = useQuery({ queryKey: ['assistant', 'thread', threadId], queryFn: () => api.assistant.thread(threadId!), enabled: !!threadId });
  const [pending, setPending] = useState<AssistantMessageDto[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  const [hints, setHints] = useState(false);
  const [listening, setListening] = useState<{ stop: () => void } | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const ref = useRef<FlatList<AssistantMessageDto>>(null);
  const messages = [...(threadId ? (thread.data?.messages ?? []) : []), ...pending];

  const talk = async () => {
    if (listening) {
      listening.stop();
      return;
    }
    if (!canRecognize()) {
      toast(tr.t('assistant.voiceUnsupported'), 'err');
      return;
    }
    try {
      const l = await listen(language ?? 'en', setText);
      setListening(l);
      const said = await l.result;
      setListening(null);
      if (said.trim()) void send(said);
    } catch (e) {
      setListening(null);
      if (!(e instanceof MicDeniedError)) toastError(e);
    }
  };

  const send = async (content: string) => {
    const body = content.trim();
    if (!body || busy) return;
    setText('');
    setBusy(true);
    setPending((p) => [
      ...p,
      { id: `tmp-${Date.now()}`, threadId: threadId ?? '', role: 'user', content: body, sources: [], actions: [], rating: null, createdAt: Date.now() },
    ]);
    try {
      const res = await api.assistant.send({ threadId, text: body, language, hints });
      qc.setQueryData(['assistant', 'thread', res.threadId], (old: { thread: unknown; messages: AssistantMessageDto[] } | undefined) => ({
        thread: old?.thread ?? { id: res.threadId, title: body.slice(0, 60), updatedAt: Date.now() },
        messages: [...(old?.messages ?? []), res.userMessage, res.message],
      }));
      setThreadId(res.threadId);
      setPending([]);
      if (readAloud) speak(res.message.content, res.message.id, language ?? 'en');
      void qc.invalidateQueries({ queryKey: ['assistant', 'threads'] });
    } catch (e) {
      setPending([]);
      setText(body);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FeatureGate id="assistant">
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={tr.t('assistant.threads')} onPress={() => setList(true)}>
                <Ionicons name="albums-outline" size={22} color={t.text} />
              </Pressable>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={tr.t('assistant.newChat')}
                onPress={() => {
                  setThreadId(null);
                  setPending([]);
                }}
              >
                <Ionicons name="create-outline" size={22} color={t.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={ref}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          onContentSizeChange={() => ref.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color={t.primary} />
              <Text weight="black" size={18}>
                {tr.t('assistant.empty')}
              </Text>
              <Text muted style={{ textAlign: 'center' }}>
                {tr.t('assistant.subtitle')}
              </Text>
              <View style={{ alignSelf: 'stretch' }}>
                <GuideHint id="assistant" />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {tr.dict.assistant.suggestions.map((s) => (
                  <Chip key={s} label={s} onPress={() => void send(s)} />
                ))}
              </View>
            </View>
          }
          ListFooterComponent={busy ? <ActivityIndicator color={t.primary} style={{ marginTop: 8 }} /> : undefined}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            padding: 10,
            backgroundColor: t.cardSolid,
            borderTopWidth: 1,
            borderTopColor: t.border,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Pressable
              onPress={() => setHints((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hints }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name={hints ? 'checkbox' : 'square-outline'} size={18} color={hints ? t.primary : t.text3} />
              <Text size={12}>{tr.t('aiGuard.hintsToggle')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setReadAloud((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: readAloud }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name={readAloud ? 'checkbox' : 'square-outline'} size={18} color={readAloud ? t.primary : t.text3} />
              <Text size={12}>{tr.t('assistant.voiceReplies')}</Text>
            </Pressable>
            <Input value={text} onChangeText={setText} placeholder={tr.t('assistant.placeholder')} multiline maxLength={4000} />
          </View>
          <Pressable
            onPress={() => void talk()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: !!listening }}
            accessibilityLabel={listening ? tr.t('assistant.voiceStop') : tr.t('assistant.voice')}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: listening ? t.errFill : t.primarySoft,
            }}
          >
            <Ionicons name={listening ? 'stop' : 'mic'} size={20} color={listening ? t.onPrimary : t.primaryInk} />
          </Pressable>
          <Pressable
            onPress={() => void send(text)}
            disabled={!text.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel={tr.t('common.send')}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.primary,
              opacity: !text.trim() || busy ? 0.5 : 1,
            }}
          >
            <Ionicons name="send" size={20} color={t.onPrimary} style={{ transform: [{ scaleX: tr.dir === 'rtl' ? -1 : 1 }] }} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Sheet open={list} onClose={() => setList(false)} title={tr.t('assistant.threads')}>
        {(threads.data?.items ?? []).map((th) => (
          <View key={th.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
              accessibilityRole="button"
              onPress={() => {
                setThreadId(th.id);
                setPending([]);
                setList(false);
              }}
            >
              <Text weight={th.id === threadId ? 'bold' : 'regular'} numberOfLines={1}>
                {th.title}
              </Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tr.t('assistant.deleteThread')}
              onPress={async () => {
                if (!(await confirm(tr.t('assistant.deleteThread'), { danger: true }))) return;
                try {
                  await api.assistant.deleteThread(th.id);
                  if (th.id === threadId) setThreadId(null);
                  await threads.refetch();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <Ionicons name="trash-outline" size={18} color={t.text3} />
            </Pressable>
          </View>
        ))}
      </Sheet>
    </FeatureGate>
  );
}
