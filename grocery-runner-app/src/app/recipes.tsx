import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecipePicture } from '../components/RecipePicture';
import { Button, Chip, SectionTitle } from '../components/ui';
import { FILTERS, labelsOf, matchesFilters } from '../lib/diet';
import { newItems, Recipe, SUGGESTED } from '../lib/recipes';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

const time = (m: number) => (m >= 120 ? `${Math.round(m / 60)} hr` : `${m} min`);

export default function RecipesScreen() {
  const t = useTheme();
  const { myRecipes, items } = useData();
  const [query, setQuery] = useState('');
  const [on, setOn] = useState<string[]>([]);

  const onList = useMemo(() => items.map((i) => i.name), [items]);
  const q = query.trim().toLowerCase();
  const matches = (r: Recipe) =>
    matchesFilters(r, on) &&
    (!q || r.title.toLowerCase().includes(q) || labelsOf(r).some((l) => l.toLowerCase().includes(q)) || r.items.some((i) => i.item.includes(q)));

  const toggle = (key: string) => setOn((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const row = (r: Recipe) => {
    const toBuy = r.items.filter((i) => !i.pantry).map((i) => i.item);
    const needed = newItems(toBuy, onList).length;
    const meta = [
      r.minutes ? time(r.minutes) : null,
      needed === toBuy.length ? `${toBuy.length} items` : `${needed} of ${toBuy.length} to get`,
    ].filter(Boolean);
    const labels = labelsOf(r);
    return (
      <Pressable
        key={r.id}
        accessibilityRole="button"
        accessibilityLabel={`${r.title}, ${meta.join(', ')}${labels.length ? `, ${labels.join(', ')}` : ''}`}
        onPress={() => router.push(`/recipe/${r.id}`)}
        style={({ pressed }) => [styles.row, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
      >
        <RecipePicture recipe={r} size={72} style={{ width: 72 }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
            {r.title}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{meta.join(' · ')}</Text>
          {labels.length > 0 && (
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {labels.join(' · ')}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
      </Pressable>
    );
  };

  const mine = myRecipes.filter(matches);
  const suggested = SUGGESTED.filter(matches);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
      <View style={styles.pad}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Scan a recipe" icon="camera" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
          <Button
            title="Paste or link"
            icon="link"
            variant="secondary"
            onPress={() => router.push('/scan?mode=text')}
            style={{ flex: 1 }}
          />
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search recipes or ingredients"
          placeholderTextColor={t.textMuted}
          clearButtonMode="while-editing"
          style={[styles.search, { color: t.text, backgroundColor: t.card }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={on.includes(f.key)} onPress={() => toggle(f.key)} />
        ))}
      </ScrollView>

      <View style={styles.pad}>
        {mine.length > 0 && <SectionTitle>Your recipes</SectionTitle>}
        <View style={{ gap: 8 }}>{mine.map(row)}</View>

        <SectionTitle>{on.length || q ? `Suggested · ${suggested.length} match` : 'Suggested'}</SectionTitle>
        <View style={{ gap: 8 }}>{suggested.map(row)}</View>
        {!suggested.length && (
          <Text style={{ color: t.textMuted }}>No suggested recipes match. Turn off a filter to see more.</Text>
        )}
        {on.some((k) => k === 'gluten-free' || k === 'dairy-free') && (
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 12 }}>
            Diet labels come from the ingredient names. Check the labels on packaged foods like broth, sausage and
            seasoning mixes.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  title: { fontSize: 16, fontWeight: '600' },
  search: { fontSize: 16, padding: 14, borderRadius: radius.md, marginTop: 8 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
});
