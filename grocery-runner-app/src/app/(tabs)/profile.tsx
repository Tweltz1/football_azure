import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lift, PRIVACY_URL, ScreenHeader, SectionTitle, StudioCredit, SUPPORT_EMAIL, tap } from '../../components/ui';
import { useFamily } from '../../lib/family';
import { WEEKDAYS } from '../../lib/mealPlan';
import { usePlan } from '../../lib/plan';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';
import { AccountContent } from '../account';

type Row = { icon: ComponentProps<typeof Ionicons>['name']; label: string; value?: string; onPress: () => void };

/** Profile and settings: sign-in, family list, store, meal-plan prep day, help. A tab, so it's one tap from anywhere. */
export default function ProfileScreen() {
  const t = useTheme();
  const { store } = useData();
  const family = useFamily();
  const { plan } = usePlan();

  const group = (rows: Row[]) => (
    <View style={[styles.group, { backgroundColor: t.card }, lift(t)]}>
      {rows.map((r, n) => (
        <Pressable
          key={r.label}
          accessibilityRole="button"
          onPress={() => {
            tap();
            r.onPress();
          }}
          style={({ pressed }) => [
            styles.row,
            { opacity: pressed ? 0.7 : 1 },
            n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
            <Ionicons name={r.icon} size={17} color={t.primary} />
          </View>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{r.label}</Text>
          {!!r.value && (
            <Text style={{ color: t.textMuted, fontSize: 14, maxWidth: 150 }} numberOfLines={1}>
              {r.value}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Profile" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <AccountContent embedded />

        <SectionTitle>Settings</SectionTitle>
        {group([
          { icon: 'storefront', label: 'My store', value: store?.name ?? 'Not set', onPress: () => router.push('/store') },
          {
            icon: 'people',
            label: 'Family list',
            value: family.info ? `${family.info.members.length} people` : 'Off',
            onPress: () => router.push('/family'),
          },
          { icon: 'calendar', label: 'Meal prep day', value: WEEKDAYS[plan.prepDay], onPress: () => router.navigate('/plan') },
        ])}

        <SectionTitle>Help</SectionTitle>
        {group([
          {
            icon: 'mail',
            label: 'Contact us',
            onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shop Stride feedback')}`),
          },
          { icon: 'shield-checkmark', label: 'Privacy', onPress: () => Linking.openURL(PRIVACY_URL) },
        ])}
        <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          Shop Stride {Constants.expoConfig?.version ?? ''}
        </Text>
        <StudioCredit style={{ paddingTop: 4 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
