import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { DEMO, DEMO_DWELL_MS, DEMO_TOUR } from '../lib/demo';
import { FamilyProvider } from '../lib/family';
import { RecipeSync } from '../lib/recipeSync';
import { DataProvider, useData } from '../lib/store';
import { useTheme } from '../lib/theme';

/** Screenshot builds only (EXPO_PUBLIC_DEMO=1): walks through the screens so the build machine can photograph each. */
function DemoTour() {
  const { ready } = useData();
  useEffect(() => {
    if (!ready) return;
    const timers = DEMO_TOUR.slice(1).map((route, i) =>
      setTimeout(
        () => {
          if (router.canGoBack()) router.dismissAll();
          setTimeout(() => router.navigate(route as never), 600);
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
    <DataProvider>
    <FamilyProvider>
      <StatusBar style="auto" />
      <RecipeSync />
      {DEMO ? <DemoTour /> : null}
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Shop Stride' }} />
        <Stack.Screen name="route" options={{ title: 'Your route' }} />
        <Stack.Screen name="store" options={{ presentation: 'modal', title: 'Choose store' }} />
        <Stack.Screen name="item/[id]" options={{ presentation: 'modal', title: 'Where is it?' }} />
        <Stack.Screen name="aisle-scan" options={{ presentation: 'modal', title: 'Aisles from screenshots' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Add a recipe' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', title: 'Share a recipe' }} />
        <Stack.Screen name="family" options={{ presentation: 'modal', title: 'Family list' }} />
      </Stack>
    </FamilyProvider>
    </DataProvider>
    </AuthProvider>
  );
}
