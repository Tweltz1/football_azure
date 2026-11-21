import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutBadge, SaleBadge } from '../../components/SaleBadge';
import { StockBadge } from '../../components/StockBadge';
import { closeSwipeRows, SwipeRow } from '../../components/SwipeRow';
import { Button, lift, ScreenHeader, StudioCredit, tap } from '../../components/ui';
import { dealFor, outFor, useDeals, useStoreInfo } from '../../lib/deals';
import { locationLabel } from '../../lib/labels';
import { groupList } from '../../lib/listGroups';
import { useFamily } from '../../lib/family';
import { cleanLink } from '../../lib/recipeText';
import { useData } from '../../lib/store';
import { stockFor, useStock } from '../../lib/stock';
import { radius, useTheme } from '../../lib/theme';
import { capFirst } from '../../lib/caps';

// A week's basics across the store, so a first-time shopper can see the walking order before typing anything.
// A picture for each part of the store, shown next to its heading.
const SECTION_EMOJI: Record<string, string> = {
  'dept:produce': '🥬',
  'dept:bakery': '🥖',
  'dept:deli': '🥪',
  'dept:meat': '🥩',
  'dept:pantry': '🥫',
  'dept:frozen': '🧊',
  'dept:dairy': '🥛',
  'dept:other': '🛒',
};

const SAMPLE_LIST = ['bananas', 'apples', 'lettuce', 'bread', 'chicken breasts', 'ground beef', 'pasta', 'peanut butter', 'cereal', 'frozen pizza', 'milk', 'eggs', 'cheese', 'paper towels'];

export default function ListScreen() {
  const t = useTheme();
  const { items, store, addItem, addItems, toggleItem, removeItem, clearChecked, clearAll, lastRemoved, undoRemove } = useData();
  const family = useFamily();
  const insets = useSafeAreaInsets();
  const others = family.info?.members.filter((m) => !m.me).map((m) => m.name) ?? [];
  const [draft, setDraft] = useState('');
  const left = items.filter((i) => !i.checked).length;
  const deals = useDeals(store, items.filter((i) => !i.checked).map((i) => i.name));
  const storeInfo = useStoreInfo(store);
  const dealCount = storeInfo.deals.length;
  const stock = useStock(store, items.filter((i) => !i.checked).map((i) => i.name));
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
    const url = cleanLink(draft);
    setDraft('');
    // A recipe link pasted into the add box opens it, so its ingredients can be added to the list.
    if (url) router.push({ pathname: '/scan', params: { url } });
    else addItem(draft);
  };

  const startOver = () =>
    Alert.alert('Start a new list?', 'This clears every item on your list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear list', style: 'destructive', onPress: clearAll },
    ]);
  const checkedCount = items.length - left;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader
        title="My list"
        subtitle={items.length ? (left ? `${left} to get` : 'All done!') : undefined}
        action={items.length ? { label: 'New list', icon: 'refresh', onPress: startOver } : undefined}
      />

      <View style={[styles.hero, { backgroundColor: t.hero }, lift(t)]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens Stores, where you pick where to shop"
          onPress={() => router.navigate(store ? '/stores' : '/stores?view=map')}
          style={styles.heroTop}
        >
          <View style={styles.storeIcon}>
            <Ionicons name="storefront" size={18} color={t.onHero} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.storeName, { color: t.onHero }]} numberOfLines={1}>
              {store ? store.name : 'Choose your store'}
            </Text>
            <Text style={{ color: t.onHero, opacity: 0.8, fontSize: 13 }} numberOfLines={1}>
              {store ? (store.address ?? `${store.aisleCount} aisles`) : 'So your list is sorted in walking order'}
            </Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={{ color: t.onHero, fontWeight: '700', fontSize: 13 }}>{store ? 'Change' : 'Choose'}</Text>
          </View>
        </Pressable>
        {(dealCount > 0 || !!storeInfo.notice) && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Shows this store's sales and news"
            onPress={() => router.push('/deals')}
            style={styles.heroFamily}
          >
            <Ionicons name={dealCount ? 'pricetags' : 'megaphone-outline'} size={15} color={t.onHero} />
            <Text style={{ color: t.onHero, fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>
              {dealCount
                ? `${dealCount} deal${dealCount === 1 ? '' : 's'} this week${storeInfo.notice ? ' · store news' : ''}`
                : storeInfo.notice!.split('\n')[0]}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={t.onHero} style={{ opacity: 0.7 }} />
          </Pressable>
        )}
        {items.length > 0 && (
          <View accessibilityLabel={`${checkedCount} of ${items.length} checked off`} style={styles.progress}>
            <View style={[styles.progressFill, { width: `${Math.round((checkedCount / items.length) * 100)}%`, backgroundColor: t.accent }]} />
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push('/family')} style={styles.heroFamily}>
          <Ionicons name={family.info ? 'people' : 'people-outline'} size={15} color={t.onHero} />
          <Text style={{ color: t.onHero, fontWeight: '600', fontSize: 13, flex: 1, opacity: 0.92 }} numberOfLines={1}>
            {family.info ? (others.length ? `Shared with ${others.join(', ')}` : 'Family list: waiting for others to join') : 'Share this list with your family'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={t.onHero} style={{ opacity: 0.7 }} />
        </Pressable>
      </View>

      <View style={[styles.addRow, { backgroundColor: t.card, borderColor: draft ? t.primary : t.border }]}>
        <Ionicons name="add" size={22} color={draft ? t.primary : t.textMuted} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="Add an item or paste a link"
          placeholderTextColor={t.textMuted}
          returnKeyType="done"
          submitBehavior="submit"
          autoCorrect={!draft.startsWith('http')}
          autoCapitalize={draft.startsWith('http') ? 'none' : 'sentences'}
          style={[styles.input, { color: t.text }]}
        />
        {draft ? (
          <Pressable accessibilityLabel={cleanLink(draft) ? 'Open recipe link' : 'Add item'} onPress={submit} hitSlop={10}>
            <Ionicons name={cleanLink(draft) ? 'arrow-forward-circle' : 'add-circle'} size={32} color={t.primary} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a recipe from a link"
            onPress={() => router.push({ pathname: '/scan', params: { mode: 'link' } })}
            hitSlop={8}
            style={[styles.linkBtn, { backgroundColor: t.accentSoft }]}
          >
            <Ionicons name="link" size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>Recipe link</Text>
          </Pressable>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingTop: 2, paddingBottom: 110 }}
        onScrollBeginDrag={closeSwipeRows}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🧺</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>Your list is empty</Text>
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Type what you need above (paper towels and dog food too), or paste a link to any recipe and pick its ingredients. Then tap Start shopping for the shortest walk through your store.
            </Text>
            <Button
              title="Paste a recipe link"
              icon="link"
              onPress={() => router.push({ pathname: '/scan', params: { mode: 'link' } })}
              style={{ marginTop: 8, alignSelf: 'center' }}
            />
            <Button
              title="Pick a recipe"
              icon="restaurant"
              variant="secondary"
              onPress={() => router.navigate('/recipes')}
              style={{ alignSelf: 'center' }}
            />
            <Button
              title="Try a sample list"
              icon="sparkles"
              variant="ghost"
              onPress={() => addItems(SAMPLE_LIST)}
              style={{ alignSelf: 'center' }}
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
        renderSectionHeader={({ section }) => {
          const aisle = section.key.startsWith('aisle:') ? section.title.replace(/^Aisle\s+/, '') : null;
          return (
            <View style={styles.sectionRow}>
              <View style={[styles.sectionBadge, { backgroundColor: section.key === 'checked' ? t.primarySoft : t.card }]}>
                {aisle && aisle.length <= 3 ? (
                  <Text style={{ color: t.primary, fontWeight: '800', fontSize: 14 }}>{aisle}</Text>
                ) : (
                  <Text style={{ fontSize: 16 }}>{section.key === 'checked' ? '✅' : (SECTION_EMOJI[section.key] ?? '🛒')}</Text>
                )}
              </View>
              <Text style={[styles.section, { color: t.text }]}>{section.title}</Text>
              <Text style={{ color: t.textMuted, fontWeight: '600' }}>{section.data.length}</Text>
            </View>
          );
        }}
        renderItem={({ item, index, section }) => {
          const label = locationLabel(item);
          const first = index === 0;
          const last = index === section.data.length - 1;
          const corners = {
            borderTopLeftRadius: first ? radius.md : 0,
            borderTopRightRadius: first ? radius.md : 0,
            borderBottomLeftRadius: last ? radius.md : 0,
            borderBottomRightRadius: last ? radius.md : 0,
          };
          return (
            <SwipeRow onDelete={() => removeItem(item.id)} style={corners}>
              <View
                style={[
                  styles.row,
                  corners,
                  { backgroundColor: t.card },
                  !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
                ]}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  hitSlop={10}
                  onPress={() => {
                    tap();
                    toggleItem(item.id);
                  }}
                >
                  <View
                    style={[
                      styles.check,
                      item.checked ? { backgroundColor: t.primary, borderColor: t.primary } : { borderColor: t.textMuted },
                    ]}
                  >
                    {item.checked && <Ionicons name="checkmark" size={16} color={t.onPrimary} />}
                  </View>
                </Pressable>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/item/${item.id}`)}
                  onLongPress={() =>
                    Alert.alert(item.name, undefined, [
                      { text: 'Where is it?', onPress: () => router.push(`/item/${item.id}`) },
                      { text: 'Delete', style: 'destructive', onPress: () => removeItem(item.id) },
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                >
                  <Text
                    style={[
                      styles.itemName,
                      { color: item.checked ? t.textMuted : t.text, textDecorationLine: item.checked ? 'line-through' : 'none' },
                    ]}
                  >
                    {capFirst(item.name)}
                  </Text>
                  {/* The section header already says where; only add how much and anything worth knowing. */}
                  {(!!item.amount || (!item.checked && !!label.note)) && (
                    <Text style={{ fontSize: 13, color: t.textMuted }}>
                      {[item.amount, item.checked ? null : label.guessed ? null : label.note].filter(Boolean).join(' · ')}
                      {!item.checked && label.guessed && (
                        <Text style={{ color: t.warn }}>{item.amount ? ' · ' : ''}Best guess, tap to set the aisle</Text>
                      )}
                    </Text>
                  )}
                  {!item.checked && <SaleBadge deal={dealFor(deals, item.name)} name={item.name} />}
                  {!item.checked && <OutBadge out={outFor(deals, item.name)} />}
                  {!item.checked && <StockBadge check={stockFor(stock, item.name)} />}
                </Pressable>
                <Ionicons name="chevron-forward" size={16} color={t.border} />
              </View>
            </SwipeRow>
          );
        }}
      />

      {showUndo && removedCount > 0 && (
        <View style={[styles.undo, { backgroundColor: t.text, bottom: insets.bottom + (left > 0 ? 82 : 16) }]}>
          <Text style={{ color: t.bg, flex: 1 }} numberOfLines={1}>
            {removedCount === 1 ? `Removed ${lastRemoved!.items[0].item.name}` : `Removed ${removedCount} items`}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={undoRemove}>
            <Text style={{ color: t.accent, fontWeight: '800' }}>Undo</Text>
          </Pressable>
        </View>
      )}

      {left > 0 && (
        <View style={[styles.footer, { bottom: insets.bottom }]} pointerEvents="box-none">
          <Button
            style={[{ backgroundColor: t.primary }, lift(t), { shadowOpacity: 0.25, shadowColor: t.primary }]}
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
  hero: { marginHorizontal: 16, marginTop: 6, marginBottom: 12, borderRadius: radius.lg, padding: 14, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  heroFamily: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progress: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  storeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  storeName: { fontSize: 17, fontWeight: '800' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingLeft: 14, paddingRight: 8, borderRadius: 999, borderWidth: 1.5 },
  input: { flex: 1, fontSize: 17, paddingVertical: 13 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 17, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8, marginLeft: 2, marginRight: 6 },
  sectionBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  section: { flex: 1, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  undo: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 14, borderRadius: radius.md },
  empty: { alignItems: 'center', gap: 6, marginTop: 28, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  emptyText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  clearChecked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingTop: 8 },
});
