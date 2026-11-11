import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SignInButtons } from '../components/SignInButtons';
import { Button, Card, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/store';
import { supabase } from '../lib/supabase';
import { radius, useTheme } from '../lib/theme';

export default function AccountScreen() {
  const t = useTheme();
  const auth = useAuth();
  const { myRecipes } = useData();
  const [name, setName] = useState(auth.name);
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    if (name.trim() === auth.name) return;
    setSavingName(true);
    try {
      await auth.setName(name);
    } catch (e) {
      Alert.alert("Couldn't save your name", e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  };

  const deleteAccount = () =>
    Alert.alert(
      'Delete your Shop Stride account?',
      'This permanently deletes your account, the recipes saved to it and every recipe you shared with the community, and signs you out. Recipes stay on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.rpc('grocery_delete_account');
              if (error) throw error;
              await auth.signOut();
              Alert.alert(
                data === 'account' ? 'Account deleted' : 'Shop Stride data deleted',
                data === 'account'
                  ? 'Your account and everything saved to it are gone.'
                  : 'Everything Shop Stride saved is gone. Your sign-in is also used by another of our apps, so it was kept for that app.',
              );
            } catch (e) {
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );

  if (!auth.session) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 8, marginBottom: 28 }}>
          <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="bookmark" size={40} color={t.primary} />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Save your recipes</Text>
          <Text style={[styles.body, { color: t.textMuted }]}>
            Sign in to keep your recipes on every phone and share your favorites with other shoppers. Your grocery list
            still works without an account.
          </Text>
        </View>
        <SignInButtons />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.avatar, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="person" size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
            {auth.email ?? 'Signed in'}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {myRecipes.length} recipe{myRecipes.length === 1 ? '' : 's'} saved to your account
          </Text>
        </View>
        <Ionicons name="cloud-done" size={22} color={t.primary} />
      </Card>

      <SectionTitle>Name on recipes you share</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          placeholder="e.g. Sam from Madison"
          placeholderTextColor={t.textMuted}
          maxLength={40}
          returnKeyType="done"
          style={[styles.input, { color: t.text, backgroundColor: t.card }]}
        />
        <Button title="Save" variant="secondary" loading={savingName} disabled={name.trim() === auth.name || !name.trim()} onPress={saveName} />
      </View>

      <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={() => auth.signOut().then(() => router.back())} style={{ marginTop: 28 }} />
      <Pressable accessibilityRole="button" onPress={deleteAccount} style={{ alignSelf: 'center', marginTop: 28, padding: 8 }}>
        <Text style={{ color: t.danger, fontWeight: '600' }}>Delete account</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
});
