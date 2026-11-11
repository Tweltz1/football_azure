import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { cloudConfigured } from '../lib/supabase';
import { radius, useTheme } from '../lib/theme';

/** Continue with Apple / Continue with Google. Used by the sign-in screen and Account. */
export function SignInButtons() {
  const t = useTheme();
  const auth = useAuth();
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

  if (!cloudConfigured) {
    return <Text style={{ color: t.danger, textAlign: 'center', marginTop: 14 }}>Sign-in isn’t set up in this build.</Text>;
  }
  return (
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
              t.bg === '#0C0D12' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
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
  );
}

const styles = StyleSheet.create({
  loading: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  google: { height: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleText: { fontSize: 17, fontWeight: '600' },
});
