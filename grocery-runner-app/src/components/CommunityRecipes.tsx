import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecipePicture } from './RecipePicture';
import { Chip, Segmented } from './ui';
import { DEMO } from '../lib/demo';
import { categoryLabel, CATEGORIES, CommunityRecipe, fetchCommunity } from '../lib/community';
import { cloudConfigured } from '../lib/supabase';
import { radius, useTheme } from '../lib/theme';

/** Recipes other shoppers shared, by category. Shown on the Recipes tab. */
export function CommunityRecipes({ onShare }: { onShare: () => void }) {
  const t = useTheme();
  const [category, setCategory] = useState<string | undefined>();
  const [sort, setSort] = useState<'new' | 'popular'>('popular');
  const [query, setQuery] = useState('');
  const [recipes, setRecipes] = useState<CommunityRecipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRecipes(await fetchCommunity({ category, sort, query }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [category, sort, query]);

  useEffect(() => {
    if (!cloudConfigured && !DEMO) return;
    const timer = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  if (!cloudConfigured && !DEMO) {
    return <Text style={{ color: t.textMuted, padding: 16 }}>Community recipes need the online service, which isn’t set up in this build.</Text>;
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 8 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={styles.pad}>
        <View style={[styles.search, { backgroundColor: t.cardAlt }]}>
          <Ionicons name="search" size={18} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search shared recipes"
            placeholderTextColor={t.textMuted}
            clearButtonMode="while-editing"
            style={{ flex: 1, fontSize: 16, paddingVertical: 10, color: t.text }}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
        {CATEGORIES.map((c) => (
          <Chip key={c.key} label={`${c.emoji} ${c.label}`} selected={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </ScrollView>
      <View style={[styles.pad, { gap: 8 }]}>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'popular', label: 'Most saved' },
            { value: 'new', label: 'Newest' },
          ]}
        />
        {error && <Text style={{ color: t.danger }}>{error}</Text>}
        {!recipes && !error && <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />}
        {recipes?.length === 0 && (
          <View style={{ alignItems: 'center', gap: 6, marginTop: 24, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 40 }}>🧑‍🍳</Text>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>
              {query || category ? 'No recipes match yet' : 'Be the first to share'}
            </Text>
            <Text style={{ color: t.textMuted, textAlign: 'center' }}>Share one of your recipes and it shows up here for everyone.</Text>
          </View>
        )}
        {recipes?.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => router.push(`/recipe/${r.id}`)}
            style={({ pressed }) => [styles.row, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <RecipePicture recipe={r} size={64} style={{ width: 64 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                {r.title}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
                {categoryLabel(r.category)} · by {r.author}
              </Text>
              <Text style={{ color: t.primary, fontSize: 12, fontWeight: '600' }}>
                {r.items.length} items{r.saves ? ` · saved ${r.saves} time${r.saves === 1 ? '' : 's'}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onShare} style={[styles.share, { borderColor: t.primary }]}>
          <Ionicons name="share-social" size={18} color={t.primary} />
          <Text style={{ color: t.primary, fontWeight: '700' }}>Share one of your recipes</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.sm },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 8 },
});
