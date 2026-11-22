import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Field } from '../components/Field';
import { Button, Card, SectionTitle } from '../components/ui';
import { adminCall, AdminClaim, getAdminKey, setAdminKey } from '../lib/storePortal';
import { radius, useTheme } from '../lib/theme';

type AdminStore = {
  id: string;
  name: string;
  address: string | null;
  managers: { user_id: string; email: string; person: string | null }[];
};

/** Tyler's approvals: store manager requests (Approve / Deny) and who manages each store (Remove frees the store). */
export default function StoreAdminScreen() {
  const t = useTheme();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      adminCall<{ pending: AdminClaim[] }>({ action: 'admin-claims' }),
      adminCall<AdminStore[]>({ action: 'admin-list' }),
    ]);
    setClaims(c.pending);
    setStores(s);
  }, []);

  useEffect(() => {
    getAdminKey().then((k) => {
      if (!k) return setUnlocked(false);
      load()
        .then(() => setUnlocked(true))
        .catch(() => setUnlocked(false));
    });
  }, [load]);

  const unlock = async () => {
    await setAdminKey(password);
    try {
      await load();
      setUnlocked(true);
      setPassword('');
    } catch (e) {
      await setAdminKey(null);
      Alert.alert('Admin', (e as Error).message);
    }
  };

  const act = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      await adminCall(body);
      await load();
      Alert.alert(done);
    } catch (e) {
      Alert.alert('Not done', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (unlocked === null) return null;
  if (!unlocked) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', marginBottom: 8 }}>Shop Stride admin</Text>
        <Text style={{ color: t.textMuted, marginBottom: 16 }}>For approving store managers. The password stays on this phone.</Text>
        <Field label="Admin password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" onSubmitEditing={unlock} />
        <Button title="Unlock" onPress={unlock} disabled={!password} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{claims.length ? `Manager requests (${claims.length})` : 'No manager requests waiting'}</SectionTitle>
      {claims.map((c) => (
        <Card key={c.id} style={{ marginBottom: 12 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
            {c.person}
            {c.title ? `, ${c.title}` : ''}
          </Text>
          <Text style={{ color: t.text, marginBottom: 6 }}>
            {c.store_name}
            {c.partner_id ? '' : ' (new store)'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
            <Text style={[styles.tag, { color: c.work_email ? t.primary : t.warn, borderColor: c.work_email ? t.primary : t.warn }]}>
              {c.work_email ? 'work email' : 'not a work email'}
            </Text>
          </View>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {c.email} · phone they gave {c.phone}
            {c.address ? `\n${c.address}` : ''}
            {c.note ? `\nNote: ${c.note}` : ''}
          </Text>
          {c.lat != null && (
            <Pressable onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(c.store_name)}&ll=${c.lat},${c.lon}`)}>
              <Text style={{ color: t.primary, fontWeight: '600', marginTop: 6 }}>Find the store&apos;s public phone in Maps</Text>
            </Pressable>
          )}
          <Text style={{ color: t.textMuted, fontSize: 12, marginVertical: 8 }}>
            Call the store&apos;s public number and ask for {c.person} before approving.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Approve"
              style={{ flex: 1 }}
              loading={busy === `a${c.id}`}
              onPress={() =>
                Alert.alert('Approve?', `Let ${c.person} edit ${c.store_name}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Approve', onPress: () => act(`a${c.id}`, { action: 'admin-approve', id: c.id }, 'Approved. They were emailed.') },
                ])
              }
            />
            <Button
              title="Deny"
              variant="secondary"
              style={{ flex: 1 }}
              loading={busy === `r${c.id}`}
              onPress={() =>
                Alert.alert('Deny?', `${c.person} gets an email saying we couldn't confirm it.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Deny',
                    style: 'destructive',
                    onPress: () => act(`r${c.id}`, { action: 'admin-reject', id: c.id, note: "We couldn't reach the store to confirm." }, 'Denied.'),
                  },
                ])
              }
            />
          </View>
        </Card>
      ))}

      <SectionTitle>Stores and managers</SectionTitle>
      {stores.map((s) => (
        <View key={s.id} style={[styles.store, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '700' }}>{s.name}</Text>
          {!s.managers.length && <Text style={{ color: t.textMuted, fontSize: 13 }}>No manager (anyone can claim it)</Text>}
          {s.managers.map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: t.textMuted, fontSize: 13, flex: 1 }}>
                {m.person ? `${m.person} · ` : ''}
                {m.email}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert('Remove manager?', `${m.email} can no longer edit ${s.name}, and the store can be claimed again.`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => act(`m${m.user_id}`, { action: 'admin-remove-manager', partner_id: s.id, user_id: m.user_id }, 'Removed.'),
                    },
                  ])
                }
              >
                <Text style={{ color: t.danger, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ))}
      <Pressable onPress={() => setAdminKey(null).then(() => setUnlocked(false))} style={{ alignSelf: 'center', marginTop: 20, padding: 6 }}>
        <Text style={{ color: t.textMuted }}>Lock admin on this phone</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tag: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  store: { borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 8 },
});
