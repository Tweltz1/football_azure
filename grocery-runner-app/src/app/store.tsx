import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import { findKrogerStores, krogerConfigured, KrogerStore } from '../lib/kroger';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function StoreScreen() {
  const t = useTheme();
  const { setStore, refreshLocations } = useData();
  const [zip, setZip] = useState('');
  const [results, setResults] = useState<KrogerStore[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [aisles, setAisles] = useState('20');

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setResults(await findKrogerStores(zip.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickKroger = (s: KrogerStore) => {
    setStore({ id: `kroger:${s.locationId}`, chain: 'kroger', name: s.name, address: s.address, aisleCount: 24 });
    // Let the new store's state settle, then look up aisles for the list.
    setTimeout(() => refreshLocations(), 0);
    router.back();
  };

  const pickOther = () => {
    const n = parseInt(aisles, 10);
    const trimmed = name.trim() || 'My store';
    setStore({
      id: `custom:${trimmed.toLowerCase()}`,
      chain: 'other',
      name: trimmed,
      aisleCount: Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 20,
    });
    router.back();
  };

  const input = [styles.input, { color: t.text, backgroundColor: t.cardAlt }];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Kroger family stores</SectionTitle>
      <Card>
        <Text style={{ color: t.textMuted, marginBottom: 10 }}>
          Kroger, Fry&apos;s, King Soopers, Ralphs, Smith&apos;s, Fred Meyer and more. Aisles fill in automatically.
        </Text>
        {krogerConfigured ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={zip}
                onChangeText={setZip}
                placeholder="ZIP code"
                placeholderTextColor={t.textMuted}
                keyboardType="number-pad"
                maxLength={5}
                style={[...input, { flex: 1 }]}
              />
              <Button title="Find" onPress={search} loading={busy} disabled={zip.length !== 5} />
            </View>
            {error && <Text style={{ color: t.danger, marginTop: 8 }}>{error}</Text>}
            {results?.length === 0 && <Text style={{ color: t.textMuted, marginTop: 8 }}>No stores near that ZIP.</Text>}
            {results?.map((s) => (
              <Pressable key={s.locationId} onPress={() => pickKroger(s)} style={[styles.result, { borderColor: t.border }]}>
                <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>{s.name}</Text>
                <Text style={{ color: t.textMuted }}>{s.address}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <Text style={{ color: t.warn }}>Kroger lookup is not switched on in this build yet.</Text>
        )}
      </Card>

      <SectionTitle>Any other store</SectionTitle>
      <Card>
        <Text style={{ color: t.textMuted, marginBottom: 10 }}>
          Items are sorted by department (produce first, frozen and dairy last). Type an aisle on any item once and
          the app remembers it for this store.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Store name, like Costco on Main St"
          placeholderTextColor={t.textMuted}
          style={input}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Text style={{ color: t.text, flex: 1 }}>Number of aisles</Text>
          <TextInput
            value={aisles}
            onChangeText={setAisles}
            keyboardType="number-pad"
            maxLength={2}
            style={[...input, { width: 70, textAlign: 'center' }]}
          />
        </View>
        <Button title="Use this store" onPress={pickOther} style={{ marginTop: 12 }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
  result: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
