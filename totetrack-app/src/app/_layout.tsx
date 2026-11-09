import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { ListsProvider } from '../lib/lists';
import { ToteProvider } from '../lib/store';
import { SyncProvider } from '../lib/sync';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <AuthProvider>
    <ToteProvider>
    <SyncProvider>
    <ListsProvider>
      <StatusBar style="auto" />
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
      </Stack>
    </ListsProvider>
    </SyncProvider>
    </ToteProvider>
    </AuthProvider>
  );
}
