import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SaleBadge } from '../../components/SaleBadge';
import { SwipeRow } from '../../components/SwipeRow';
import { Button, ScreenHeader, StudioCredit, tap } from '../../components/ui';
import { dealFor, useDeals } from '../../lib/deals';
import { locationLabel } from '../../lib/labels';
import { groupList } from '../../lib/listGroups';
import { useData } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

export default function ListScreen() {
  const t = useTheme();
  const { items, store, addItem, toggleItem, removeItem, clearChecked, clearAll, lastRemoved, undoRemove } = useData();
  const [draft, setDraft] = useState('');
  const left = items.filter((i) => !i.checked).length;
  const deals = useDeals(store, items.filter((i) => !i.checked).map((i) => i.name));
  const sections = useMemo(() => groupList(items), [items]);

  // "Undo" shows for a few seconds after something is removed.
  const [expired, setExpired] = useState(0);
  useEffect(() => {
    if (!lastRemoved) return;
    const timer = setTimeout(() => setExpired(lastRemoved.at), 5000);
    return () => clearTimeout(timer);
  }, [lastRemoved]);
  const showUndo = !!lastRemoved && expired !== lastRemoved.at;
  const removedCount = lastRemoved?.items.length ?? 0;

  const submit = () => {
    addItem(draft);
    setDraft('');
  };

  const startOver = () =>
    Alert.alert('Start a new list?', 'This clears every item on your list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear list', style: 'destructive', onPress: clearAll },
    ]);
  const checkedCount = items.length - left;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="My list" action={items.length ? { label: 'New list', onPress: startOver } : undefined} />

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens Stores, where you pick where to shop"
        onPress={() => router.navigate(store ? '/stores' : '/stores?view=map')}
        style={[styles.store, { backgroundColor: t.card }]}
      >
        <View style={[styles.storeIcon, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="storefront" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.storeName, { color: t.text }]} numberOfLines={1}>
            {store ? store.name : 'Choose your store'}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
            {store ? (store.address ?? `${store.aisleCount} aisles`) : 'So your list is sorted in walking order'}
          </Text>
        </View>
        <Text style={{ color: t.primary, fontWeight: '600' }}>{store ? 'Change' : 'Choose'}</Text>
      </Pressable>

      <View style={[styles.addRow, { backgroundColor: t.card, borderColor: draft ? t.primary : t.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="Add an item, like milk"
          placeholderTextColor={t.textMuted}
          returnKeyType="done"
          submitBehavior="submit"
          style={[styles.input, { color: t.text }]}
        />
        <Pressable accessibilityLabel="Add item" onPress={submit} hitSlop={10}>
          <Ionicons name="add-circle" size={32} color={t.primary} />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={52} color={t.textMuted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>Your list is empty</Text>
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Type what you need above, pick your store, then tap Start shopping for the shortest walk through it.
            </Text>
            <Button
              title="Add from a recipe"
              icon="restaurant"
              variant="secondary"
              onPress={() => router.navigate('/recipes')}
              style={{ marginTop: 8, alignSelf: 'center' }}
            />
          </View>
        }
        ListFooterComponent={
          <>
            {checkedCount > 0 && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={clearChecked} style={styles.clearChecked}>
                <Ionicons name="checkmark-done" size={18} color={t.primary} />
                <Text style={{ color: t.primary, fontWeight: '600' }}>
                  Clear {checkedCount} checked item{checkedCount === 1 ? '' : 's'}
                </Text>
              </Pressable>
            )}
            <StudioCredit />
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.section, { color: t.textMuted }]}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => {
          const label = locationLabel(item);
          return (
            <SwipeRow onDelete={() => removeItem(item.id)}>
              <View style={[styles.row, { backgroundColor: t.card }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  hitSlop={10}
                  onPress={() => {
                    tap();
                    toggleItem(item.id);
                  }}
                >
                  <Ionicons
                    name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={item.checked ? t.primary : t.textMuted}
                  />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/item/${item.id}`)}>
                  <Text
                    style={[styles.itemName, { color: t.text, textDecorationLine: item.checked ? 'line-through' : 'none' }]}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 13 }}>
                    {!!item.amount && <Text style={{ color: t.text }}>{item.amount} · </Text>}
                    <Text style={{ color: label.guessed ? t.warn : t.textMuted }}>{label.text}</Text>
                  </Text>
                  {!item.checked && <SaleBadge deal={dealFor(deals, item.name)} name={item.name} />}
                </Pressable>
                <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
              </View>
            </SwipeRow>
          );
        }}
      />

      {showUndo && removedCount > 0 && (
        <View style={[styles.undo, { backgroundColor: t.text }]}>
          <Text style={{ color: t.bg, flex: 1 }} numberOfLines={1}>
            {removedCount === 1 ? `Removed ${lastRemoved!.items[0].item.name}` : `Removed ${removedCount} items`}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={undoRemove}>
            <Text style={{ color: t.bg, fontWeight: '800' }}>Undo</Text>
          </Pressable>
        </View>
      )}

      {left > 0 && (
        <View style={styles.footer}>
          <Button
            title={`Start shopping · ${left} item${left === 1 ? '' : 's'}`}
            icon="navigate"
            onPress={() => router.push('/route')}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  store: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginTop: 10, marginBottom: 10, padding: 12, borderRadius: radius.md },
  storeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  storeName: { fontSize: 16, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5 },
  input: { flex: 1, fontSize: 17, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  itemName: { fontSize: 17, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 12, marginBottom: 6, marginLeft: 4 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 14, borderRadius: radius.md },
  empty: { alignItems: 'center', gap: 6, marginTop: 36, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  emptyText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  clearChecked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  footer: { padding: 16, paddingTop: 8 },
});
