import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import {
  blockAuthor,
  cachedCommunityRecipe,
  categoryLabel,
  CommunityRecipe,
  countSave,
  fetchCommunityRecipe,
  removeShared,
  reportRecipe,
} from '../../lib/community';
import { RecipePicture } from '../../components/RecipePicture';
import { Button, lift, tap } from '../../components/ui';
import { labelsOf } from '../../lib/diet';
import { newItems, SUGGESTED } from '../../lib/recipes';
import { itemKey } from '../../lib/sharedAisles';
import { fromIso, planWeek, WEEKDAYS } from '../../lib/mealPlan';
import { usePlan } from '../../lib/plan';
import { baseServings, scaleAmount } from '../../lib/scale';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

export default function RecipeScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { myRecipes, items, addItems, deleteRecipe, saveRecipe } = useData();
  const { session } = useAuth();
  const { plan, addMeal } = usePlan();
  // Community recipes ("c-<id>") come from the list's cache, or are fetched when opened another way.
  const [shared, setShared] = useState<CommunityRecipe | null | undefined>(() => (id?.startsWith('c-') ? cachedCommunityRecipe(id) : null));
  useEffect(() => {
    if (id?.startsWith('c-') && shared === undefined) fetchCommunityRecipe(id.slice(2)).then(setShared).catch(() => setShared(null));
  }, [id, shared]);
  const recipe = SUGGESTED.find((r) => r.id === id) ?? myRecipes.find((r) => r.id === id) ?? shared ?? undefined;
  const savedCopy = recipe && recipe.source !== 'mine' ? myRecipes.find((r) => r.id === `saved-${recipe.id}`) : undefined;

  const onList = useMemo(() => new Set(items.filter((i) => !i.checked).map((i) => itemKey(i.name))), [items]);
  // Staples and things already on the list start unticked.
  // null until the shopper changes something, so a recipe that loads late still gets the default ticks.
  const [touched, setPicked] = useState<Set<number> | null>(null);
  // Servings the shopper wants; amounts scale from the recipe's own servings (or a ×1, ×2 batch count when it has none).
  const [wanted, setWanted] = useState<number | null>(null);
  const picked =
    touched ?? new Set(recipe?.items.flatMap((it, n) => (!it.pantry && !onList.has(itemKey(it.item)) ? [n] : [])) ?? []);

  if (!recipe) {
    return shared === undefined ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
      <Text style={{ color: t.textMuted, padding: 24, textAlign: 'center' }}>This recipe was removed.</Text>
    );
  }
  const mine = recipe.source === 'mine';
  const base = baseServings(recipe.servings);
  const servings = wanted ?? base ?? 1;
  const factor = base ? servings / base : servings;
  const sharedByMe = !!shared && shared.authorId === session?.user.id;

  const save = () => {
    if (savedCopy) return router.replace(`/recipe/${savedCopy.id}`);
    const { id: originalId, ...rest } = recipe;
    saveRecipe({ ...rest, id: `saved-${originalId}`, source: 'mine' });
    if (recipe.communityId && recipe.source === 'community') countSave(recipe.communityId);
    Alert.alert('Saved', `${recipe.title} is in Your recipes${session ? ' and your account' : ''}.`);
  };

  const needAccount = (what: string) =>
    Alert.alert('Sign in first', `Sign in to ${what}.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign in', onPress: () => router.navigate('/profile') },
    ]);

  const report = () => {
    if (!shared?.communityId) return;
    if (!session) return needAccount('report recipes');
    const send = (reason: string) =>
      reportRecipe(shared.communityId!, reason)
        .then(() => Alert.alert('Thanks for reporting', 'We review reports every day. Recipes several people report are hidden right away.'))
        .catch((e) => Alert.alert("Couldn't report", e instanceof Error ? e.message : String(e)));
    Alert.alert('Report this recipe?', 'Why should it be removed?', [
      { text: 'Offensive or hateful', onPress: () => send('offensive') },
      { text: 'Spam or not a recipe', onPress: () => send('spam') },
      { text: 'Personal information', onPress: () => send('personal info') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const block = () => {
    if (!shared) return;
    Alert.alert(`Block ${shared.author}?`, 'You won’t see their recipes on this phone anymore.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          await blockAuthor(shared.authorId);
          router.back();
        },
      },
    ]);
  };

  const removeMine = () =>
    Alert.alert('Remove from Community?', 'Other shoppers who saved it keep their copy.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeShared(shared!.communityId!)
            .then(() => router.back())
            .catch((e) => Alert.alert("Couldn't remove", e instanceof Error ? e.message : String(e))),
      },
    ]);

  const more = () => {
    const options = sharedByMe ? ['Remove from Community', 'Cancel'] : ['Report recipe', `Block ${shared?.author ?? 'author'}`, 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: 0 },
      (i) => {
        if (sharedByMe && i === 0) removeMine();
        else if (!sharedByMe && i === 0) report();
        else if (!sharedByMe && i === 1) block();
      },
    );
  };

  const headerRight = () => (
    <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
      {!mine && (
        <Pressable accessibilityRole="button" accessibilityLabel={savedCopy ? 'Saved' : 'Save recipe'} hitSlop={10} onPress={save}>
          <Ionicons name={savedCopy ? 'bookmark' : 'bookmark-outline'} size={22} color={t.primary} />
        </Pressable>
      )}
      {mine && !recipe.communityId && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share with the community"
          hitSlop={10}
          onPress={() => router.push({ pathname: '/share', params: { id: recipe.id } })}
        >
          <Ionicons name="share-social-outline" size={22} color={t.primary} />
        </Pressable>
      )}
      {!!shared && (
        <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={10} onPress={more}>
          <Ionicons name="ellipsis-horizontal-circle" size={24} color={t.primary} />
        </Pressable>
      )}
    </View>
  );

  const chosenNames = new Set(
    newItems(
      recipe.items.filter((_, n) => picked.has(n)).map((i) => i.item),
      items.filter((i) => !i.checked).map((i) => i.name),
    ).map(itemKey),
  );
  // One entry per new item, with the recipe's amount so the list can show it.
  const chosen = recipe.items.filter((it, n) => picked.has(n) && chosenNames.delete(itemKey(it.item)));
  const toggle = (n: number) => {
    tap();
    setPicked((s) => {
      const next = new Set(s ?? picked);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  // Plans this recipe on a day of this week (or next); community recipes are saved first so the plan keeps them.
  const planIt = () => {
    const days = [...planWeek(plan.prepDay, new Date()), ...planWeek(plan.prepDay, new Date(), 1)].filter(
      (d) => fromIso(d) >= new Date(new Date().toDateString()),
    ).slice(0, 7);
    const labels = days.map((d) => `${WEEKDAYS[fromIso(d).getDay()]} ${fromIso(d).getMonth() + 1}/${fromIso(d).getDate()}`);
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Plan it for', options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
      (i) => {
        if (i >= days.length) return;
        let id = recipe.id;
        if (recipe.source === 'community') {
          id = `saved-${recipe.id}`;
          if (!savedCopy) {
            const { id: _drop, ...rest } = recipe;
            saveRecipe({ ...rest, id, source: 'mine' });
          }
        }
        addMeal(days[i], id);
        Alert.alert('Planned', `${recipe.title} is on ${labels[i]}. See it in the Plan tab.`);
      },
    );
  };

  const add = () => {
    addItems(chosen.map((it) => ({ name: it.item, amount: scaleAmount(it.amount, factor) })));
    router.dismissTo('/');
  };

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <RecipePicture recipe={recipe} size={210} style={{ borderRadius: radius.lg }} />
        <Text style={[styles.title, { color: t.text }]}>{recipe.title}</Text>
        <View style={styles.metaRow}>
          {[
            recipe.minutes ? `⏱ ${recipe.minutes >= 120 ? `${Math.round(recipe.minutes / 60)} hr` : `${recipe.minutes} min`}` : null,
            recipe.author ? `${categoryLabel(recipe.category)} by ${recipe.author}` : mine ? 'Your recipe' : null,
            ...labelsOf(recipe),
          ]
            .filter(Boolean)
            .map((m) => (
              <View key={m} style={[styles.meta, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>{m}</Text>
              </View>
            ))}
        </View>
        {!!recipe.url && (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(recipe.url!)} style={styles.source}>
            <Ionicons name="open-outline" size={15} color={t.primary} />
            <Text style={{ color: t.primary, fontWeight: '600' }} numberOfLines={1}>
              From {recipe.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
            </Text>
          </Pressable>
        )}
        <View style={[styles.servings, { backgroundColor: t.card }, lift(t)]}>
          <Text style={{ fontSize: 18 }}>🍽</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>
              {base ? `${servings} serving${servings === 1 ? '' : 's'}` : `${servings}× batch`}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {factor === 1 ? (base ? 'As written' : 'Change to make more') : base ? `Amounts scaled from ${base}` : `Amounts × ${servings}`}
            </Text>
          </View>
          {[-1, 1].map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={d < 0 ? 'Fewer servings' : 'More servings'}
              disabled={d < 0 ? servings <= 1 : servings >= 50}
              hitSlop={6}
              onPress={() => {
                tap();
                setWanted(Math.min(50, Math.max(1, servings + d)));
              }}
              style={[styles.step, { backgroundColor: t.primarySoft, opacity: (d < 0 ? servings <= 1 : servings >= 50) ? 0.4 : 1 }]}
            >
              <Ionicons name={d < 0 ? 'remove' : 'add'} size={20} color={t.primary} />
            </Pressable>
          ))}
        </View>
        <View style={styles.ingHead}>
          <Text style={[styles.ingTitle, { color: t.text }]}>Ingredients</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              tap();
              const all = recipe.items.flatMap((it, n) => (onList.has(itemKey(it.item)) ? [] : [n]));
              setPicked(all.every((n) => picked.has(n)) ? new Set() : new Set(all));
            }}
          >
            <Text style={{ color: t.primary, fontWeight: '700' }}>
              {recipe.items.every((it, n) => onList.has(itemKey(it.item)) || picked.has(n)) ? 'Untick all' : 'Tick all'}
            </Text>
          </Pressable>
        </View>
        <Text style={{ color: t.textMuted, marginTop: -6 }}>Untick anything you already have.</Text>
        <View style={[styles.group, { backgroundColor: t.card }, lift(t)]}>
        {recipe.items.map((it, n) => {
          const already = onList.has(itemKey(it.item));
          const on = picked.has(n);
          return (
            <Pressable
              key={`${it.item}-${n}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: already }}
              disabled={already}
              onPress={() => toggle(n)}
              style={[
                styles.row,
                { opacity: already ? 0.6 : 1 },
                n < recipe.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
              ]}
            >
              <View
                style={[
                  styles.check,
                  on || already ? { backgroundColor: t.primary, borderColor: t.primary } : { borderColor: t.textMuted },
                ]}
              >
                {(on || already) && <Ionicons name={already ? 'checkmark-done' : 'checkmark'} size={15} color={t.onPrimary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{it.item}</Text>
                {(!!it.amount || already || it.pantry) && (
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>
                    {[scaleAmount(it.amount, factor), already ? 'Already on your list' : it.pantry ? 'You probably have this' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
        </View>
        {mine && (
          <Button
            title="Delete this recipe"
            variant="ghost"
            onPress={() => {
              deleteRecipe(recipe.id);
              router.back();
            }}
          />
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="" label="Add to meal plan" icon="calendar" variant="secondary" onPress={planIt} style={{ width: 58, paddingHorizontal: 0 }} />
        <Button
          title={chosen.length ? `Add ${chosen.length} item${chosen.length === 1 ? '' : 's'} to my list` : 'Nothing to add'}
          icon="add"
          disabled={!chosen.length}
          onPress={add}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  servings: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, marginTop: 4 },
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  ingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  ingTitle: { fontSize: 20, fontWeight: '800' },
  group: { borderRadius: radius.lg, overflow: 'visible' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 8, paddingBottom: 32 },
});
