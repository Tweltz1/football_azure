import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, lift, SectionTitle } from '../components/ui';
import { cleanLink, readLink, readRecipe, RecipeCollection } from '../lib/readRecipe';
import { titleCase } from '../lib/caps';
import { keepPhoto } from '../lib/recipePhotos';
import { usePlan } from '../lib/plan';
import { newId, useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function ScanScreen() {
  const t = useTheme();
  // mode "link" (from the list's Recipe link button) shows just the link box; url reads that link straight away.
  // planDate: opened from the meal plan, so the recipe goes on that day too.
  const { mode, url: givenUrl, planDate } = useLocalSearchParams<{ mode?: string; url?: string; planDate?: string }>();
  const { saveRecipe } = useData();
  const { addMeal } = usePlan();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A roundup page ("100 healthy dinners"): the shopper ticks the recipes to add.
  const [collection, setCollection] = useState<RecipeCollection | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const read = async (input: Parameters<typeof readRecipe>[0]) => {
    setBusy(true);
    setError(null);
    try {
      let recipe;
      if ('url' in input) {
        const got = await readLink(input.url);
        if (got.kind === 'collection') {
          setCollection(got.collection);
          setPicked(new Set());
          return;
        }
        recipe = got.recipe;
      } else recipe = await readRecipe(input);
      const id = `m-${newId()}`;
      // The scanned photo becomes the recipe's picture.
      const photo = 'photoUri' in input ? await keepPhoto(input.photoUri, id) : undefined;
      saveRecipe({ ...recipe, id, photo, source: 'mine', ...('url' in input ? { url: input.url } : {}) });
      if (planDate) addMeal(planDate, id);
      // The recipe page ticks what to buy and has "Add N items to my list".
      router.replace(`/recipe/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Reads each ticked recipe, three at a time, and saves the ones that work. */
  const addPicked = async () => {
    if (!collection) return;
    const links = [...picked].sort((a, b) => a - b).map((n) => collection.recipes[n]);
    setError(null);
    setProgress({ done: 0, total: links.length });
    const saved: string[] = [];
    const failed: string[] = [];
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < links.length) {
        const link = links[next++];
        try {
          const recipe = await readRecipe({ url: link.url });
          const id = `m-${newId()}`;
          saveRecipe({ ...recipe, id, source: 'mine', url: link.url });
          if (planDate) addMeal(planDate, id);
          saved.push(id);
        } catch {
          failed.push(link.title);
        }
        setProgress({ done: ++done, total: links.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setProgress(null);
    if (failed.length) {
      setPicked(new Set([...picked].filter((n) => failed.includes(collection.recipes[n].title))));
      setError(
        `${saved.length ? `Added ${saved.length} recipe${saved.length === 1 ? '' : 's'}. ` : ''}Couldn't read ${failed.join(', ')}. Try again, or open ${failed.length === 1 ? 'it' : 'them'} one at a time.`,
      );
      return;
    }
    if (saved.length === 1) router.replace(`/recipe/${saved[0]}`);
    else router.replace('/recipes');
  };

  const photo = async (from: 'camera' | 'library') => {
    setError(null);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Camera access is off. Turn it on in Settings, or choose a photo instead.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    await read({ photoUri: result.assets[0].uri });
  };

  const submitText = () => {
    const v = text.trim();
    // Links shared from Safari or a recipe app often come with the page title around them.
    const url = cleanLink(v);
    if (url && v.split(/\r?\n/).filter((l) => l.trim()).length <= 3) read({ url });
    else read({ text: v });
  };

  const started = useRef(false);
  useEffect(() => {
    const url = givenUrl ? cleanLink(givenUrl) : null;
    if (url && !started.current) {
      started.current = true;
      setText(url);
      read({ url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenUrl]);

  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Reading your recipe…</Text>
        <Text style={{ color: t.textMuted }}>
          {text.startsWith('http') ? 'Getting the ingredients from the page.' : 'Read on your phone. Nothing is uploaded.'}
        </Text>
      </View>
    );
  }

  if (progress) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
          Adding recipe {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </Text>
        <Text style={{ color: t.textMuted }}>Getting the ingredients for each recipe.</Text>
      </View>
    );
  }

  if (collection) {
    const all = picked.size === collection.recipes.length;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{titleCase(collection.title)}</Text>
            <Text style={{ color: t.textMuted, lineHeight: 20 }}>
              This page links to {collection.recipes.length} recipes. Tick the ones you want and Shop Stride adds each to your
              recipes, ingredients and all.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicked(all ? new Set() : new Set(collection.recipes.map((_, n) => n)))}
            hitSlop={8}
          >
            <Text style={{ color: t.primary, fontWeight: '700' }}>{all ? 'Clear all' : 'Select all'}</Text>
          </Pressable>
          {error && <Text style={{ color: t.danger }}>{error}</Text>}
          <View style={[{ borderRadius: radius.md, backgroundColor: t.card, overflow: 'hidden' }, lift(t)]}>
            {collection.recipes.map((r, n) => {
              const on = picked.has(n);
              return (
                <Pressable
                  key={r.url}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() =>
                    setPicked((p) => {
                      const s = new Set(p);
                      if (s.has(n)) s.delete(n);
                      else s.add(n);
                      return s;
                    })
                  }
                  style={[
                    styles.pickRow,
                    n < collection.recipes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
                  ]}
                >
                  <View style={[styles.check, on ? { backgroundColor: t.primary, borderColor: t.primary } : { borderColor: t.textMuted }]}>
                    {on && <Ionicons name="checkmark" size={15} color={t.onPrimary} />}
                  </View>
                  <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{titleCase(r.title)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="Use a different link" variant="ghost" onPress={() => { setCollection(null); setError(null); }} />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
          <Button
            title={picked.size ? `Add ${picked.size} recipe${picked.size === 1 ? '' : 's'}` : 'Tick the recipes you want'}
            icon="add-circle"
            disabled={!picked.size}
            onPress={addPicked}
          />
        </View>
      </View>
    );
  }

  if (mode === 'link') {
    const ok = !!cleanLink(text);
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Text style={{ fontSize: 44 }}>🔗</Text>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>Add a recipe from a link</Text>
          <Text style={{ color: t.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Copy the link from Safari, Pinterest or any recipe site and paste it here. You pick which ingredients go on your
            list. A page with many recipes, like “20 easy dinners”, lets you pick which recipes to add.
          </Text>
        </View>
        <View style={[styles.linkRow, { backgroundColor: t.card, borderColor: ok ? t.primary : t.border }]}>
          <Ionicons name="link" size={18} color={t.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste a recipe link"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => ok && submitText()}
            style={{ flex: 1, fontSize: 16, paddingVertical: 14, color: t.text }}
          />
          {!!text && (
            <Pressable accessibilityLabel="Clear" hitSlop={8} onPress={() => setText('')}>
              <Ionicons name="close-circle" size={20} color={t.textMuted} />
            </Pressable>
          )}
        </View>
        <Button title="Get ingredients" icon="sparkles" disabled={!ok} onPress={submitText} />
        {error && <Text style={{ color: t.danger }}>{error}</Text>}
        <Button title="Use a photo or paste the recipe instead" variant="ghost" onPress={() => router.setParams({ mode: '' })} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {mode !== 'text' && (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: t.textMuted }}>
              Take a photo of a cookbook page, a recipe card or a screenshot. Shop Stride reads it on your phone and turns
              the ingredients into a shopping list.
            </Text>
            <Button title="Take a photo" icon="camera" onPress={() => photo('camera')} />
            <Button title="Choose a photo" icon="images" variant="secondary" onPress={() => photo('library')} />
          </Card>
          <SectionTitle>Or paste a link or the recipe</SectionTitle>
        </>
      )}
      <Card style={{ gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="https://… or paste the ingredients"
          placeholderTextColor={t.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={mode === 'text'}
          style={[styles.input, { color: t.text, backgroundColor: t.cardAlt }]}
        />
        <Button title="Read recipe" icon="sparkles" disabled={text.trim().length < 8} onPress={submitText} />
      </Card>
      {error && <Text style={{ color: t.danger, marginTop: 12 }}>{error}</Text>}
      {mode !== 'text' && (
        <>
          <SectionTitle>Or make your own</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: t.textMuted }}>
              Snap a photo of a dish you make, type the ingredients and steps, and share it with the Community if you want.
            </Text>
            <Button title="Create your own" icon="create" variant="secondary" onPress={() => router.replace('/recipe-new')} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  input: { minHeight: 120, fontSize: 16, padding: 12, borderRadius: radius.sm, textAlignVertical: 'top' },
});
