import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FALLBACK_PRICES, FREE_TOTE_LIMIT, MANAGE_URL, PRIVACY_URL, PRO_PRODUCTS, TERMS_URL, usePro } from '../lib/pro';
import { useTotes } from '../lib/store';
import { radius, useTheme } from '../lib/theme';
import { Button, IconName, tap } from './ui';

type Plan = keyof typeof PRO_PRODUCTS;

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'infinite', text: 'Unlimited totes' },
  { icon: 'lock-open', text: `Your first ${FREE_TOTE_LIMIT} totes and every feature stay free` },
  { icon: 'heart', text: 'Supports a small, independent app with no ads' },
];

/**
 * The ToteTrack Pro screen. reason "limit" is shown when someone tries to make a tote past the free
 * limit; their existing totes are never locked.
 */
export function ProPaywall({ reason, onClose }: { reason?: 'limit'; onClose?: () => void }) {
  const t = useTheme();
  const pro = usePro();
  const { totes } = useTotes();
  const [plan, setPlan] = useState<Plan>('yearly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const product = (p: Plan) => pro.products.find((x) => x.id === PRO_PRODUCTS[p]);
  const price = (p: Plan) => product(p)?.price ?? FALLBACK_PRICES[p];
  const per = (p: Plan) => (p === 'yearly' ? 'year' : 'month');
  const savings = (() => {
    const m = product('monthly')?.priceValue;
    const y = product('yearly')?.priceValue;
    if (!m || !y) return 'Best value';
    const pct = Math.round((1 - y / (m * 12)) * 100);
    return pct > 0 ? `Save ${pct}%` : 'Best value';
  })();
  const trial = product(plan)?.trial;

  const buy = async () => {
    setBusy('buy');
    try {
      const r = await pro.buy(PRO_PRODUCTS[plan]);
      if (r === 'purchased') {
        Alert.alert('Welcome to ToteTrack Pro', 'Add as many totes as you like.');
        onClose?.();
      } else if (r === 'pending') {
        Alert.alert('Waiting for approval', 'Your purchase is pending. Pro turns on as soon as it’s approved.');
      }
    } catch (e) {
      Alert.alert("Couldn't subscribe", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const ok = await pro.restore();
      Alert.alert(ok ? 'ToteTrack Pro restored' : 'No subscription found', ok ? 'You’re all set.' : 'This Apple ID doesn’t have an active ToteTrack Pro subscription.');
      if (ok) onClose?.();
    } catch (e) {
      Alert.alert("Couldn't restore", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (pro.isPro) {
    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="star" size={44} color={t.primary} />
        </View>
        <Text style={[styles.title, { color: t.text }]}>You have ToteTrack Pro</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          {pro.plan === PRO_PRODUCTS.yearly ? 'Yearly plan' : 'Monthly plan'} · unlimited totes ({totes.length} so far). Thanks for supporting ToteTrack!
        </Text>
        <Button title="Manage subscription" icon="settings-outline" variant="secondary" onPress={() => Linking.openURL(MANAGE_URL)} style={{ marginTop: 24, alignSelf: 'stretch' }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: t.primarySoft }]}>
        <Ionicons name="cube" size={44} color={t.primary} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{reason === 'limit' ? `You’ve used your ${FREE_TOTE_LIMIT} free totes` : 'ToteTrack Pro'}</Text>
      <Text style={[styles.body, { color: t.textMuted }]}>
        {reason === 'limit'
          ? 'All your totes are still here: open, edit, scan and fill them anytime. Go Pro to add more.'
          : pro.freeLeft === 0
            ? `You’ve used all ${FREE_TOTE_LIMIT} free totes. Go Pro to add as many as you need.`
            : `You have ${pro.freeLeft} of ${FREE_TOTE_LIMIT} free totes left. Go Pro to add as many as you need.`}
      </Text>

      <View style={{ gap: 12, marginTop: 22, alignSelf: 'stretch' }}>
        {PERKS.map((p) => (
          <View key={p.text} style={styles.perk}>
            <Ionicons name={p.icon} size={20} color={t.primary} />
            <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{p.text}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 10, marginTop: 24, alignSelf: 'stretch' }}>
        {(['yearly', 'monthly'] as Plan[]).map((p) => {
          const on = plan === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => {
                tap();
                setPlan(p);
              }}
              style={[styles.plan, { backgroundColor: t.card, borderColor: on ? t.primary : t.border }]}
            >
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{p === 'yearly' ? 'Yearly' : 'Monthly'}</Text>
                <Text style={{ color: t.textMuted, fontSize: 14 }}>
                  {price(p)} per {per(p)}
                </Text>
              </View>
              {p === 'yearly' ? (
                <View style={[styles.tag, { backgroundColor: t.primary }]}>
                  <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>{savings}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Button
        title={trial ? `Try ${trial} free` : `Subscribe for ${price(plan)}/${per(plan)}`}
        icon="star"
        onPress={buy}
        loading={busy === 'buy'}
        disabled={!!busy}
        style={{ marginTop: 20, alignSelf: 'stretch' }}
      />
      <Button title="Restore purchases" variant="ghost" onPress={restore} loading={busy === 'restore'} disabled={!!busy} style={{ marginTop: 4, alignSelf: 'stretch' }} />

      <Text style={[styles.fine, { color: t.textMuted }]}>
        ToteTrack Pro is an auto-renewing subscription: {price(plan)} per {per(plan)}
        {trial ? ` after a ${trial} free trial` : ''}, charged to your Apple ID. It renews automatically unless cancelled at least 24
        hours before the end of the current period. Manage or cancel anytime in Settings › your name › Subscriptions.
      </Text>
      <View style={styles.links}>
        <Text style={[styles.link, { color: t.primary }]} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
          Terms of Use
        </Text>
        <Text style={{ color: t.textMuted }}>·</Text>
        <Text style={[styles.link, { color: t.primary }]} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
          Privacy Policy
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 48, alignItems: 'center' },
  hero: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 14, marginTop: 8 },
  title: { fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 8, paddingHorizontal: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: radius.md, padding: 14 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14 },
  links: { flexDirection: 'row', gap: 10, marginTop: 10 },
  link: { fontSize: 13, fontWeight: '600' },
});
