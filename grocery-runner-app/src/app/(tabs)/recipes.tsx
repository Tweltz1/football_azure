import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipePicture } from '../../components/RecipePicture';
import { CommunityRecipes } from '../../components/CommunityRecipes';
import { Chip, lift, ScreenHeader, Segmented, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { FILTERS, labelsOf, matchesFilters } from '../../lib/diet';
import { newItems, Recipe, SUGGESTED } from '../../lib/recipes';
import { LIBRARY } from '../../lib/library';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';
import { titleCase } from '../../lib/caps';

const time = (m: number) => (m >= 120 ? `${Math.round(m / 60)} hr` : `${m} min`);

export default function RecipesScreen() {
  const t = useTheme();
  const { myRecipes, items } = useData();
  const [query, setQuery] = useState('');
  const [on, setOn] = useState<string[]>([]);
  // The library has hundreds of recipes: show a page at a time.
  const [libShown, setLibShown] = useState(24);
  const { session } = useAuth();
  // The view lives in the address so other screens (and the screenshot build) can open Community.
  const params = useLocalSearchParams<{ view?: string }>();
  const view = params.view === 'community' ? 'community' : 'recipes';
  const setView = (v: 'recipes' | 'community') => router.setParams({ view: v });

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
        style={({ pressed }) => [styles.tile, { backgroundColor: t.card, transform: [{ scale: pressed ? 0.98 : 1 }] }, lift(t)]}
      >
        <RecipePicture recipe={r} size={118} style={{ borderRadius: 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }} />
        <View style={{ padding: 10, gap: 3 }}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
            {titleCase(r.title)}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>{meta.join(' · ')}</Text>
          {labels.length > 0 && (
            <Text style={{ color: t.primary, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
              {labels.slice(0, 2).join(' · ')}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  const mine = myRecipes.filter(matches);
  const suggested = SUGGESTED.filter(matches);
  const library = useMemo(() => LIBRARY.filter(matches), [q, on]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader
        title="Recipes"
        action={
          view === 'community'
            ? { label: 'Share', icon: 'share-social', onPress: () => router.push('/share') }
            : { label: 'Add', icon: 'add', onPress: () => router.push('/scan') }
        }
      />
      <Segmented
        style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 2 }}
        value={view}
        onChange={setView}
        options={[
          { value: 'recipes', label: 'Recipes' },
          { value: 'community', label: 'Community' },
        ]}
      />
      {view === 'community' ? (
        <CommunityRecipes onShare={() => router.push('/share')} />
      ) : (
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <View style={[styles.search, { backgroundColor: t.cardAlt }]}>
            <Ionicons name="search" size={18} color={t.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search recipes or ingredients"
              placeholderTextColor={t.textMuted}
              clearButtonMode="while-editing"
              style={{ flex: 1, fontSize: 16, paddingVertical: 10, color: t.text }}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={on.includes(f.key)} onPress={() => toggle(f.key)} />
          ))}
        </ScrollView>

        <View style={styles.pad}>
          {mine.length > 0 && !session && !q && !on.length && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/profile')}
              style={[styles.row, { backgroundColor: t.primarySoft, marginTop: 8 }]}
            >
              <Ionicons name="cloud-upload" size={22} color={t.primary} />
              <Text style={{ flex: 1, color: t.text }}>
                <Text style={{ fontWeight: '700' }}>Sign in to save your recipes</Text> so they’re on every phone.
              </Text>
              <Ionicons name="chevron-forward" size={20} color={t.primary} />
            </Pressable>
          )}
          {mine.length > 0 && <SectionTitle>Your recipes</SectionTitle>}
          <View style={styles.grid}>{mine.map(row)}</View>

          <SectionTitle>{on.length || q ? `Suggested · ${suggested.length} match` : 'Suggested'}</SectionTitle>
          <View style={styles.grid}>{suggested.map(row)}</View>
          {!suggested.length && (
            <Text style={{ color: t.textMuted }}>No suggested recipes match. Turn off a filter to see more.</Text>
          )}

          {LIBRARY.length > 0 && (
            <>
              <SectionTitle>{`Recipe library · ${library.length}${on.length || q ? ' match' : ''}`}</SectionTitle>
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                Ingredients from Food Network and other recipe sites. Each recipe links to its steps on the site.
              </Text>
              <View style={styles.grid}>{library.slice(0, libShown).map(row)}</View>
              {library.length > libShown && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLibShown((n) => n + 48)}
                  style={[styles.more, { borderColor: t.border, backgroundColor: t.card }]}
                >
                  <Text style={{ color: t.primary, fontWeight: '700' }}>Show more ({library.length - libShown} left)</Text>
                </Pressable>
              )}
            </>
          )}
          {on.some((k) => k === 'gluten-free' || k === 'dairy-free') && (
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 12 }}>
              Diet labels come from the ingredient names. Check the labels on packaged foods like broth, sausage and
              seasoning mixes.
            </Text>
          )}
          {!mine.length && !q && !on.length && (
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 16 }}>
              Tap Add to save your own recipe from a photo, a link or pasted text. Sign in on the Profile tab to keep your
              recipes on every phone.
            </Text>
          )}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 19, minHeight: 38 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.8%', flexGrow: 1, maxWidth: '48.5%', borderRadius: radius.lg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999 },
  more: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
});
