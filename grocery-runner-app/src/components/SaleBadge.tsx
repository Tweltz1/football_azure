import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Deal, dealText, Out, outText } from '../lib/deals';
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

/** "Out of stock here · back by Nov 30" pill, when the store's manager marked the item out. */
export function OutBadge({ out }: { out?: Out }) {
  const t = useTheme();
  if (!out) return null;
  return (
    <View style={[styles.badge, { borderWidth: 1, borderColor: t.warn }]}>
      <Ionicons name="alert-circle" size={12} color={t.warn} />
      <Text style={{ color: t.warn, fontWeight: '700', fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
        {outText(out)}
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
