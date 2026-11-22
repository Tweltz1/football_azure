import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Field } from '../components/Field';
import { SignInButtons } from '../components/SignInButtons';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { CHAINS } from '../lib/chains';
import { useData } from '../lib/store';
import { claimable, CLAIM_CHAINS, FoundPartner, managerCall, Me, PORTAL_WEB, storePlace } from '../lib/storePortal';
import { radius, useTheme } from '../lib/theme';

const STATUS = { pending: 'Being checked', approved: 'Approved', rejected: 'Not approved' } as const;

/** "For store managers": your stores, and claiming one (Tyler approves each claim). */
export default function ManagerScreen() {
  const t = useTheme();
  const auth = useAuth();
  const { store } = useData();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!auth.session) return;
    managerCall<Me>({ action: 'me' })
      .then((m) => {
        setMe(m);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [auth.session]);
  useFocusEffect(load);

  if (!auth.session) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: t.text }]}>Manage your store in Shop Stride</Text>
        <Text style={[styles.body, { color: t.textMuted, marginBottom: 24 }]}>
          Store managers keep their store current for shoppers: which aisle items are in, this week&apos;s sales, items that are out
          of stock, and a short note like holiday hours. Sign in or create an account, then claim your store.
        </Text>
        <SignInButtons />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {error && <Text style={{ color: t.danger, marginBottom: 10 }}>{error}</Text>}
      <SectionTitle>Your stores</SectionTitle>
      {!me ? (
        <Text style={{ color: t.textMuted }}>Loading…</Text>
      ) : me.stores.length ? (
        me.stores.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/manage-store', params: { id: s.id, name: s.name } })}
            style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}
          >
            <Ionicons name="storefront" size={20} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{s.name}</Text>
              {!!s.address && <Text style={{ color: t.textMuted, fontSize: 13 }}>{s.address}</Text>}
            </View>
            <Text style={{ color: t.primary, fontWeight: '700' }}>Edit</Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: t.textMuted, marginBottom: 8 }}>No stores yet. Claim yours below.</Text>
      )}
      {me?.claims
        .filter((c) => c.status !== 'approved')
        .map((c) => (
          <View key={c.id} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
            <Ionicons name={c.status === 'pending' ? 'time-outline' : 'close-circle-outline'} size={20} color={t.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>{c.store_name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>
                {STATUS[c.status]}
                {c.decided_note ? ` · ${c.decided_note}` : ''}
              </Text>
            </View>
          </View>
        ))}

      <ClaimForm current={claimable(store) ? store : null} onSent={load} />

      <Pressable onPress={() => Linking.openURL(PORTAL_WEB)} style={{ marginTop: 18, alignSelf: 'center' }}>
        <Text style={{ color: t.primary, fontWeight: '600' }}>On a computer? Use weltzcraft.com/shopstride/stores</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/store-admin')} style={{ marginTop: 26, alignSelf: 'center', padding: 6 }}>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Shop Stride admin</Text>
      </Pressable>
    </ScrollView>
  );
}

function ClaimForm({ current, onSent }: { current: ReturnType<typeof useData>['store'] | null; onSent: () => void }) {
  const t = useTheme();
  const auth = useAuth();
  const [person, setPerson] = useState(auth.name);
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [which, setWhich] = useState<'current' | 'search'>(current ? 'current' : 'search');
  const [chain, setChain] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundPartner[] | null>(null);
  const [picked, setPicked] = useState<FoundPartner | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return;
    try {
      setFound(await managerCall<FoundPartner[]>({ action: 'find-stores', query, chain: chain || undefined }));
      setPicked(null);
    } catch (e) {
      Alert.alert('Find your store', (e as Error).message);
    }
  };

  const send = async () => {
    const body: Record<string, unknown> = { action: 'claim', person, title, phone, note };
    if (which === 'search') {
      if (!picked) return Alert.alert('Claim your store', 'Search for your store and tap it. If it isn’t listed, choose it as your store in Shop Stride first, then claim it here.');
      body.partner_id = picked.id;
    } else if (current) {
      const place = storePlace(current);
      Object.assign(body, {
        chain: current.chain,
        store_name: current.name,
        address: current.address || current.name,
        ...(place ?? {}),
        ...(/^(kroger|walmart):/.test(current.id) ? { store_key: current.id } : {}),
      });
    }
    setBusy(true);
    try {
      await managerCall({ ...body });
      Alert.alert('Request sent', 'We’ll check with the store and let you know by email, usually within a day.');
      setNote('');
      onSent();
    } catch (e) {
      Alert.alert('Claim your store', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Text style={[styles.cardTitle, { color: t.text }]}>Claim your store</Text>
      <Text style={{ color: t.textMuted, marginBottom: 12, fontSize: 14 }}>
        We check every request before turning on editing, usually by calling the store, so please use the store&apos;s main phone number.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {current && <Chip label={`My store: ${current.name}`} selected={which === 'current'} onPress={() => setWhich('current')} />}
        <Chip label="Find another store" selected={which === 'search'} onPress={() => setWhich('search')} />
      </View>
      {which === 'search' && (
        <View style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {CHAINS.filter((c) => CLAIM_CHAINS.includes(c.chain)).map((c) => (
              <Chip key={c.chain} label={c.label} selected={chain === c.chain} onPress={() => setChain(chain === c.chain ? '' : c.chain)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Town or store name" value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="Altoona" />
            <Button title="Find" variant="secondary" onPress={search} style={{ marginBottom: 10 }} />
          </View>
          {found?.map((f) => {
            const off = f.claimed || f.pending;
            return (
              <Pressable
                key={f.id}
                disabled={off}
                onPress={() => setPicked(f)}
                style={[styles.pick, { borderColor: picked?.id === f.id ? t.primary : t.border, opacity: off ? 0.55 : 1 }]}
              >
                <Text style={{ color: t.text, fontWeight: '600' }}>{f.name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>
                  {f.claimed ? 'Already claimed' : f.pending ? 'Being checked' : f.address ?? ''}
                </Text>
              </Pressable>
            );
          })}
          {found && !found.length && (
            <Text style={{ color: t.textMuted, fontSize: 14 }}>Not listed yet. Choose it as your store in Shop Stride, then claim it as &quot;My store&quot;.</Text>
          )}
        </View>
      )}
      <Field label="Your name" value={person} onChangeText={setPerson} autoComplete="name" placeholder="Jane Smith" />
      <Field label="Job title" value={title} onChangeText={setTitle} placeholder="Store Manager" />
      <Field label="Store phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="715-555-0100" />
      <Field label="Anything else? (optional)" value={note} onChangeText={setNote} placeholder="Best time to call" />
      <Button title="Claim this store" icon="shield-checkmark" onPress={send} loading={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 16, lineHeight: 22 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, marginBottom: 8 },
  pick: { borderWidth: 1.5, borderRadius: radius.sm, padding: 10, marginBottom: 6 },
});
