import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, SectionTitle } from '../components/ui';
import { newItems, Recipe, SUGGESTED } from '../lib/recipes';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function RecipesScreen() {
  const t = useTheme();
  const { myRecipes, items } = useData();
  const [query, setQuery] = useState('');

  const onList = useMemo(() => items.map((i) => i.name), [items]);
  const q = query.trim().toLowerCase();
  const matches = (r: Recipe) =>
    !q || r.title.toLowerCase().includes(q) || r.tags?.some((tag) => tag.includes(q)) || r.items.some((i) => i.item.includes(q));

  const row = (r: Recipe) => {
    const toBuy = r.items.filter((i) => !i.pantry).map((i) => i.item);
    const needed = newItems(toBuy, onList).length;
    const meta = [
      r.minutes ? (r.minutes >= 120 ? `${Math.round(r.minutes / 60)} hr` : `${r.minutes} min`) : null,
      needed === toBuy.length ? `${toBuy.length} items` : `${needed} of ${toBuy.length} items to get`,
      ...(r.tags ?? []),
    ].filter(Boolean);
    return (
      <Pressable
        key={r.id}
        accessibilityRole="button"
        onPress={() => router.push(`/recipe/${r.id}`)}
        style={[styles.row, { backgroundColor: t.card }]}
      >
        <Ionicons name={r.source === 'mine' ? 'document-text' : 'restaurant'} size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>{r.title}</Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
      </Pressable>
    );
  };

  const mine = myRecipes.filter(matches);
  const suggested = SUGGESTED.filter(matches);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
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
        placeholder="Search recipes, like chicken or quick"
        placeholderTextColor={t.textMuted}
        clearButtonMode="while-editing"
        style={[styles.search, { color: t.text, backgroundColor: t.card }]}
      />

      {mine.length > 0 && <SectionTitle>Your recipes</SectionTitle>}
      {mine.map(row)}

      <SectionTitle>Suggested</SectionTitle>
      {suggested.map(row)}
      {!suggested.length && <Text style={{ color: t.textMuted }}>No suggested recipes match that.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  title: { fontSize: 17, fontWeight: '600' },
  search: { fontSize: 16, padding: 14, borderRadius: radius.md, marginTop: 8 },
});
