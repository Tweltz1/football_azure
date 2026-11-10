import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { ListsProvider } from '../lib/lists';
import { NativeBridge } from '../lib/native';
import { ProProvider } from '../lib/pro';
import { ToteProvider } from '../lib/store';
import { SyncProvider } from '../lib/sync';
import { useTheme } from '../lib/theme';

// Opening the app from a label scan or Spotlight lands on a tote; keep My Totes underneath so Back works.
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const t = useTheme();
  return (
    <AuthProvider>
    <ToteProvider>
    <ProProvider>
    <SyncProvider>
    <ListsProvider>
      <StatusBar style="auto" />
      <NativeBridge />
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
    </ListsProvider>
    </SyncProvider>
    </ProProvider>
    </ToteProvider>
    </AuthProvider>
  );
}
