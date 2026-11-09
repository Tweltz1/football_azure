import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import { backendConfigured } from '../lib/api';
import { readRecipe } from '../lib/recipes';
import { newId, useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

// Claude reads text fine at this width, and the upload stays small (a few hundred KB).
const PHOTO_WIDTH = 1600;

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
      saveRecipe({ ...recipe, id, source: 'mine' });
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
    setBusy(true);
    try {
      const asset = result.assets[0];
      // Decoded straight to at most PHOTO_WIDTH wide, so a 48 MP photo never sits in memory.
      const ctx = ImageManipulator.manipulate(asset.uri, { maxWidth: PHOTO_WIDTH });
      const image = await ctx.renderAsync();
      const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
      if (!saved.base64) throw new Error('Could not read that photo.');
      await read({ image: saved.base64 });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const submitText = () => {
    const v = text.trim();
    if (/^https?:\/\/\S+$/i.test(v)) read({ url: v });
    else read({ text: v });
  };

  if (!backendConfigured) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.textMuted }}>Recipe reading needs the online service, which is not set up in this build.</Text>
      </View>
    );
  }

  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Reading your recipe…</Text>
        <Text style={{ color: t.textMuted }}>This takes a few seconds.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {mode !== 'text' && (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: t.textMuted }}>
              Take a photo of a cookbook page, a recipe card or a screenshot. Shop Stride turns the ingredients into a
              shopping list.
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
