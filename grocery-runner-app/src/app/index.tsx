import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SaleBadge } from '../components/SaleBadge';
import { SwipeRow } from '../components/SwipeRow';
import { Button, tap } from '../components/ui';
import { dealFor, useDeals } from '../lib/deals';
import { locationLabel } from '../lib/labels';
import { groupList } from '../lib/listGroups';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

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

  // The ••• menu: start over, and shortcuts to every other part of the app.
  const openMenu = () => {
    const actions: { title: string; run: () => void; destructive?: boolean }[] = [
      { title: 'Start a new list', run: clearAll, destructive: true },
      ...(items.some((i) => i.checked) ? [{ title: 'Clear checked items', run: clearChecked }] : []),
      { title: store ? 'Change store' : 'Choose store', run: () => router.push('/store') },
      { title: 'Stores on a map', run: () => router.push('/map') },
      { title: 'Recipes', run: () => router.push('/recipes') },
    ];
    const usable = items.length ? actions : actions.filter((a) => a.title !== 'Start a new list');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...usable.map((a) => a.title), 'Cancel'],
          cancelButtonIndex: usable.length,
          destructiveButtonIndex: usable.findIndex((a) => a.destructive),
        },
        (i) => usable[i]?.run(),
      );
    } else {
      Alert.alert('Shop Stride', undefined, [
        ...usable.map((a) => ({ text: a.title, onPress: a.run, style: a.destructive ? ('destructive' as const) : undefined })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Menu" hitSlop={12} onPress={openMenu}>
              <Ionicons name="ellipsis-horizontal-circle" size={26} color={t.primary} />
            </Pressable>
          ),
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/store')}
        style={[styles.store, { backgroundColor: t.card }]}
      >
        <Ionicons name="storefront" size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.storeName, { color: t.text }]}>{store ? store.name : 'Choose your store'}</Text>
          <Text style={{ color: t.textMuted }} numberOfLines={1}>
            {store ? (store.address ?? `${store.aisleCount} aisles`) : 'Pick where you shop to sort your route'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
      </Pressable>

      <View style={styles.actions}>
        <Button title="Recipes" icon="restaurant" variant="secondary" onPress={() => router.push('/recipes')} style={{ flex: 1 }} />
        <Button
          title="Where to shop"
          icon="pricetags"
          variant="secondary"
          disabled={!left}
          onPress={() => router.push('/suggest')}
          style={{ flex: 1 }}
        />
      </View>

      {store && store.chain !== 'kroger' && items.some((i) => !i.checked && i.location.kind !== 'aisle') && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/aisle-scan')}
          style={[styles.scanLink, { backgroundColor: t.primarySoft }]}
        >
          <Ionicons name="scan" size={18} color={t.primary} />
          <Text style={{ color: t.primary, fontWeight: '600', flex: 1 }}>Get aisles from store-app screenshots</Text>
          <Ionicons name="chevron-forward" size={18} color={t.primary} />
        </Pressable>
      )}

      <View style={[styles.addRow, { backgroundColor: t.card }]}>
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
          <Text style={[styles.empty, { color: t.textMuted }]}>
            Add what you need, or pick a recipe. Shop Stride sorts it into the shortest walk through the store.
          </Text>
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
                <Pressable accessibilityLabel={`Remove ${item.name}`} hitSlop={10} onPress={() => removeItem(item.id)}>
                  <Ionicons name="close" size={20} color={t.textMuted} />
                </Pressable>
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

      <View style={styles.footer}>
        {items.some((i) => i.checked) && (
          <Button title="Clear checked" variant="secondary" onPress={clearChecked} style={{ flex: 1 }} />
        )}
        <Button
          title={left ? `Route ${left} item${left === 1 ? '' : 's'}` : 'Route'}
          icon="navigate"
          disabled={!left}
          onPress={() => router.push('/route')}
          style={{ flex: 2 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  store: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 8, padding: 14, borderRadius: radius.lg },
  storeName: { fontSize: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 8 },
  scanLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: radius.md },
  addRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, borderRadius: radius.md },
  input: { flex: 1, fontSize: 17, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  itemName: { fontSize: 17, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 12, marginBottom: 6, marginLeft: 4 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 14, borderRadius: radius.md },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, lineHeight: 22, paddingHorizontal: 24 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 8 },
});
