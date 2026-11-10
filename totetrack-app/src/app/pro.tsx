import { router, Stack } from 'expo-router';
import { IconButton } from '../components/ui';
import { ProPaywall } from '../components/ProPaywall';
import { useTheme } from '../lib/theme';

export default function ProScreen() {
  const t = useTheme();
  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <IconButton icon="close" label="Close" onPress={() => router.back()} color={t.textMuted} /> }} />
      <ProPaywall onClose={() => router.back()} />
    </>
  );
}
