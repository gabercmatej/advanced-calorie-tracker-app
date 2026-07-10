import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CelebrationProvider } from '@/context/CelebrationContext';
import { DiaryProvider, useDiary } from '@/context/DiaryContext';
import { ResolvedThemeProvider, useResolvedScheme } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready: authReady, session } = useAuth();
  const { ready: diaryReady } = useDiary();
  const scheme = useResolvedScheme();
  const ready = authReady && diaryReady;

  // Keep the splash screen up until persisted data has hydrated.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = session !== null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Signed out: welcome / onboarding / sign-in. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        {/* Signed in: the app. */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log-weight" options={{ presentation: 'modal' }} />
          <Stack.Screen name="entry/[id]" options={{ presentation: 'modal' }} />
        </Stack.Protected>

        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

/** Bridges the persisted theme preference into the resolver. */
function ThemedRoot() {
  const { profile } = useDiary();
  return (
    <ResolvedThemeProvider preference={profile.theme}>
      <CelebrationProvider>
        <RootNavigator />
      </CelebrationProvider>
    </ResolvedThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <DiaryProvider>
            <ThemedRoot />
          </DiaryProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
