import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@qubedu/api-client';
import type { WorkspaceFileDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Sheet } from '@/components/kit';
import { Button, ErrorView, Input, Loading, Text } from '@/components/ui';
import { editorHtml } from '@/docs/editorHtml';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

type Format = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; ul?: boolean; ol?: boolean; block?: string };
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tool = { key: string; label: string; run: () => void; active?: boolean; icon?: IconName; glyph?: 'B' | 'I' | 'U' | 'S' };

/** Native document editor: native toolbar and title, a local editing surface, autosave with version checks. */
export default function DocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['workspace', 'file', id], queryFn: () => api.workspace.file(id!), staleTime: 0, gcTime: 0 });
  const web = useRef<WebView<object>>(null);
  const version = useRef(0);
  const pending = useRef<{ html?: string; title?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plain = useRef('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [fmt, setFmt] = useState<Format>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('https://');

  useEffect(() => {
    if (q.data) {
      version.current = q.data.version;
      setTitle(q.data.title);
    }
  }, [q.data]);

  const save = useCallback(async () => {
    const p = pending.current;
    if (p.html === undefined && p.title === undefined) return;
    pending.current = {};
    setStatus('saving');
    try {
      const next = await api.workspace.updateFile(id!, {
        version: version.current,
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.html !== undefined ? { content: { html: p.html } } : {}),
      });
      version.current = next.version;
      setStatus(pending.current.html !== undefined || pending.current.title !== undefined ? 'dirty' : 'saved');
      void qc.invalidateQueries({ queryKey: ['workspace', 'list'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') {
        // Edited somewhere else meanwhile: show the newer copy and tell the person.
        const current = e.details as WorkspaceFileDto | undefined;
        if (current) {
          version.current = current.version;
          setTitle(current.title);
          web.current?.injectJavaScript(`window.qb.set(${JSON.stringify((current.content as { html?: string } | undefined)?.html ?? '')});true;`);
        }
        toast(tr.t('docs.conflict'), 'err');
        setStatus('saved');
      } else {
        pending.current = { ...p, ...pending.current };
        setStatus('error');
      }
    }
  }, [id, qc, tr]);

  const schedule = useCallback(
    (patch: { html?: string; title?: string }) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 1200);
    },
    [save],
  );

  // Save what is left when leaving the screen.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void save();
    },
    [save],
  );

  // Built once per screen; appearance changes apply the next time the document opens.
  const html = useMemo(
    () =>
      editorHtml({
        dir: tr.locale === 'ar' ? 'rtl' : 'ltr',
        lang: tr.locale,
        bg: t.bg,
        text: t.text,
        muted: t.text3,
        accent: t.primaryInk,
        fontSize: Math.round(17 * t.textScale),
        lineHeight: t.dyslexic ? 1.85 : 1.6,
        letterSpacing: t.dyslexic && t.latin ? 0.6 : 0,
        dyslexic: t.dyslexic,
        placeholder: tr.t('docs.placeholder'),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type: string; html?: string; text?: string } & Format;
    try {
      msg = JSON.parse(e.nativeEvent.data) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      const initial = (q.data?.content as { html?: string } | undefined)?.html ?? '';
      web.current?.injectJavaScript(`window.qb.set(${JSON.stringify(initial)});true;`);
    } else if (msg.type === 'change' && typeof msg.html === 'string') {
      plain.current = msg.text ?? '';
      schedule({ html: msg.html });
    } else if (msg.type === 'state') setFmt(msg);
  };

  const cmd = (name: string, value?: string) => web.current?.injectJavaScript(`window.qb.cmd(${JSON.stringify(name)}, ${JSON.stringify(value ?? null)});true;`);

  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;

  const tools: Tool[] = [
    { key: 'undo', icon: 'arrow-undo-outline', label: tr.t('workspace.toolbar.undo'), run: () => cmd('undo') },
    { key: 'redo', icon: 'arrow-redo-outline', label: tr.t('workspace.toolbar.redo'), run: () => cmd('redo') },
    { key: 'h1', icon: 'text', label: tr.t('workspace.toolbar.h1'), run: () => cmd('h1'), active: fmt.block === 'h1' },
    { key: 'h2', icon: 'text-outline', label: tr.t('workspace.toolbar.h2'), run: () => cmd('h2'), active: fmt.block === 'h2' },
    { key: 'b', glyph: 'B', label: tr.t('workspace.toolbar.bold'), run: () => cmd('bold'), active: fmt.bold },
    { key: 'i', glyph: 'I', label: tr.t('workspace.toolbar.italic'), run: () => cmd('italic'), active: fmt.italic },
    { key: 'u', glyph: 'U', label: tr.t('workspace.toolbar.underline'), run: () => cmd('underline'), active: fmt.underline },
    { key: 's', glyph: 'S', label: tr.t('workspace.toolbar.strike'), run: () => cmd('strikeThrough'), active: fmt.strike },
    { key: 'ul', icon: 'list-outline', label: tr.t('workspace.toolbar.bullet'), run: () => cmd('insertUnorderedList'), active: fmt.ul },
    { key: 'ol', icon: 'list-circle-outline', label: tr.t('workspace.toolbar.ordered'), run: () => cmd('insertOrderedList'), active: fmt.ol },
    {
      key: 'quote',
      icon: 'chatbox-ellipses-outline',
      label: tr.t('workspace.toolbar.quote'),
      run: () => cmd('blockquote'),
      active: fmt.block === 'blockquote',
    },
    { key: 'link', icon: 'link-outline', label: tr.t('workspace.toolbar.link'), run: () => setLinkOpen(true) },
    { key: 'start', icon: 'reorder-two-outline', label: tr.t('docs.alignStart'), run: () => cmd(tr.locale === 'ar' ? 'justifyRight' : 'justifyLeft') },
    { key: 'center', icon: 'reorder-three-outline', label: tr.t('docs.alignCenter'), run: () => cmd('justifyCenter') },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: title || tr.t('docs.untitled'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr.t('docs.shareText')}
              hitSlop={10}
              onPress={() => void Share.share({ title, message: `${title}\n\n${plain.current}` }).catch(toastError)}
            >
              <Ionicons name="share-outline" size={22} color={t.text} />
            </Pressable>
          ),
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 2 }}>
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (v.trim()) schedule({ title: v.trim().slice(0, 200) });
          }}
          placeholder={tr.t('docs.untitled')}
          placeholderTextColor={t.text3}
          accessibilityLabel={tr.t('docs.title')}
          maxLength={200}
          style={{ fontFamily: t.fonts.black, fontSize: 22 * t.textScale, color: t.text, textAlign: tr.locale === 'ar' ? 'right' : 'left', paddingVertical: 4 }}
        />
        <Text muted size={11} accessibilityLiveRegion="polite">
          {tr.t(`docs.status.${status}`)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          ref={web}
          source={{ html }}
          originWhitelist={['about:*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:')}
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          style={{ backgroundColor: t.bg }}
        />
      </View>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderTopWidth: t.borderWidth, borderTopColor: t.border, backgroundColor: t.cardSolid }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}
      >
        {tools.map((x) => (
          <Pressable
            key={x.key}
            onPress={x.run}
            accessibilityRole="button"
            accessibilityLabel={x.label}
            accessibilityState={{ selected: !!x.active }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: x.active ? t.primarySoft : 'transparent',
            }}
          >
            {x.glyph ? (
              <Text
                weight="black"
                size={17}
                color={x.active ? t.primaryInk : t.text}
                style={{
                  fontStyle: x.glyph === 'I' ? 'italic' : 'normal',
                  textDecorationLine: x.glyph === 'U' ? 'underline' : x.glyph === 'S' ? 'line-through' : 'none',
                }}
              >
                {x.glyph}
              </Text>
            ) : (
              <Ionicons name={x.icon!} size={20} color={x.active ? t.primaryInk : t.text} />
            )}
          </Pressable>
        ))}
      </ScrollView>
      <Sheet
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={tr.t('workspace.toolbar.link')}
        footer={
          <Button
            title={tr.t('common.save')}
            disabled={!/^https?:\/\/\S+\.\S+/i.test(link.trim())}
            onPress={() => {
              cmd('link', link.trim());
              setLinkOpen(false);
              setLink('https://');
            }}
          />
        }
      >
        <Text muted size={13}>
          {tr.t('docs.linkHint')}
        </Text>
        <Input label="URL" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" />
      </Sheet>
    </KeyboardAvoidingView>
  );
}
