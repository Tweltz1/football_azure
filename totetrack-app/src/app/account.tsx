import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, IconButton, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { FREE_TOTE_LIMIT, usePro } from '../lib/pro';
import { itemCount, timeAgo, useTotes } from '../lib/store';
import { cloudConfigured } from '../lib/supabase';
import { useSync } from '../lib/sync';
import { radius, useTheme } from '../lib/theme';

export default function Account() {
  const t = useTheme();
  const auth = useAuth();
  const sync = useSync();
  const { totes } = useTotes();
  const pro = usePro();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const attempt = async (kind: 'google' | 'apple') => {
    setBusy(kind);
    try {
      await (kind === 'google' ? auth.signInWithGoogle() : auth.signInWithApple());
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const signOut = () =>
    Alert.alert('Sign out?', 'Your totes stay on this phone. Sign in again anytime to keep backing them up.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => auth.signOut() },
    ]);

  const deleteAccount = () =>
    Alert.alert(
      'Delete your ToteTrack account?',
      'This permanently deletes your account and every tote and photo backed up to it, then signs you out. Totes on this phone are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              const what = await sync.deleteAccount();
              await auth.signOut();
              Alert.alert(
                what === 'account' ? 'Account deleted' : 'Backup deleted',
                what === 'account'
                  ? 'Your account and everything backed up to it are gone.'
                  : 'Everything ToteTrack backed up is gone. Your sign-in is also used by another of our apps, so it was kept for that app.',
              );
            } catch (e) {
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );

  const items = totes.reduce((n, x) => n + itemCount(x), 0);

  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <IconButton icon="close" label="Close" onPress={() => router.back()} color={t.textMuted} /> }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Pressable onPress={() => router.push('/pro')} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Ionicons name="star" size={22} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{pro.isPro ? 'ToteTrack Pro' : 'Get ToteTrack Pro'}</Text>
              <Text style={{ color: t.textMuted, fontSize: 14 }}>
                {pro.isPro ? 'Unlimited totes and Snap to add. Tap to manage.' : `${Math.min(totes.length, FREE_TOTE_LIMIT)} of ${FREE_TOTE_LIMIT} free totes used. Pro adds unlimited totes and Snap to add.`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
          </Card>
        </Pressable>
        {auth.session ? (
          <>
            <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
              <View style={[styles.avatar, { backgroundColor: t.primarySoft }]}>
                <Ionicons name="person" size={34} color={t.primary} />
              </View>
              <Text style={[styles.email, { color: t.text }]}>{auth.email ?? 'Signed in'}</Text>
              <SyncBadge />
            </Card>
            <Text style={[styles.note, { color: t.textMuted }]}>
              {sync.status === 'error'
                ? `Your ${totes.length} totes and ${items} items are saved on this phone. The last backup didn’t go through, so ToteTrack will keep trying.`
                : `Your ${totes.length} totes and ${items} items are backed up. Sign in with the same account on a new phone and they come right back.`}
              {' '}Packing lists stay on this phone.
            </Text>
            <Button title="Sync now" icon="sync" variant="secondary" onPress={sync.syncNow} style={{ marginTop: 16 }} />
            <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={signOut} style={{ marginTop: 10 }} />
            <Pressable onPress={deleteAccount} style={{ alignSelf: 'center', marginTop: 28, padding: 8 }}>
              <Text style={{ color: t.danger, fontWeight: '600' }}>Delete account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 10, paddingTop: 16, paddingHorizontal: 8 }}>
              <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
                <Ionicons name="cloud-done" size={44} color={t.primary} />
              </View>
              <Text style={[styles.title, { color: t.text }]}>Back up your totes</Text>
              <Text style={[styles.body, { color: t.textMuted }]}>
                Sign in to save your totes, items and photos to the cloud. Get a new phone? Sign in and everything is still there.
              </Text>
            </View>

            {!cloudConfigured ? (
              <Text style={[styles.note, { color: t.danger, textAlign: 'center' }]}>Cloud backup isn’t set up in this build.</Text>
            ) : (
              <View style={{ gap: 12, marginTop: 28 }}>
                {appleAvailable &&
                  (busy === 'apple' ? (
                    <View style={[styles.loading, { backgroundColor: t.cardAlt }]}>
                      <ActivityIndicator />
                    </View>
                  ) : (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        t.bg === '#0C0D12'
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={radius.md}
                      style={{ height: 52 }}
                      onPress={() => attempt('apple')}
                    />
                  ))}
                <Pressable
                  onPress={() => attempt('google')}
                  disabled={!!busy}
                  style={({ pressed }) => [styles.google, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  {busy === 'google' ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={20} color={t.text} />
                      <Text style={[styles.googleText, { color: t.text }]}>Continue with Google</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            <SectionTitle>Without an account</SectionTitle>
            <Text style={[styles.note, { color: t.textMuted, marginTop: 0 }]}>
              Everything works without signing in. Your totes are just saved on this phone only.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

export function SyncBadge() {
  const t = useTheme();
  const { status, lastSynced, error } = useSync();
  const map = {
    off: { icon: 'cloud-offline-outline', text: 'Not backed up', color: t.textMuted },
    syncing: { icon: 'sync', text: 'Syncing…', color: t.primary },
    synced: { icon: 'cloud-done-outline', text: lastSynced ? `Backed up ${timeAgo(lastSynced)}` : 'Backed up', color: t.success },
    error: { icon: 'alert-circle-outline', text: 'Sync problem, will retry', color: t.danger },
  } as const;
  const m = map[status];
  return (
    <Pressable onPress={() => error && Alert.alert('Sync problem', error)} style={styles.badge}>
      <Ionicons name={m.icon} size={15} color={m.color} />
      <Text style={{ color: m.color, fontSize: 14, fontWeight: '600' }}>{m.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  email: { fontSize: 18, fontWeight: '700' },
  hero: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  note: { fontSize: 14, lineHeight: 20, marginTop: 14, paddingHorizontal: 4 },
  loading: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  google: { height: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleText: { fontSize: 17, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
