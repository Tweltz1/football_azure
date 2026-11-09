import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const { myRecipes, items, store, addItems, deleteRecipe } = useData();
  const recipe = SUGGESTED.find((r) => r.id === id) ?? myRecipes.find((r) => r.id === id);

  const onList = useMemo(() => new Set(items.filter((i) => !i.checked).map((i) => itemKey(i.name))), [items]);
  // Staples and things already on the list start unticked.
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(recipe?.items.flatMap((it, n) => (!it.pantry && !onList.has(itemKey(it.item)) ? [n] : [])) ?? []),
  );

  if (!recipe) return null;

  const chosen = newItems(
    recipe.items.filter((_, n) => picked.has(n)).map((i) => i.item),
    items.filter((i) => !i.checked).map((i) => i.name),
  );
  const toggle = (n: number) => {
    tap();
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const add = (then: 'list' | 'suggest') => {
    addItems(chosen);
    if (then === 'suggest') router.push('/suggest');
    else router.dismissTo('/');
  };

  return (
    <>
      <Stack.Screen options={{ title: recipe.title }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 8 }}>
        <RecipePicture recipe={recipe} size={180} />
        {labelsOf(recipe).length > 0 && (
          <Text style={{ color: t.primary, fontWeight: '600' }}>{labelsOf(recipe).join(' · ')}</Text>
        )}
        <Text style={{ color: t.textMuted }}>
          {[
            recipe.minutes ? (recipe.minutes >= 120 ? `${Math.round(recipe.minutes / 60)} hr` : `${recipe.minutes} min`) : null,
            recipe.servings,
            recipe.source === 'mine' ? 'From your recipe' : null,
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
        {recipe.source === 'mine' && (
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
          title={chosen.length ? `Add ${chosen.length} to list` : 'Nothing to add'}
          icon="add"
          variant="secondary"
          disabled={!chosen.length}
          onPress={() => add('list')}
          style={{ flex: 1 }}
        />
        <Button
          title={store ? 'Add, compare stores' : 'Add, find a store'}
          icon="storefront"
          disabled={!chosen.length}
          onPress={() => add('suggest')}
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
