import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Deal, dealText } from '../lib/deals';
import { useTheme } from '../lib/theme';

/** "On sale: $2.99" pill under an item, from the store's weekly deals. */
export function SaleBadge({ deal, name }: { deal?: Deal; name: string }) {
  const t = useTheme();
  if (!deal) return null;
  return (
    <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
      <Ionicons name="pricetag" size={12} color={t.primary} />
      <Text style={{ color: t.primary, fontWeight: '700', fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
        {dealText(deal, name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 3,
  },
});
