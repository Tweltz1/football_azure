import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ToteProvider } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <ToteProvider>
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
        <Stack.Screen name="index" options={{ title: 'My Totes', headerLargeTitleEnabled: true }} />
        <Stack.Screen name="tote/[id]" options={{ title: '' }} />
        <Stack.Screen name="tote/edit" options={{ presentation: 'modal', title: 'Tote' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="print" options={{ presentation: 'modal', title: 'Print labels' }} />
      </Stack>
    </ToteProvider>
  );
}
