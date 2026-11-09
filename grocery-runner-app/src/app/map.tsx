import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Button, Chip } from '../components/ui';
import { chainInfo } from '../lib/chains';
import { MapStore, storesNear } from '../lib/nearby';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

type Filter = 'all' | 'mapped';

// Refetch only after the map moves this far (about 8 km), so panning stays quiet.
const REFETCH_DEG = 0.07;

export default function MapScreen() {
  const t = useTheme();
  const { setStore } = useData();
  const map = useRef<MapView>(null);
  const [stores, setStores] = useState<MapStore[]>([]);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MapStore | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const lastFetch = useRef<{ lat: number; lon: number } | null>(null);

  const colorFor = (s: MapStore) => (s.coverage === 'kroger' ? t.primary : s.items > 0 ? t.stop : t.textMuted);
  const coverageText = (s: MapStore) =>
    s.coverage === 'kroger'
      ? 'Aisles for every item, from Kroger'
      : s.items > 0
        ? `${s.items} item${s.items === 1 ? '' : 's'} mapped by shoppers`
        : 'No aisles yet. Be the first to add some.';

  const load = useCallback(async (lat: number, lon: number) => {
    lastFetch.current = { lat, lon };
    setBusy(true);
    setError(null);
    try {
      setStores(await storesNear(lat, lon));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const goTo = useCallback(
    (lat: number, lon: number) => {
      setCenter({ lat, lon });
      map.current?.animateToRegion({ latitude: lat, longitude: lon, latitudeDelta: 0.18, longitudeDelta: 0.18 }, 400);
      load(lat, lon);
    },
    [load],
  );

  // Start at the shopper's location if they allow it; otherwise wait for a ZIP or city.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync() ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (pos) goTo(pos.coords.latitude, pos.coords.longitude);
    })().catch(() => {});
  }, [goTo]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    try {
      const [hit] = await Location.geocodeAsync(q);
      if (hit) goTo(hit.latitude, hit.longitude);
      else setError('Could not find that place.');
    } catch {
      setError('Could not find that place.');
    }
  };

  const onRegionChangeComplete = (r: Region) => {
    const last = lastFetch.current;
    if (last && (Math.abs(r.latitude - last.lat) > REFETCH_DEG || Math.abs(r.longitude - last.lon) > REFETCH_DEG)) {
      load(r.latitude, r.longitude);
    }
  };

  const shopHere = (s: MapStore) => {
    setStore({
      id: s.key,
      chain: s.chain,
      name: s.name,
      address: s.address || undefined,
      aisleCount: chainInfo(s.chain).aisles,
      lat: s.lat,
      lon: s.lon,
    });
    router.dismissAll();
  };

  const shown = filter === 'mapped' ? stores.filter((s) => s.coverage === 'kroger' || s.items > 0) : stores;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        initialRegion={{ latitude: 39.5, longitude: -95, latitudeDelta: 30, longitudeDelta: 30 }}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={() => setSelected(null)}
      >
        {shown.map((s) => (
          <Marker
            key={s.key}
            coordinate={{ latitude: s.lat, longitude: s.lon }}
            pinColor={colorFor(s)}
            onPress={(e) => {
              e.stopPropagation();
              setSelected(s);
            }}
          />
        ))}
      </MapView>

      <View style={styles.top}>
        <View style={[styles.searchRow, { backgroundColor: t.card }]}>
          <Ionicons name="search" size={18} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            placeholder="ZIP code or city"
            placeholderTextColor={t.textMuted}
            returnKeyType="search"
            style={[styles.input, { color: t.text }]}
          />
          {busy && <ActivityIndicator />}
        </View>
        <View style={styles.chips}>
          <Chip label="All stores" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="With aisles" selected={filter === 'mapped'} onPress={() => setFilter('mapped')} />
        </View>
        {error && <Text style={[styles.note, { color: t.danger, backgroundColor: t.card }]}>{error}</Text>}
        {center && !busy && !error && stores.length === 0 && (
          <Text style={[styles.note, { color: t.textMuted, backgroundColor: t.card }]}>
            No supported stores found here. Try another ZIP code or city.
          </Text>
        )}
        {!center && !error && (
          <Text style={[styles.note, { color: t.textMuted, backgroundColor: t.card }]}>
            Search a ZIP code or city, or allow location to see stores near you.
          </Text>
        )}
      </View>

      <View style={styles.bottom}>
        {selected ? (
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.name, { color: t.text }]}>{selected.name}</Text>
            {!!selected.address && <Text style={{ color: t.textMuted }}>{selected.address}</Text>}
            <View style={styles.coverage}>
              <View style={[styles.dot, { backgroundColor: colorFor(selected) }]} />
              <Text style={{ color: t.text, flex: 1 }}>{coverageText(selected)}</Text>
            </View>
            <Button title="Shop here" icon="cart" onPress={() => shopHere(selected)} />
          </View>
        ) : (
          <View style={[styles.legend, { backgroundColor: t.card }]}>
            <Legend color={t.primary} text="Kroger aisles" />
            <Legend color={t.stop} text="Shopper aisles" />
            <Legend color={t.textMuted} text="Not mapped yet" />
          </View>
        )}
      </View>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: t.text, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.md, height: 50 },
  input: { flex: 1, fontSize: 17 },
  chips: { flexDirection: 'row', gap: 8 },
  note: { padding: 12, borderRadius: radius.md, overflow: 'hidden' },
  bottom: { position: 'absolute', bottom: 24, left: 12, right: 12, gap: 6 },
  sheet: { padding: 16, borderRadius: radius.lg, gap: 6 },
  name: { fontSize: 19, fontWeight: '700' },
  coverage: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legend: { flexDirection: 'row', justifyContent: 'space-around', padding: 12, borderRadius: radius.lg },
});
