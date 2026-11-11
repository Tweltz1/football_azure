import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SignInGate } from '../components/SignInGate';
import { AuthProvider } from '../lib/auth';
import { DEMO, DEMO_DWELL_MS, DEMO_TOUR } from '../lib/demo';
import { ListsProvider } from '../lib/lists';
import { NativeBridge } from '../lib/native';
import { ProProvider } from '../lib/pro';
import { ToteProvider, useTotes } from '../lib/store';
import { SyncProvider } from '../lib/sync';
import { useTheme } from '../lib/theme';

// Opening the app from a label scan or Spotlight lands on a tote; keep My Totes underneath so Back works.
export const unstable_settings = { initialRouteName: 'index' };

/** Screenshot builds only (EXPO_PUBLIC_DEMO=1): walks through the screens so the build machine can photograph each. */
function DemoTour() {
  const { ready } = useTotes();
  useEffect(() => {
    if (!ready) return;
    const timers = DEMO_TOUR.slice(1).map((route, i) =>
      setTimeout(
        () => {
          if (router.canGoBack()) router.dismissAll();
          setTimeout(() => router.push(route as never), 600);
        },
        (i + 1) * DEMO_DWELL_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [ready]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <AuthProvider>
    <ToteProvider>
    <ListsProvider>
    <ProProvider>
    <SyncProvider>
      <StatusBar style="auto" />
      <NativeBridge />
      {DEMO ? <DemoTour /> : null}
      <SignInGate>
      <Stack
        screenOptions={{
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text },
          headerLargeTitleStyle: { color: t.text },
          headerStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: '' }} />
        <Stack.Screen name="tote/[id]" options={{ title: '' }} />
        <Stack.Screen name="tote/edit" options={{ presentation: 'modal', title: 'Tote' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="print" options={{ presentation: 'modal', title: 'Print labels' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account & backup' }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
        <Stack.Screen name="lists/index" options={{ title: 'Packing lists' }} />
        <Stack.Screen name="lists/[id]" options={{ title: '' }} />
        <Stack.Screen name="moving" options={{ title: 'Moving' }} />
        <Stack.Screen name="tote/snap" options={{ presentation: 'modal', title: 'Snap to add' }} />
        <Stack.Screen name="pro" options={{ presentation: 'modal', title: 'ToteTrack Pro' }} />
      </Stack>
      </SignInGate>
    </SyncProvider>
    </ProProvider>
    </ListsProvider>
    </ToteProvider>
    </AuthProvider>
  );
}
