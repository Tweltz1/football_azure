import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DataProvider } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <DataProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text },
          headerStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Shop Stride' }} />
        <Stack.Screen name="route" options={{ title: 'Your route' }} />
        <Stack.Screen name="store" options={{ presentation: 'modal', title: 'Choose store' }} />
        <Stack.Screen name="map" options={{ presentation: 'modal', title: 'Stores near you' }} />
        <Stack.Screen name="item/[id]" options={{ presentation: 'modal', title: 'Where is it?' }} />
      </Stack>
    </DataProvider>
  );
}
