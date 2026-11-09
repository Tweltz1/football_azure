import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import { readRecipe } from '../lib/readRecipe';
import { keepPhoto } from '../lib/recipePhotos';
import { newId, useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function ScanScreen() {
  const t = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { saveRecipe } = useData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (input: Parameters<typeof readRecipe>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const recipe = await readRecipe(input);
      const id = `m-${newId()}`;
      // The scanned photo becomes the recipe's picture.
      const photo = 'photoUri' in input ? await keepPhoto(input.photoUri, id) : undefined;
      saveRecipe({ ...recipe, id, photo, source: 'mine' });
      router.replace(`/recipe/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    if (/^https?:\/\/\S+$/i.test(v)) read({ url: v });
    else read({ text: v });
  };

  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Reading your recipe…</Text>
        <Text style={{ color: t.textMuted }}>Read on your phone. Nothing is uploaded.</Text>
      </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  input: { minHeight: 120, fontSize: 16, padding: 12, borderRadius: radius.sm, textAlignVertical: 'top' },
});
