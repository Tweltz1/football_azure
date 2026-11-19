import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import { buildOwnRecipe, StepDraft } from '../lib/ownRecipe';
import { keepPhoto } from '../lib/recipePhotos';
import { newId, useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

/**
 * "Create your own": a photo of the dish, the ingredients and the steps, typed by the shopper.
 * Saved to My recipes, and optionally shared with the Community (share.tsx asks for sign-in and a category).
 */
export default function NewRecipeScreen() {
  const t = useTheme();
  const { saveRecipe } = useData();
  const [photo, setPhoto] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([{ text: '', minutes: '' }]);
  const [share, setShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (from: 'camera' | 'library') => {
    setError(null);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Camera access is off. Turn it on in Settings, or choose a photo instead.');
        return;
      }
    }
    // Cropped to the 4:3 shape recipe pictures use, and small enough to share.
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [4, 3] };
    const result =
      from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  };

  const setStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((all) => all.map((st, n) => (n === i ? { ...st, ...patch } : st)));

  const hasIngredients = ingredients.trim().length > 1;
  const canSave = title.trim().length > 1 && hasIngredients && !busy;

  const save = async () => {
    const built = buildOwnRecipe({ title, servings, ingredients, steps });
    if (!built.items.length) {
      setError('Add at least one ingredient, one per line, like "2 cups rice".');
      return;
    }
    setBusy(true);
    try {
      const id = `m-${newId()}`;
      const kept = photo ? await keepPhoto(photo, id) : undefined;
      saveRecipe({ ...built, id, photo: kept, source: 'mine', emoji: '🍽️' });
      if (share) router.replace({ pathname: '/share', params: { id } });
      else router.replace(`/recipe/${id}`);
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, backgroundColor: t.cardAlt }];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 10 }}>
        {photo ? (
          <View>
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel="Your dish" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              onPress={() => setPhoto(null)}
              style={[styles.remove, { backgroundColor: t.card }]}
            >
              <Ionicons name="close" size={18} color={t.text} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.photo, styles.empty, { backgroundColor: t.cardAlt }]}>
            <Ionicons name="restaurant" size={36} color={t.textMuted} />
            <Text style={{ color: t.textMuted }}>Add a photo of your dish</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Take a photo" icon="camera" variant="secondary" onPress={() => pick('camera')} style={{ flex: 1 }} />
          <Button title="Choose" icon="images" variant="secondary" onPress={() => pick('library')} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle>Recipe</SectionTitle>
      <Card style={{ gap: 10 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Name, like Grandma's Chicken Soup"
          placeholderTextColor={t.textMuted}
          autoCapitalize="words"
          style={[input, styles.line]}
        />
        <TextInput
          value={servings}
          onChangeText={setServings}
          placeholder="Serves, like 4 servings"
          placeholderTextColor={t.textMuted}
          style={[input, styles.line]}
        />
      </Card>

      <SectionTitle>Ingredients</SectionTitle>
      <Card style={{ gap: 6 }}>
        <Text style={{ color: t.textMuted }}>One per line, with the amount first: “2 cups rice”, “1 onion, diced”.</Text>
        <TextInput
          value={ingredients}
          onChangeText={setIngredients}
          placeholder={'2 lb chicken thighs\n1 onion, diced\n8 cups chicken broth'}
          placeholderTextColor={t.textMuted}
          multiline
          autoCorrect={false}
          style={[input, { minHeight: 130 }]}
        />
      </Card>

      <SectionTitle>Steps</SectionTitle>
      <Card style={{ gap: 12 }}>
        {steps.map((st, i) => (
          <View key={i} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.num, { backgroundColor: t.primary }]}>
                <Text style={{ color: t.onPrimary, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, color: t.textMuted }}>Step {i + 1}</Text>
              <TextInput
                value={st.minutes}
                onChangeText={(v) => setStep(i, { minutes: v.replace(/[^0-9]/g, '').slice(0, 4) })}
                placeholder="min"
                placeholderTextColor={t.textMuted}
                keyboardType="number-pad"
                accessibilityLabel={`Minutes for step ${i + 1}`}
                style={[input, styles.minutes]}
              />
              {steps.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove step ${i + 1}`}
                  hitSlop={8}
                  onPress={() => setSteps((all) => all.filter((_, n) => n !== i))}
                >
                  <Ionicons name="trash-outline" size={20} color={t.textMuted} />
                </Pressable>
              )}
            </View>
            <TextInput
              value={st.text}
              onChangeText={(v) => setStep(i, { text: v })}
              placeholder={i === 0 ? 'Brown the chicken in a big pot, about 8 minutes.' : 'What to do next'}
              placeholderTextColor={t.textMuted}
              multiline
              style={[input, { minHeight: 64 }]}
            />
          </View>
        ))}
        <Button
          title="Add a step"
          icon="add"
          variant="ghost"
          disabled={steps.length >= 40}
          onPress={() => setSteps((all) => [...all, { text: '', minutes: '' }])}
        />
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Leave minutes blank and Shop Stride uses the time in the step, like “bake 25 minutes”.
        </Text>
      </Card>

      <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Share with the Community</Text>
          <Text style={{ color: t.textMuted, marginTop: 2 }}>Others can find it and add it to their list. You can remove it any time.</Text>
        </View>
        <Switch value={share} onValueChange={setShare} accessibilityLabel="Share with the Community" />
      </Card>

      {error && <Text style={{ color: t.danger, marginTop: 12 }}>{error}</Text>}
      <Button
        title={share ? 'Save and share' : 'Save recipe'}
        icon={share ? 'people' : 'checkmark'}
        disabled={!canSave}
        loading={busy}
        onPress={save}
        style={{ marginTop: 16 }}
      />
      {!canSave && !busy && (
        <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 8 }}>Add a name and the ingredients to save.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  remove: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  input: { fontSize: 16, padding: 12, borderRadius: radius.sm, textAlignVertical: 'top' },
  line: { paddingVertical: 12 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  minutes: { width: 64, paddingVertical: 8, textAlign: 'center' },
});
