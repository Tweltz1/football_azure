import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, tap } from '../components/ui';
import { locationLabel } from '../lib/labels';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function ListScreen() {
  const t = useTheme();
  const { items, store, addItem, toggleItem, removeItem, clearChecked } = useData();
  const [draft, setDraft] = useState('');
  const left = items.filter((i) => !i.checked).length;

  const submit = () => {
    addItem(draft);
    setDraft('');
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/store')}
        style={[styles.store, { backgroundColor: t.card }]}
      >
        <Ionicons name="storefront" size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.storeName, { color: t.text }]}>{store ? store.name : 'Choose your store'}</Text>
          <Text style={{ color: t.textMuted }} numberOfLines={1}>
            {store ? (store.address ?? `${store.aisleCount} aisles`) : 'Kroger stores find aisles for you'}
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

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.textMuted }]}>
            Add what you need, or pick a recipe. Shop Stride sorts it into the shortest walk through the store.
          </Text>
        }
        renderItem={({ item }) => {
          const label = locationLabel(item);
          return (
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
                <Text style={{ color: label.guessed ? t.warn : t.textMuted, fontSize: 13 }}>{label.text}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Remove ${item.name}`} hitSlop={10} onPress={() => removeItem(item.id)}>
                <Ionicons name="close" size={20} color={t.textMuted} />
              </Pressable>
            </View>
          );
        }}
      />

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
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, lineHeight: 22, paddingHorizontal: 24 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 8 },
});
