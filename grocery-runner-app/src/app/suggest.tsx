import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { backendConfigured } from '../lib/api';
import { chainInfo } from '../lib/chains';
import { storesNear } from '../lib/nearby';
import { useData } from '../lib/store';
import { available, compareStores, estimate, missing, StoreOption, toStore } from '../lib/storePick';
import { radius, useTheme } from '../lib/theme';

export default function SuggestScreen() {
  const t = useTheme();
  const { items, setStore } = useData();
  const names = items.filter((i) => !i.checked).map((i) => i.name);
  const [options, setOptions] = useState<StoreOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPlace, setNeedPlace] = useState(false);
  const [place, setPlace] = useState('');

  const compare = useCallback(
    async (lat: number, lon: number) => {
      setBusy(true);
      setError(null);
      try {
        const found = await compareStores(await storesNear(lat, lon), { lat, lon }, names);
        setOptions(found);
        if (!found.length) setError('No supported stores within 15 miles.');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    // Compare once for the list as it is when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setNeedPlace(true);
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (pos) compare(pos.coords.latitude, pos.coords.longitude);
      else setNeedPlace(true);
    })().catch(() => setNeedPlace(true));
  }, [compare]);

  const searchPlace = async () => {
    try {
      const [hit] = await Location.geocodeAsync(place.trim());
      if (hit) compare(hit.latitude, hit.longitude);
      else setError('Could not find that place.');
    } catch {
      setError('Could not find that place.');
    }
  };

  const shopHere = (o: StoreOption) => {
    setStore(toStore(o.store));
    router.dismissTo('/');
  };

  if (!backendConfigured) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.textMuted }}>Comparing stores needs the online service, which is not set up in this build.</Text>
      </View>
    );
  }

  const describe = (o: StoreOption) => {
    const lines: { text: string; tone?: 'good' | 'warn' | 'muted' }[] = [];
    if (o.stock) {
      const have = available(o.stock);
      const low = o.stock.filter((c) => c.stock === 'low').length;
      const unknown = o.stock.filter((c) => c.stock === 'unknown').length;
      lines.push({ text: `${have} of ${o.items} in stock${low ? ` (${low} running low)` : ''}`, tone: have === o.items ? 'good' : 'warn' });
      const out = missing(o.stock);
      if (out.length) lines.push({ text: `Out: ${out.join(', ')}`, tone: 'warn' });
      if (unknown) lines.push({ text: `${unknown} not found at this store`, tone: 'muted' });
      const est = estimate(o.stock);
      if (est) lines.push({ text: `About $${est.total.toFixed(2)} for ${est.priced} item${est.priced === 1 ? '' : 's'} (Kroger prices)` });
    } else {
      lines.push({ text: `${chainInfo(o.store.chain).label} doesn't share stock, so it can't be checked`, tone: 'muted' });
      lines.push({ text: o.mapped ? `${o.mapped} of ${o.items} aisles known` : 'No aisles mapped yet for these items' });
    }
    if (o.onSale) lines.push({ text: `${o.onSale} item${o.onSale === 1 ? '' : 's'} on sale this week`, tone: 'good' });
    return lines;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.textMuted }}>
        {`Comparing stores near you for ${names.length} item${names.length === 1 ? '' : 's'}. Stock and prices come from Kroger and its stores (Pick 'n Save, Fry's, King Soopers…). Other chains don't publish stock, so they are ranked by distance and how many aisles shoppers have mapped.`}
      </Text>

      {needPlace && !options && !busy && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: t.text }}>Where are you shopping? Enter a ZIP code or city.</Text>
          <TextInput
            value={place}
            onChangeText={setPlace}
            onSubmitEditing={searchPlace}
            placeholder="ZIP or city"
            placeholderTextColor={t.textMuted}
            returnKeyType="search"
            style={[styles.input, { color: t.text, backgroundColor: t.cardAlt }]}
          />
          <Button title="Compare stores" onPress={searchPlace} disabled={place.trim().length < 3} />
        </Card>
      )}

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={t.primary} />
          <Text style={{ color: t.textMuted }}>Checking nearby stores…</Text>
        </View>
      )}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}

      {options?.map((o, n) => (
        <Card key={o.store.key} style={[{ gap: 6 }, n === 0 && { borderWidth: 2, borderColor: t.primary }]}>
          {n === 0 && (
            <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
              <Ionicons name="star" size={13} color={t.primary} />
              <Text style={{ color: t.primary, fontWeight: '700', fontSize: 13 }}>Best pick</Text>
            </View>
          )}
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{o.store.name}</Text>
          <Text style={{ color: t.textMuted }}>
            {o.miles.toFixed(1)} mi{o.store.address ? ` · ${o.store.address}` : ''}
          </Text>
          {describe(o).map((l) => (
            <Text
              key={l.text}
              style={{ color: l.tone === 'good' ? t.primary : l.tone === 'warn' ? t.warn : l.tone === 'muted' ? t.textMuted : t.text }}
            >
              {l.text}
            </Text>
          ))}
          <Button title="Shop here" icon="navigate" variant={n === 0 ? 'primary' : 'secondary'} onPress={() => shopHere(o)} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 16, padding: 12, borderRadius: radius.sm },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
