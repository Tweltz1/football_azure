import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Card, SectionTitle, tap } from '../components/ui';
import { shortDate, useStoreInfo } from '../lib/deals';
import { itemKey } from '../lib/sharedAisles';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

/** The chosen partner store's news and every deal this week, sent by the store's managers. */
export default function DealsScreen() {
  const t = useTheme();
  const { store, items, addItem } = useData();
  const info = useStoreInfo(store);
  const onList = new Set(items.filter((i) => !i.checked).map((i) => itemKey(i.name)));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={[styles.title, { color: t.text }]}>{info.store ?? store?.name ?? 'Your store'}</Text>
      <Text style={{ color: t.textMuted, marginBottom: 16 }}>Sent by the store itself.</Text>

      {!!info.notice && (
        <Card style={{ marginBottom: 16, flexDirection: 'row', gap: 10 }}>
          <Ionicons name="megaphone" size={20} color={t.primary} />
          <Text style={{ color: t.text, flex: 1, fontSize: 15, lineHeight: 21 }}>{info.notice}</Text>
        </Card>
      )}

      <SectionTitle>{info.deals.length ? `Deals this week (${info.deals.length})` : 'No deals this week'}</SectionTitle>
      {info.deals.map((d, i) => {
        const added = onList.has(itemKey(d.item));
        const ends = shortDate(d.ends);
        return (
          <View key={`${d.item}-${i}`} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
            <Ionicons name="pricetag" size={18} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{d.item}</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>
                {[d.price, ends ? `ends ${ends}` : null].filter(Boolean).join(' · ') || 'On sale this week'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={added ? `${d.item} is on your list` : `Add ${d.item} to your list`}
              disabled={added}
              hitSlop={8}
              onPress={() => {
                tap();
                addItem(d.item);
              }}
              style={[styles.add, { backgroundColor: added ? t.primarySoft : t.primary }]}
            >
              <Ionicons name={added ? 'checkmark' : 'add'} size={16} color={added ? t.primary : t.onPrimary} />
              <Text style={{ color: added ? t.primary : t.onPrimary, fontWeight: '700', fontSize: 13 }}>{added ? 'On list' : 'Add'}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});
