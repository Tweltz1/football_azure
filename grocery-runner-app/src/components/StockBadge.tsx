import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { StockCheck } from '../lib/storePick';
import { stockText } from '../lib/stock';
import { useTheme } from '../lib/theme';

/** "In stock · $3.49" / "Out of stock at this store" under an item, from Kroger's own store data. */
export function StockBadge({ check }: { check?: StockCheck }) {
  const t = useTheme();
  const s = stockText(check);
  if (!s) return null;
  const color = s.tone === 'good' ? t.primary : s.tone === 'warn' ? t.warn : t.danger;
  const icon = s.tone === 'good' ? 'checkmark-circle' : s.tone === 'warn' ? 'alert-circle' : 'close-circle';
  return (
    <View style={styles.badge} accessible accessibilityLabel={`${s.text}, from Kroger`}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ color, fontWeight: '600', fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
        {s.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, marginTop: 3 },
});
