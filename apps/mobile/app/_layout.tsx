import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, useFonts } from '@expo-google-fonts/tajawal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '@/components/Toast';
import { useAppearance } from '@/lib/appearance';
import { boot } from '@/lib/boot';
import { useT } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Gate() {
  const status = useSession((s) => s.status);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (status === 'loading') return;
    const inAuth = segments[0] === '(auth)';
    if (status === 'guest' && !inAuth) router.replace('/login');
    else if (status === 'authed' && inAuth) router.replace('/');
  }, [status, segments, router]);
  return null;
}

function Shell() {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Gate />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.cardSolid },
          headerTintColor: t.text,
          headerTitleStyle: { fontFamily: 'Tajawal_700Bold' },
          contentStyle: { backgroundColor: t.bg },
          headerBackTitle: tr.t('common.back'),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="quiz/[id]" options={{ title: tr.t('nav.quiz') }} />
        <Stack.Screen name="post/[id]" options={{ title: tr.t('feed.title') }} />
        <Stack.Screen name="video/[id]" options={{ title: tr.t('nav.watch') }} />
        <Stack.Screen name="chat/[id]" options={{ title: tr.t('chat.title') }} />
        <Stack.Screen name="user/[id]" options={{ title: tr.t('nav.profile') }} />
        <Stack.Screen name="group/[id]" options={{ title: tr.t('groups.title') }} />
        <Stack.Screen name="groups" options={{ title: tr.t('groups.title') }} />
        <Stack.Screen name="people" options={{ title: tr.t('people.title') }} />
        <Stack.Screen name="saved" options={{ title: tr.t('saved.title') }} />
        <Stack.Screen name="notifications" options={{ title: tr.t('notifications.title') }} />
        <Stack.Screen name="settings" options={{ title: tr.t('settings.title') }} />
        <Stack.Screen name="live" options={{ title: tr.t('live.title') }} />
        <Stack.Screen name="lab" options={{ title: tr.t('lab.title') }} />
        <Stack.Screen name="study" options={{ title: tr.t('nav.academic') }} />
        <Stack.Screen name="tutor" options={{ title: tr.t('nav.ai') }} />
        <Stack.Screen name="assistant" options={{ title: tr.t('nav.assistant') }} />
        <Stack.Screen name="school" options={{ title: tr.t('nav.school') }} />
        <Stack.Screen name="course/[id]" options={{ title: tr.t('nav.school') }} />
        <Stack.Screen name="assignment/[id]" options={{ title: tr.t('school.tabs.assignments') }} />
        <Stack.Screen name="library" options={{ title: tr.t('nav.library') }} />
        <Stack.Screen name="events" options={{ title: tr.t('nav.events') }} />
        <Stack.Screen name="event/[id]" options={{ title: tr.t('nav.events') }} />
        <Stack.Screen name="tips" options={{ title: tr.t('nav.stories') }} />
        <Stack.Screen name="forms" options={{ title: tr.t('nav.forms') }} />
        <Stack.Screen name="form/[slug]" options={{ title: tr.t('nav.forms') }} />
        <Stack.Screen name="organizer" options={{ title: tr.t('nav.organizer') }} />
        <Stack.Screen name="studio" options={{ title: tr.t('nav.studio') }} />
      </Stack>
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold });
  const ready = useAppearance((s) => s.ready);
  const status = useSession((s) => s.status);
  useEffect(() => {
    void useAppearance
      .getState()
      .hydrate()
      .then(() => boot());
  }, []);
  useEffect(() => {
    if (fontsLoaded && ready && status !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, ready, status]);
  if (!fontsLoaded || !ready) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
