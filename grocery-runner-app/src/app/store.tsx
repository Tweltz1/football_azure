import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { backendConfigured, BackendStatus, backendStatus, findStores, FoundStore } from '../lib/api';
import { CHAINS } from '../lib/chains';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';
import { StoreChain } from '../lib/types';


const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export default function StoreScreen() {
  const t = useTheme();
  const { setStore } = useData();
  const [chain, setChain] = useState<StoreChain>('kroger');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [zip, setZip] = useState('');
  const [results, setResults] = useState<FoundStore[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [which, setWhich] = useState('');
  const [aisles, setAisles] = useState('24');

  useEffect(() => {
    if (backendConfigured) backendStatus().then(setStatus).catch(() => {});
  }, []);

  const label = CHAINS.find((c) => c.chain === chain)!.label;
  // Kroger and Walmart have official store search; the rest are identified by ZIP (+ a street if needed).
  const searchable = (chain === 'kroger' && status?.kroger) || (chain === 'walmart' && status?.walmart);
  const aisleCount = () => {
    const n = parseInt(aisles, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 20;
  };

  const choose = (c: StoreChain) => {
    setChain(c);
    setAisles(String(CHAINS.find((x) => x.chain === c)!.aisles));
    setResults(null);
    setError(null);
  };

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setResults(await findStores(chain as 'kroger' | 'walmart', zip.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickFound = (s: FoundStore) => {
    setStore({
      id: `${chain}:${s.id.toLowerCase()}`,
      chain,
      name: s.name,
      address: s.address,
      aisleCount: chain === 'kroger' ? 24 : aisleCount(),
    });
    router.back();
  };

  const pickByZip = () => {
    const w = slug(which);
    if (chain === 'other') {
      const name = which.trim() || 'My store';
      setStore({ id: `custom:${slug(name) || 'store'}`, chain, name, aisleCount: aisleCount() });
    } else {
      setStore({
        id: `${chain}:${zip}${w ? `-${w}` : ''}`,
        chain,
        name: which.trim() ? `${label} ${which.trim()}` : label,
        address: `ZIP ${zip}`,
        aisleCount: aisleCount(),
      });
    }
    router.back();
  };

  const input = [styles.input, { color: t.text, backgroundColor: t.cardAlt }];
  const zipOk = /^\d{5}$/.test(zip);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {backendConfigured && (
        <Button title="Find stores on a map" icon="map" onPress={() => router.push('/map')} />
      )}
      <SectionTitle>Or pick by ZIP</SectionTitle>
      <View style={styles.chips}>
        {CHAINS.map((c) => (
          <Chip key={c.chain} label={c.label} selected={chain === c.chain} onPress={() => choose(c.chain)} />
        ))}
      </View>

      <SectionTitle>{label}</SectionTitle>
      <Card>
        <Text style={{ color: t.textMuted, marginBottom: 10 }}>
          {chain === 'kroger'
            ? "Kroger, Fry's, King Soopers, Ralphs, Smith's, Fred Meyer and more. Aisles fill in from Kroger."
            : chain === 'other'
              ? 'Kept on this phone only. Items sort by department, and aisles you type are remembered.'
              : 'Aisles come from other shoppers at this store. Any aisle you type helps the next shopper.'}
        </Text>

        {chain !== 'other' && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={zip}
              onChangeText={(z) => {
                setZip(z.replace(/\D/g, ''));
                setResults(null);
              }}
              placeholder="ZIP code"
              placeholderTextColor={t.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              style={[...input, { flex: 1 }]}
            />
            {searchable && <Button title="Find" onPress={search} loading={busy} disabled={!zipOk} />}
          </View>
        )}
        {error && <Text style={{ color: t.danger, marginTop: 8 }}>{error}</Text>}
        {results?.length === 0 && <Text style={{ color: t.textMuted, marginTop: 8 }}>No stores near that ZIP.</Text>}
        {results?.map((s) => (
          <Pressable key={s.id} onPress={() => pickFound(s)} style={[styles.result, { borderColor: t.border }]}>
            <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>{s.name}</Text>
            <Text style={{ color: t.textMuted }}>{s.address}</Text>
          </Pressable>
        ))}

        {chain === 'kroger' && !searchable && (
          <Text style={{ color: t.warn, marginTop: 8 }}>Kroger lookup is not switched on yet.</Text>
        )}

        {!searchable && chain !== 'kroger' && (
          <>
            <TextInput
              value={which}
              onChangeText={setWhich}
              placeholder={chain === 'other' ? 'Store name' : 'Street (only if two are in this ZIP)'}
              placeholderTextColor={t.textMuted}
              style={[...input, { marginTop: chain === 'other' ? 0 : 10 }]}
            />
          </>
        )}

        {chain !== 'kroger' && (
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
        )}

        {!searchable && chain !== 'kroger' && (
          <Button
            title="Use this store"
            onPress={pickByZip}
            disabled={chain !== 'other' && !zipOk}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
  result: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
