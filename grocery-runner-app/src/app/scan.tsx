import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, SectionTitle } from '../components/ui';
import { cleanLink, readRecipe } from '../lib/readRecipe';
import { keepPhoto } from '../lib/recipePhotos';
import { newId, useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function ScanScreen() {
  const t = useTheme();
  // mode "link" (from the list's Recipe link button) shows just the link box; url reads that link straight away.
  const { mode, url: givenUrl } = useLocalSearchParams<{ mode?: string; url?: string }>();
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
      saveRecipe({ ...recipe, id, photo, source: 'mine', ...('url' in input ? { url: input.url } : {}) });
      // The recipe page ticks what to buy and has "Add N items to my list".
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

  if (mode === 'link') {
    const ok = !!cleanLink(text);
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Text style={{ fontSize: 44 }}>🔗</Text>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>Add a recipe from a link</Text>
          <Text style={{ color: t.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Copy the link from Safari, Pinterest or any recipe site and paste it here. You pick which ingredients go on your
            list.
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  input: { minHeight: 120, fontSize: 16, padding: 12, borderRadius: radius.sm, textAlignVertical: 'top' },
});
