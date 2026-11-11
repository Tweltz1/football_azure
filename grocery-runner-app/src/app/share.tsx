import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { RecipePicture } from '../components/RecipePicture';
import { SignInButtons } from '../components/SignInButtons';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { CATEGORIES, Category, shareRecipe } from '../lib/community';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

/** Shares one of your recipes with the community: pick a category and the name to show. */
export default function ShareScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { myRecipes, saveRecipe } = useData();
  const auth = useAuth();
  const [picked, setPicked] = useState<string | undefined>(id);
  const recipe = myRecipes.find((r) => r.id === picked);
  const [category, setCategory] = useState<Category | null>(null);
  const [name, setName] = useState(auth.name);
  const [busy, setBusy] = useState(false);

  if (!auth.session) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginBottom: 6 }}>Sign in to share</Text>
        <Text style={{ color: t.textMuted, fontSize: 15, marginBottom: 24 }}>
          Shared recipes show the name you pick, never your email.
        </Text>
        <SignInButtons />
      </ScrollView>
    );
  }

  if (!recipe) {
    // Opened from Community: pick which of your recipes to share.
    const own = myRecipes.filter((r) => !r.communityId);
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>Which recipe?</Text>
        {own.length === 0 ? (
          <>
            <Text style={{ color: t.textMuted, fontSize: 15 }}>
              Add a recipe first, from a photo of a recipe card, a link or pasted text. Then share it here.
            </Text>
            <Button title="Add a recipe" icon="add" onPress={() => router.replace('/scan')} style={{ marginTop: 8 }} />
          </>
        ) : (
          own.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => setPicked(r.id)}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
            >
              <RecipePicture recipe={r} size={56} style={{ width: 56 }} />
              <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                {r.title}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  const share = async () => {
    if (!category || !name.trim()) return;
    setBusy(true);
    try {
      if (name.trim() !== auth.name) await auth.setName(name).catch(() => {});
      const communityId = await shareRecipe(recipe, category, name);
      saveRecipe({ ...recipe, communityId, category, author: name.trim() });
      Alert.alert('Shared', `${recipe.title} is now in Community under ${CATEGORIES.find((c) => c.key === category)!.label}.`);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{recipe.title}</Text>
      <Text style={{ color: t.textMuted, marginTop: 4 }}>
        {recipe.items.length} ingredient{recipe.items.length === 1 ? '' : 's'} will be shared. Your photo stays on your phone.
      </Text>

      <SectionTitle>Category</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.key} label={`${c.emoji} ${c.label}`} selected={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </View>

      <SectionTitle>Shown as</SectionTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your first name or a nickname"
        placeholderTextColor={t.textMuted}
        maxLength={40}
        style={{ fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md, color: t.text, backgroundColor: t.card }}
      />

      <Card style={{ marginTop: 20, gap: 6 }}>
        <Text style={{ color: t.text, fontWeight: '700' }}>Community rules</Text>
        <Text style={{ color: t.textMuted, lineHeight: 20 }}>
          Share real recipes only. No offensive, hateful, sexual or spammy content, and no personal information. Recipes
          that break these rules are removed, and people who post them can be blocked from sharing.
        </Text>
      </Card>

      <Button
        title="Agree and share"
        icon="share-social"
        loading={busy}
        disabled={!category || !name.trim()}
        onPress={share}
        style={{ marginTop: 20 }}
      />
    </ScrollView>
  );
}
