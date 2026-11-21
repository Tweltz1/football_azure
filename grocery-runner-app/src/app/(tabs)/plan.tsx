import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipePicture } from '../../components/RecipePicture';
import { Button, Chip, lift, ScreenHeader, Segmented, SectionTitle, tap } from '../../components/ui';
import { describePrefs, labelOf, matchesFilters, PREF_GROUPS } from '../../lib/diet';
import { fromIso, planWeek, prepSchedule, suggestMeals, weekShopping, WEEKDAYS } from '../../lib/mealPlan';
import { usePlan } from '../../lib/plan';
import { newItems } from '../../lib/recipes';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';
import { titleCase } from '../../lib/caps';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALLERGY_KEYS = PREF_GROUPS[1].keys;

/**
 * Weekly meal plan: pick a prep day, fill the week (by hand, from links, or "Plan my week" from your
 * preferences), put every ingredient on the list in one tap, and follow the prep-day checklist.
 */
export default function PlanScreen() {
  const t = useTheme();
  const { plan, update, removeMeal, pool, recipeById } = usePlan();
  const { items, addItems } = useData();
  const [ahead, setAhead] = useState<'this' | 'next'>('this');
  const [showPrefs, setShowPrefs] = useState(false);
  const week = useMemo(() => planWeek(plan.prepDay, new Date(), ahead === 'next' ? 1 : 0), [plan.prepDay, ahead]);
  const days = week.map((date) => ({
    date,
    recipes: (plan.meals[date] ?? []).map(recipeById).filter((r): r is NonNullable<typeof r> => !!r),
  }));
  const planned = days.flatMap((d) => d.recipes);
  const shopping = weekShopping(planned);
  const toBuy = newItems(
    shopping.map((s) => s.name),
    items.filter((i) => !i.checked).map((i) => i.name),
  );
  const tasks = prepSchedule(days);
  const dinnerPool = pool.filter((r) => !r.tags?.includes('breakfast'));
  const dinners = dinnerPool.length;
  const fitCount = dinnerPool.filter((r) => matchesFilters(r, plan.prefs)).length;
  const today = new Date().toDateString();

  const fillWeek = () => {
    // Recipes from the week before aren't repeated straight away.
    const before = planWeek(plan.prepDay, fromIso(week[0]), -1).flatMap((d) => plan.meals[d] ?? []);
    const recent = plan.recent ?? [];
    const picks = suggestMeals(pool, { prefs: plan.prefs, picked: planned, avoid: [...before, ...recent], count: plan.perWeek, seed: (plan.fills ?? 0) + 1 });
    if (!picks.length) {
      Alert.alert('No more recipes fit', 'Turn off a preference, or add your own recipes from a link.');
      return;
    }
    // Dinners go on the empty days after prep day first, skipping the prep day itself when possible.
    const empty = [...days.slice(1), days[0]].filter((d) => !d.recipes.length).map((d) => d.date);
    update((p) => {
      const meals = { ...p.meals };
      picks.forEach((r, i) => {
        const date = empty[i] ?? week[(i + 1) % 7];
        meals[date] = [...(meals[date] ?? []), r.id];
      });
      // Remember about two weeks of suggestions; older ones can come back.
      const ids = picks.map((r) => r.id);
      return { ...p, meals, fills: (p.fills ?? 0) + 1, recent: [...(p.recent ?? []).filter((id) => !ids.includes(id)), ...ids].slice(-Math.max(8, p.perWeek * 2)) };
    });
  };

  const clearWeek = () =>
    Alert.alert('Clear this week?', 'Removes every meal planned for these 7 days.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () =>
          update((p) => ({ ...p, meals: Object.fromEntries(Object.entries(p.meals).filter(([d]) => !week.includes(d))) })),
      },
    ]);

  const shop = () => {
    const keys = new Set(toBuy.map((n) => n.toLowerCase()));
    addItems(shopping.filter((s) => keys.has(s.name.toLowerCase())).map((s) => ({ name: s.name, amount: s.amount })));
    Alert.alert('Added to your list', `${toBuy.length} item${toBuy.length === 1 ? '' : 's'} for ${planned.length} meal${planned.length === 1 ? '' : 's'}.`, [
      { text: 'Stay here', style: 'cancel' },
      { text: 'Open list', onPress: () => router.navigate('/') },
    ]);
  };

  const togglePref = (k: string) =>
    update((p) => ({ ...p, prefs: p.prefs.includes(k) ? p.prefs.filter((x) => x !== k) : [...p.prefs, k] }));
  const toggleTask = (id: string) => {
    tap();
    const key = `${week[0]}:${id}`;
    update((p) => ({ ...p, done: p.done.includes(key) ? p.done.filter((x) => x !== key) : [...p.done.slice(-200), key] }));
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader
        title="Meal plan"
        subtitle={`Prep day: ${WEEKDAYS[plan.prepDay]}`}
        action={{ label: 'Prefs', icon: 'options', onPress: () => setShowPrefs((v) => !v) }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Segmented
          style={{ marginHorizontal: 16, marginTop: 4 }}
          value={ahead}
          onChange={setAhead}
          options={[
            { value: 'this', label: 'This week' },
            { value: 'next', label: 'Next week' },
          ]}
        />

        {showPrefs && (
          <View style={[styles.card, { backgroundColor: t.card }, lift(t)]}>
            <Text style={[styles.label, { color: t.text }]}>Prep day</Text>
            <View style={styles.wrap}>
              {SHORT.map((d, i) => (
                <Chip key={d} label={d} selected={plan.prepDay === i} onPress={() => update((p) => ({ ...p, prepDay: i }))} />
              ))}
            </View>
            <Text style={[styles.label, { color: t.text }]}>Dinners to plan each week</Text>
            <View style={styles.wrap}>
              {[3, 4, 5, 6, 7].map((n) => (
                <Chip key={n} label={String(n)} selected={plan.perWeek === n} onPress={() => update((p) => ({ ...p, perWeek: n }))} />
              ))}
            </View>
            {PREF_GROUPS.map((g) => (
              <View key={g.title} style={{ gap: 6 }}>
                <Text style={[styles.label, { color: t.text }]}>{g.title}</Text>
                <View style={styles.wrap}>
                  {g.keys.map((k) => (
                    <Chip key={k} label={labelOf(k)} selected={plan.prefs.includes(k)} onPress={() => togglePref(k)} />
                  ))}
                </View>
              </View>
            ))}
            <Text style={{ color: t.textMuted, fontSize: 12, lineHeight: 17 }}>
              {fitCount} of {dinners} dinner ideas fit.
              {plan.prefs.some((k) => ALLERGY_KEYS.includes(k))
                ? ' Allergy labels come from ingredient names, so always check package labels (broth, sauces, sausage, mixes).'
                : ' Your choices also filter the recipe list and Add a meal.'}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title={planned.length ? 'Fill the rest' : 'Plan my week'}
            icon="sparkles"
            onPress={fillWeek}
            style={{ flex: 1 }}
          />
          {planned.length > 0 && <Button title="Clear" variant="secondary" onPress={clearWeek} />}
        </View>
        <Text style={[styles.hint, { color: t.textMuted }]}>
          {plan.prefs.length
            ? `Picks ${plan.perWeek} dinners that are ${describePrefs(plan.prefs)}, sharing ingredients where it can. Each tap picks different ones.`
            : `Picks ${plan.perWeek} dinners from your recipes and ours, sharing ingredients where it can. Set your diet, allergies and meats to leave out with Prefs.`}
        </Text>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {days.map((d, i) => {
            const date = fromIso(d.date);
            const isToday = date.toDateString() === today;
            return (
              <View key={d.date} style={[styles.day, { backgroundColor: t.card }, lift(t)]}>
                <View style={styles.dayHead}>
                  <View style={[styles.dateBadge, { backgroundColor: i === 0 ? t.accent : isToday ? t.primary : t.cardAlt }]}>
                    <Text style={{ color: i === 0 || isToday ? '#fff' : t.textMuted, fontSize: 11, fontWeight: '800' }}>
                      {SHORT[date.getDay()].toUpperCase()}
                    </Text>
                    <Text style={{ color: i === 0 || isToday ? '#fff' : t.text, fontSize: 17, fontWeight: '800' }}>{date.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>
                      {i === 0 ? '🔪 Prep day' : isToday ? 'Today' : WEEKDAYS[date.getDay()]}
                    </Text>
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>
                      {MONTHS[date.getMonth()]} {date.getDate()}
                      {d.recipes.length ? ` · ${d.recipes.length} meal${d.recipes.length === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add a meal on ${WEEKDAYS[date.getDay()]}`}
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/plan-pick', params: { date: d.date } })}
                    style={[styles.addBtn, { backgroundColor: t.primarySoft }]}
                  >
                    <Ionicons name="add" size={18} color={t.primary} />
                  </Pressable>
                </View>
                {d.recipes.map((r) => (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/recipe/${r.id}`)}
                    onLongPress={() => removeMeal(d.date, r.id)}
                    style={[styles.meal, { borderTopColor: t.border }]}
                  >
                    <RecipePicture recipe={r} size={44} style={{ width: 44, borderRadius: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
                        {titleCase(r.title)}
                      </Text>
                      {!!r.minutes && <Text style={{ color: t.textMuted, fontSize: 12 }}>{r.minutes} min</Text>}
                    </View>
                    <Pressable accessibilityLabel={`Remove ${r.title}`} hitSlop={10} onPress={() => removeMeal(d.date, r.id)}>
                      <Ionicons name="close-circle" size={20} color={t.textMuted} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>

        {planned.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <SectionTitle>Groceries for the week</SectionTitle>
            <View style={[styles.card, { backgroundColor: t.card, marginHorizontal: 0, marginTop: 0 }, lift(t)]}>
              <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>
                <Text style={{ fontWeight: '800' }}>{shopping.length} ingredients</Text> for {planned.length} meals
                {toBuy.length < shopping.length ? `, ${shopping.length - toBuy.length} already on your list` : ''}.
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={3}>
                {shopping.map((s) => s.name).join(', ')}
              </Text>
              <Button
                title={toBuy.length ? `Add ${toBuy.length} to my list` : 'All on your list'}
                icon="cart"
                disabled={!toBuy.length}
                onPress={shop}
              />
            </View>

            <SectionTitle>Prep day checklist · {WEEKDAYS[plan.prepDay]}</SectionTitle>
            <View style={[styles.group, { backgroundColor: t.card }, lift(t)]}>
              {tasks.map((task, n) => {
                const done = plan.done.includes(`${week[0]}:${task.id}`);
                return (
                  <Pressable
                    key={task.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    onPress={() => toggleTask(task.id)}
                    style={[styles.task, n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
                  >
                    <Text style={{ fontSize: 20 }}>{task.icon}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{ color: done ? t.textMuted : t.text, fontWeight: '700', fontSize: 15, textDecorationLine: done ? 'line-through' : 'none' }}
                      >
                        {task.title}
                      </Text>
                      {task.lines?.map((l) => (
                        <Text key={l.meal} style={{ color: t.text, fontSize: 14, lineHeight: 19 }}>
                          <Text style={{ fontWeight: '600' }}>{l.meal}: </Text>
                          {l.items}
                        </Text>
                      ))}
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>{task.detail}</Text>
                    </View>
                    <View style={[styles.check, done ? { backgroundColor: t.primary, borderColor: t.primary } : { borderColor: t.textMuted }]}>
                      {done && <Ionicons name="checkmark" size={14} color={t.onPrimary} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.lg, gap: 10 },
  label: { fontWeight: '800', fontSize: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 14 },
  hint: { fontSize: 13, paddingHorizontal: 20, marginTop: 8, marginBottom: 12, lineHeight: 18 },
  day: { borderRadius: radius.lg, padding: 12 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBadge: { width: 46, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  group: { borderRadius: radius.lg },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
