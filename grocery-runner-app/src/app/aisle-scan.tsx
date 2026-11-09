import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { photoReadingAvailable, recognizeText } from '../../modules/recipe-reader';
import { Button, Card, SectionTitle, tap } from '../components/ui';
import { AisleMatch, FoundAisle, findAisles, matchAisles } from '../lib/aisleText';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

/**
 * Aisles from screenshots of a store's own app (Walmart, Woodman's, ...). The shopper picks
 * screenshots they took; the phone reads them (nothing is uploaded) and fills in aisles for list items.
 */
export default function AisleScanScreen() {
  const t = useTheme();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const { items, store, setLocation } = useData();
  const onlyItem = itemId ? items.find((i) => i.id === itemId) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<AisleMatch[] | null>(null);
  const [unmatched, setUnmatched] = useState<FoundAisle[]>([]);
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: !onlyItem,
      selectionLimit: onlyItem ? 1 : 20,
      quality: 1,
    });
    if (result.canceled || !result.assets.length) return;
    setBusy(true);
    try {
      const found: FoundAisle[] = [];
      for (const asset of result.assets) found.push(...findAisles(await recognizeText(asset.uri)));
      if (!found.length) {
        setError('No aisle numbers found. Use a screenshot of the item in the store app that shows "Aisle ...".');
        setMatches(null);
        return;
      }
      const list = items.filter((i) => !i.checked);
      const m = matchAisles(found, list, onlyItem);
      setMatches(m);
      setUnmatched(onlyItem ? [] : found.filter((f) => !m.some((x) => x.aisle === f.aisle)));
      setSkip(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    for (const m of matches ?? []) {
      if (skip.has(m.item.id)) continue;
      setLocation(m.item.id, { kind: 'aisle', aisle: m.aisle, bay: m.bay, source: 'user' });
    }
    // From an item's sheet, close that sheet too.
    if (onlyItem) router.dismissAll();
    else router.back();
  };

  const chosen = (matches ?? []).filter((m) => !skip.has(m.item.id)).length;

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Reading your screenshots…</Text>
        <Text style={{ color: t.textMuted }}>Read on your phone. Nothing is uploaded.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <Text style={{ color: t.text, fontSize: 16, lineHeight: 22 }}>
          {onlyItem
            ? `In the ${store?.name ?? 'store'} app, look up ${onlyItem.name} for your store and take a screenshot where the aisle shows. Then pick it here.`
            : `In the ${store?.name ?? 'store'} app (Walmart, Woodman's and others show aisles), look up items for your store and screenshot each one or the search results. Then pick the screenshots here.`}
        </Text>
        {!store && <Text style={{ color: t.warn }}>Choose your store first, so the aisles are saved for the right store.</Text>}
        {!photoReadingAvailable && <Text style={{ color: t.warn }}>Reading screenshots needs the iPhone app from TestFlight.</Text>}
        <Button
          title={onlyItem ? 'Choose a screenshot' : 'Choose screenshots'}
          icon="images"
          disabled={!store || !photoReadingAvailable}
          onPress={pick}
        />
        {error && <Text style={{ color: t.danger }}>{error}</Text>}
      </Card>

      {matches && (
        <>
          <SectionTitle>{matches.length ? 'Found on your list' : 'No list items matched'}</SectionTitle>
          {matches.map((m) => {
            const on = !skip.has(m.item.id);
            return (
              <Pressable
                key={m.item.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  tap();
                  setSkip((s) => {
                    const n = new Set(s);
                    if (on) n.add(m.item.id);
                    else n.delete(m.item.id);
                    return n;
                  });
                }}
                style={[styles.row, { backgroundColor: t.card }]}
              >
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.primary : t.textMuted} />
                <Text style={{ color: t.text, fontSize: 17, flex: 1 }}>{m.item.name}</Text>
                <Text style={{ color: t.text, fontWeight: '700' }}>
                  Aisle {m.aisle}
                  {m.bay ? ` · ${m.bay}` : ''}
                </Text>
              </Pressable>
            );
          })}
          {unmatched.length > 0 && (
            <Text style={{ color: t.textMuted }}>
              Also read {unmatched.map((u) => `Aisle ${u.aisle}`).join(', ')}, but those products aren&apos;t on your list.
            </Text>
          )}
          {matches.length > 0 && (
            <Button title={`Save ${chosen} aisle${chosen === 1 ? '' : 's'}`} onPress={save} disabled={!chosen} />
          )}
          {matches.length > 0 && store && !store.id.startsWith('custom:') && (
            <Text style={{ color: t.textMuted, textAlign: 'center' }}>Shared with other shoppers at {store.name}.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
});
