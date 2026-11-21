import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecipePicture } from '../components/RecipePicture';
import { Button, SectionTitle, tap } from '../components/ui';
import { conflictsOf } from '../lib/diet';
import { fromIso, WEEKDAYS } from '../lib/mealPlan';
import { usePlan } from '../lib/plan';
import { Recipe } from '../lib/recipes';
import { radius, useTheme } from '../lib/theme';
import { titleCase } from '../lib/caps';

/** Pick a recipe for one day of the meal plan (opened from the Plan tab's + buttons). */
export default function PlanPickScreen() {
  const t = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { pool, addMeal, plan } = usePlan();
  const [q, setQ] = useState('');
  const day = date ? WEEKDAYS[fromIso(date).getDay()] : '';
  const query = q.trim().toLowerCase();
  const match = (r: Recipe) => !query || r.title.toLowerCase().includes(query) || r.items.some((i) => i.item.includes(query));
  // Recipes that break the shopper's diet, allergy or "leave out" choices go last, with the reason.
  const fits = (r: Recipe) => !conflictsOf(r, plan.prefs).length;
  const mine = pool.filter((r) => r.source === 'mine' && match(r) && fits(r));
  const ours = pool.filter((r) => r.source !== 'mine' && match(r) && fits(r));
  const others = pool.filter((r) => match(r) && !fits(r));

  const pick = (r: Recipe) => {
    tap();
    addMeal(date!, r.id);
    router.back();
  };
  const row = (r: Recipe) => (
    <Pressable key={r.id} accessibilityRole="button" onPress={() => pick(r)} style={[styles.row, { backgroundColor: t.card }]}>
      <RecipePicture recipe={r} size={48} style={{ width: 48, borderRadius: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>
          {titleCase(r.title)}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>
          {[r.minutes ? `${r.minutes} min` : null, `${r.items.filter((i) => !i.pantry).length} items`].filter(Boolean).join(' · ')}
        </Text>
        {!fits(r) && (
          <Text style={{ color: t.accent, fontSize: 12 }} numberOfLines={2}>
            Has {conflictsOf(r, plan.prefs).join(', ')}
          </Text>
        )}
      </View>
      <Ionicons name="add-circle" size={26} color={t.primary} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: day ? `Add to ${day}` : 'Add a meal' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.search, { backgroundColor: t.cardAlt }]}>
          <Ionicons name="search" size={18} color={t.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search recipes or ingredients"
            placeholderTextColor={t.textMuted}
            clearButtonMode="while-editing"
            style={{ flex: 1, fontSize: 16, paddingVertical: 10, color: t.text }}
          />
        </View>
        <Button
          title="Add a recipe from a link"
          icon="link"
          variant="secondary"
          onPress={() => router.replace({ pathname: '/scan', params: { mode: 'link', planDate: date } })}
        />
        {mine.length > 0 && <SectionTitle>Your recipes</SectionTitle>}
        {mine.map(row)}
        <SectionTitle>Ideas</SectionTitle>
        {ours.map(row)}
        {!ours.length && <Text style={{ color: t.textMuted }}>No ideas fit your preferences{query ? ' and search' : ''}.</Text>}
        {others.length > 0 && <SectionTitle>Doesn’t fit your preferences</SectionTitle>}
        {others.map(row)}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
});
