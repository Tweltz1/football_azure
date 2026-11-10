import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompareStores } from '../../components/CompareStores';
import { NearbyMap } from '../../components/NearbyMap';
import { ScreenHeader, Segmented } from '../../components/ui';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

type StoresView = 'compare' | 'map';

// Everything about where to shop: the store you're using, the best stores for your list, and a map.
export default function StoresScreen() {
  const t = useTheme();
  const { store, items } = useData();
  const params = useLocalSearchParams<{ view?: string }>();
  // The view lives in the address, so other screens can open this tab on it
  // ("Find stores on a map", "Where to shop" after adding a recipe).
  const view: StoresView = params.view === 'map' ? 'map' : 'compare';
  const setView = (v: StoresView) => router.setParams({ view: v });

  const left = items.filter((i) => !i.checked).map((i) => i.name);
  const backToList = () => router.navigate('/');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Stores" />

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Pick a store by chain and ZIP code"
        onPress={() => router.push('/store')}
        style={[styles.current, { backgroundColor: t.card }]}
      >
        <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="storefront" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>Shopping at</Text>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
            {store ? store.name : 'No store yet'}
          </Text>
        </View>
        <Text style={{ color: t.primary, fontWeight: '600' }}>{store ? 'Change' : 'Choose'}</Text>
      </Pressable>

      <Segmented
        style={{ marginHorizontal: 16, marginBottom: 4 }}
        value={view}
        onChange={setView}
        options={[
          { value: 'compare', label: 'Best for my list' },
          { value: 'map', label: 'Map' },
        ]}
      />

      <View style={{ flex: 1 }}>
        {view === 'compare' ? (
          // Re-rank whenever the list changes.
          <CompareStores key={left.join('|')} onPicked={backToList} />
        ) : (
          <NearbyMap onPicked={backToList} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginTop: 10, marginBottom: 12, padding: 12, borderRadius: radius.md },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
