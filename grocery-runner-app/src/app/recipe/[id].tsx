import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { Button, tap } from '../../components/ui';
import { labelsOf } from '../../lib/diet';
import { newItems, SUGGESTED } from '../../lib/recipes';
import { itemKey } from '../../lib/sharedAisles';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

export default function RecipeScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { myRecipes, items, addItems, deleteRecipe, saveRecipe } = useData();
  const { session } = useAuth();
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
  const picked =
    touched ?? new Set(recipe?.items.flatMap((it, n) => (!it.pantry && !onList.has(itemKey(it.item)) ? [n] : [])) ?? []);

  if (!recipe) {
    return shared === undefined ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
      <Text style={{ color: t.textMuted, padding: 24, textAlign: 'center' }}>This recipe was removed.</Text>
    );
  }
  const mine = recipe.source === 'mine';
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
      { text: 'Sign in', onPress: () => router.push('/account') },
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

  const add = () => {
    addItems(chosen.map((it) => ({ name: it.item, amount: it.amount })));
    router.dismissTo('/');
  };

  return (
    <>
      <Stack.Screen options={{ title: recipe.title, headerRight }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 8 }}>
        <RecipePicture recipe={recipe} size={180} />
        {labelsOf(recipe).length > 0 && (
          <Text style={{ color: t.primary, fontWeight: '600' }}>{labelsOf(recipe).join(' · ')}</Text>
        )}
        <Text style={{ color: t.textMuted }}>
          {[
            recipe.minutes ? (recipe.minutes >= 120 ? `${Math.round(recipe.minutes / 60)} hr` : `${recipe.minutes} min`) : null,
            recipe.servings,
            recipe.author ? `${categoryLabel(recipe.category)} by ${recipe.author}` : mine ? 'Your recipe' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {'\n'}Untick anything you already have.
        </Text>
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
              style={[styles.row, { backgroundColor: t.card, opacity: already ? 0.6 : 1 }]}
            >
              <Ionicons
                name={already ? 'checkmark-done' : on ? 'checkbox' : 'square-outline'}
                size={24}
                color={on || already ? t.primary : t.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{it.item}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>
                  {[it.amount, already ? 'Already on your list' : it.pantry ? 'You probably have this' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 8, paddingBottom: 32 },
});
