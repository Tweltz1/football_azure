import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useHousehold } from '../lib/household';
import { usePro } from '../lib/pro';
import { useSync } from '../lib/sync';
import { radius, useTheme } from '../lib/theme';
import { Button, Card } from './ui';

/**
 * Account screen: share your totes with your household. A Pro owner invites with a code; family members
 * join with it and see the same totes, photos and packing lists (and get Pro features while they're in).
 */
export function HouseholdCard() {
  const t = useTheme();
  const h = useHousehold();
  const pro = usePro();
  const sync = useSync();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'invite' | 'join' | 'leave'>('');
  const [joining, setJoining] = useState(false);

  const fail = (e: unknown) => Alert.alert('Household', e instanceof Error ? e.message : String(e));

  const invite = async () => {
    if (!pro.isPro) {
      router.push('/pro');
      return;
    }
    setBusy('invite');
    try {
      const c = await h.invite();
      await Share.share({
        message: `Join my ToteTrack household so we share the same totes. In ToteTrack, open Account, tap "Join a household" and enter ${c}. The code works for 7 days.`,
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const join = async () => {
    if (code.trim().length < 6) return;
    setBusy('join');
    try {
      // Your totes so far go up first, so they land in the household instead of being left behind.
      await sync.finishSync();
      await h.join(code);
      setCode('');
      setJoining(false);
      Alert.alert('You joined the household', 'Your totes are now shared with everyone in it. Syncing now.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const leave = (memberId?: string, email?: string | null) =>
    Alert.alert(
      memberId ? `Remove ${email ?? 'this person'}?` : 'Leave the household?',
      memberId
        ? 'They stop seeing your totes. Whatever is on their phone now stays with them as their own copy.'
        : 'You stop seeing the shared totes. Whatever is on this phone now stays with you as your own copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: memberId ? 'Remove' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setBusy('leave');
            try {
              await h.leave(memberId);
            } catch (e) {
              fail(e);
            } finally {
              setBusy('');
            }
          },
        },
      ],
    );

  const others = h.members.filter((m) => !m.me);

  return (
    <Card style={{ marginTop: 20, gap: 10 }}>
      <View style={styles.head}>
        <Ionicons name="people" size={22} color={t.primary} />
        <Text style={[styles.title, { color: t.text }]}>Household</Text>
        {!pro.isPro && h.role !== 'member' ? (
          <View style={[styles.pill, { backgroundColor: t.primarySoft }]}>
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>PRO</Text>
          </View>
        ) : null}
      </View>
      {h.role === 'solo' ? (
        <Text style={[styles.body, { color: t.textMuted }]}>
          Share your totes with the people you live with. Everyone sees the same totes, photos and packing lists, and changes show up on every phone. One Pro
          subscription covers up to 6 people.
        </Text>
      ) : (
        <>
          <Text style={[styles.body, { color: t.textMuted }]}>
            {h.role === 'owner'
              ? 'These people share your totes. Your Pro subscription covers them too.'
              : `You share ${h.members.find((m) => m.owner)?.email ?? 'the owner'}’s totes. Their Pro subscription covers you.`}
          </Text>
          {(h.role === 'owner' ? others : h.members).map((m) => (
            <View key={m.id} style={[styles.member, { borderColor: t.border }]}>
              <Ionicons name={m.owner ? 'home' : 'person'} size={16} color={t.textMuted} />
              <Text style={{ color: t.text, flex: 1 }} numberOfLines={1}>
                {m.email ?? 'Family member'}
                {m.me ? ' (you)' : m.owner ? ' (owner)' : ''}
              </Text>
              {h.role === 'owner' ? (
                <Pressable onPress={() => leave(m.id, m.email)} hitSlop={8} accessibilityLabel={`Remove ${m.email ?? 'member'}`}>
                  <Text style={{ color: t.danger, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </>
      )}
      {h.role !== 'member' ? (
        <Button title={pro.isPro ? 'Invite someone' : 'Get Pro to share'} icon="person-add" onPress={invite} loading={busy === 'invite'} />
      ) : (
        <Button title="Leave household" icon="exit-outline" variant="secondary" onPress={() => leave()} loading={busy === 'leave'} />
      )}
      {h.role === 'solo' ? (
        joining ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))}
              placeholder="6-letter code"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Household code"
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <Button title="Join" icon="enter-outline" variant="secondary" onPress={join} disabled={code.length < 6} loading={busy === 'join'} />
          </View>
        ) : (
          <Pressable onPress={() => setJoining(true)} style={{ alignSelf: 'center', padding: 6 }}>
            <Text style={{ color: t.primary, fontWeight: '600' }}>Join a household with a code</Text>
          </Pressable>
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  input: { height: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 20, letterSpacing: 4, fontWeight: '700', textAlign: 'center' },
});
