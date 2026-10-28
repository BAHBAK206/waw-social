import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button, ErrorView, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { appPath } from '@/lib/links';
import { useTheme } from '@/lib/theme';
import { WEB_URL } from '@/lib/web';

/**
 * Opens a web-only tool (workspace editors, live room, admin console) inside the app, already signed in:
 * a one-time handoff code signs the embedded page in, and `embed=1` hides the web navigation.
 * Links to pages the app has natively open the native screen instead.
 */
export default function WebScreen() {
  const { path = '/', title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const attempt = useRef(0);

  const open = async () => {
    setFailed(false);
    try {
      // Live rooms use the camera and microphone inside the embedded page; Android asks the app first.
      if (Platform.OS === 'android' && path.startsWith('/live/'))
        await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]).catch(() => undefined);
      const { code } = await api.auth.handoff();
      const target = new URL(path.startsWith('/') ? path : `/${path}`, WEB_URL);
      target.searchParams.set('handoff', code);
      target.searchParams.set('embed', '1');
      setUrl(target.toString());
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => {
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (failed) return <ErrorView onRetry={() => void open()} />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: title ?? tr.t('nav.services') }} />
      {url ? (
        <WebView
          key={attempt.current}
          source={{ uri: url }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(req) => {
            if (!req.url.startsWith(WEB_URL)) return true;
            const u = new URL(req.url);
            // Pages the app has natively: open them as app screens.
            const native = appPath(`${u.pathname}${u.search}`);
            if (native && req.navigationType === 'click') {
              router.push(native as never);
              return false;
            }
            return true;
          }}
          style={{ flex: 1, backgroundColor: t.bg }}
        />
      ) : null}
      {loading && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={t.primary} size="large" />
          <Text muted>{tr.t('common.loading')}</Text>
          {!url && <Button small variant="ghost" title={tr.t('common.retry')} onPress={() => void open()} />}
        </View>
      )}
    </View>
  );
}
