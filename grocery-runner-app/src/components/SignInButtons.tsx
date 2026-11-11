import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { Button } from './ui';
import { useAuth } from '../lib/auth';
import { cloudConfigured } from '../lib/supabase';
import { radius, useTheme } from '../lib/theme';

/** Continue with Apple / Google / email (a 6-digit code). Used by Account and the Share screen. */
export function SignInButtons() {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  const auth = useAuth();
  const [busy, setBusy] = useState<'google' | 'apple' | 'email' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const attempt = async (kind: 'google' | 'apple' | 'email', fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!cloudConfigured) {
    return <Text style={{ color: t.danger, textAlign: 'center', marginTop: 14 }}>Sign-in isn’t set up in this build.</Text>;
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const input = [styles.input, { color: t.text, backgroundColor: t.cardAlt }];

  return (
    <View style={{ gap: 12 }}>
      {appleAvailable &&
        (busy === 'apple' ? (
          <View style={[styles.loading, { backgroundColor: t.cardAlt }]}>
            <ActivityIndicator />
          </View>
        ) : (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md}
            style={{ height: 52 }}
            onPress={() => attempt('apple', auth.signInWithApple)}
          />
        ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => attempt('google', auth.signInWithGoogle)}
        disabled={!!busy}
        style={({ pressed }) => [styles.outline, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}
      >
        {busy === 'google' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color={t.text} />
            <Text style={[styles.outlineText, { color: t.text }]}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {!emailOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setEmailOpen(true)}
          disabled={!!busy}
          style={({ pressed }) => [styles.outline, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="mail" size={20} color={t.text} />
          <Text style={[styles.outlineText, { color: t.text }]}>Continue with email</Text>
        </Pressable>
      ) : !codeSentTo ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={t.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus
            style={input}
          />
          <Button
            title="Email me a code"
            icon="mail"
            loading={busy === 'email'}
            disabled={!emailOk}
            onPress={() =>
              attempt('email', async () => {
                await auth.sendEmailCode(email);
                setCodeSentTo(email.trim());
              })
            }
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: t.textMuted, textAlign: 'center' }}>We emailed a code to {codeSentTo}. Enter it here.</Text>
          <TextInput
            value={code}
            onChangeText={(c) => setCode(c.replace(/\D/g, '').slice(0, 8))}
            placeholder="Code"
            placeholderTextColor={t.textMuted}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            style={[...input, { textAlign: 'center', fontSize: 24, letterSpacing: 6 }]}
          />
          <Button
            title="Sign in"
            loading={busy === 'email'}
            disabled={code.length < 6}
            onPress={() => attempt('email', () => auth.verifyEmailCode(codeSentTo, code))}
          />
          <Button
            title="Use a different email"
            variant="ghost"
            onPress={() => {
              setCodeSentTo(null);
              setCode('');
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  outline: { height: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  outlineText: { fontSize: 17, fontWeight: '600' },
  input: { fontSize: 17, paddingHorizontal: 14, height: 52, borderRadius: radius.md },
});
