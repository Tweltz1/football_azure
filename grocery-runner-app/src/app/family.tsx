import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SignInButtons } from '../components/SignInButtons';
import { Button, Card, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useFamily } from '../lib/family';
import { radius, useTheme } from '../lib/theme';

/** Share one grocery list with the people you shop for: start one and send the code, or join with a code. */
export default function FamilyScreen() {
  const t = useTheme();
  const auth = useAuth();
  const fam = useFamily();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'start' | 'join' | 'leave'>('');

  const fail = (e: unknown) => Alert.alert('Family list', e instanceof Error ? e.message : String(e));
  const send = (c: string) =>
    Share.share({ message: `Let's share our grocery list in Shop Stride. Open My list, tap "Share this list", choose Join and enter ${c}.` }).catch(() => {});

  if (!auth.session) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: t.text }]}>Sign in to share your list</Text>
        <Text style={[styles.body, { color: t.textMuted, marginBottom: 24 }]}>
          Everyone you share with sees the same list. Add milk at home and it shows up on their phone in the store.
        </Text>
        <SignInButtons />
      </ScrollView>
    );
  }

  const start = async () => {
    setBusy('start');
    try {
      const info = await fam.create();
      send(info.code);
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };
  const join = async () => {
    setBusy('join');
    try {
      await fam.join(code);
      setCode('');
      Alert.alert('You’re on the family list', 'Your items were added to it, and theirs show up here.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };
  const leave = () =>
    Alert.alert('Stop sharing?', 'Your list stays on this phone, but changes stop going to the others.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop sharing',
        style: 'destructive',
        onPress: async () => {
          setBusy('leave');
          try {
            await fam.leave();
          } catch (e) {
            fail(e);
          } finally {
            setBusy('');
          }
        },
      },
    ]);

  const info = fam.info;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {info ? (
        <>
          <Card style={{ gap: 6, alignItems: 'center', paddingVertical: 20 }}>
            <Ionicons name="people" size={30} color={t.primary} />
            <Text style={[styles.title, { color: t.text }]}>Family list</Text>
            <Text style={[styles.body, { color: t.textMuted }]}>Everyone here sees the same items and check-offs. Aisles stay sorted for whichever store each of you picks.</Text>
            <Text style={[styles.code, { color: t.text }]} accessibilityLabel={`Code ${info.code.split('').join(' ')}`}>
              {info.code}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              {fam.status === 'error' ? 'Can’t reach the family list right now. Will keep trying.' : fam.status === 'syncing' ? 'Syncing…' : 'Up to date'}
            </Text>
          </Card>
          <SectionTitle>Sharing with</SectionTitle>
          {info.members.map((m, i) => (
            <View key={i} style={[styles.member, { backgroundColor: t.card }]}>
              <Ionicons name="person" size={16} color={t.textMuted} />
              <Text style={{ color: t.text, fontSize: 16 }}>
                {m.name}
                {m.me ? ' (you)' : ''}
              </Text>
            </View>
          ))}
          <Button title="Invite someone" icon="person-add" onPress={() => send(info.code)} style={{ marginTop: 16 }} />
          <Pressable accessibilityRole="button" onPress={leave} disabled={busy === 'leave'} style={{ alignSelf: 'center', marginTop: 24, padding: 8 }}>
            <Text style={{ color: t.danger, fontWeight: '600' }}>Stop sharing this list</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: t.text }]}>Share your list</Text>
          <Text style={[styles.body, { color: t.textMuted, textAlign: 'left' }]}>
            One list for the whole house. Anyone can add items, and when someone checks something off in the store it’s checked on every phone.
          </Text>
          <Button title="Start a family list" icon="people" onPress={start} loading={busy === 'start'} style={{ marginTop: 16 }} />
          <SectionTitle>Have a code?</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))}
              placeholder="6-letter code"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Family list code"
              style={[styles.input, { color: t.text, backgroundColor: t.card }]}
            />
            <Button title="Join" variant="secondary" disabled={code.length < 6} loading={busy === 'join'} onPress={join} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 6, marginTop: 8 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 6 },
  input: { flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: 4, paddingHorizontal: 14, height: 52, borderRadius: radius.md, textAlign: 'center' },
});
