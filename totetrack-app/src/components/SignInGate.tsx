import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { DEMO } from '../lib/demo';
import { cloudConfigured } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { SignInButtons } from './SignInButtons';
import { StudioCredit } from './ui';

const PRIVACY_URL = 'https://github.com/Tweltz1/football_azure/blob/claude/totetrack-app/totetrack-app/PRIVACY.md';

/**
 * ToteTrack needs an account: totes, items, photos and packing lists belong to it, so they're on any
 * phone you sign in on (and nobody else using this phone sees them). The phone keeps a working copy,
 * so everything still works with no signal once you're signed in.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const t = useTheme();
  const { session, ready } = useAuth();
  const insets = useSafeAreaInsets();
  if (DEMO || !cloudConfigured || session) return <>{children}</>;
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32, flexGrow: 1 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="cube" size={48} color={t.primary} />
        </View>
        <Text style={[styles.title, { color: t.text }]}>Welcome to ToteTrack</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          Sign in to start. Your totes, items, photos and packing lists are saved to your account, so they’re there on any phone you sign in on.
        </Text>
      </View>
      <SignInButtons />
      <View style={{ gap: 10, marginTop: 28 }}>
        <Point icon="cloud-offline-outline" text="Works without signal once you’re signed in, and catches up when you’re back online." />
        <Point icon="lock-closed-outline" text="Only you can see your totes. Signing out removes them from this phone." />
      </View>
      <Text onPress={() => Linking.openURL(PRIVACY_URL)} style={[styles.link, { color: t.primary }]}>
        Privacy Policy
      </Text>
      <View style={{ flex: 1 }} />
      <StudioCredit style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={t.primary} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, color: t.textMuted, fontSize: 15, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  link: { textAlign: 'center', marginTop: 24, fontSize: 15, fontWeight: '600' },
});
