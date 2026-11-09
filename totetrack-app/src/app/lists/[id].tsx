import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, EmptyState, IconButton, SectionTitle, tap, ToteBadge } from '../../components/ui';
import { ListEntry, useLists } from '../../lib/lists';
import { useTotes } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const lists = useLists();
  const { totes, getTote } = useTotes();
  const list = lists.getList(id);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !list) return [];
    const have = new Set(list.entries.map((e) => e.itemId));
    const out: { toteId: string; toteName: string; itemId: string; name: string }[] = [];
    for (const tote of totes) {
      for (const item of tote.items) {
        if (!have.has(item.id) && item.name.toLowerCase().includes(q)) out.push({ toteId: tote.id, toteName: tote.name, itemId: item.id, name: item.name });
      }
    }
    return out.slice(0, 12);
  }, [query, totes, list]);

  if (!list) return <EmptyState icon="bag-outline" title="List not found" body="It may have been deleted." />;

  // Group entries by the tote they're in now (items can be moved after they're added).
  const groups = new Map<string, ListEntry[]>();
  for (const e of list.entries) {
    const where = totes.find((x) => x.items.some((i) => i.id === e.itemId))?.id ?? e.toteId;
    groups.set(where, [...(groups.get(where) ?? []), e]);
  }
  const done = list.entries.filter((e) => e.packed).length;

  const menu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: list.name, options: ['Rename', 'Unpack all (start over)', 'Delete list', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
      (i) => {
        if (i === 0) Alert.prompt('Rename list', undefined, (text) => text && lists.renameList(list.id, text), 'plain-text', list.name);
        if (i === 1) lists.resetPacked(list.id);
        if (i === 2)
          Alert.alert(`Delete “${list.name}”?`, 'Your totes and items are not changed.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => (router.back(), lists.deleteList(list.id)) },
          ]);
      },
    );

  return (
    <>
      <Stack.Screen options={{ title: list.name, headerRight: () => <IconButton icon="ellipsis-horizontal-circle" label="List options" onPress={menu} /> }} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {list.entries.length > 0 && (
          <View style={[styles.progress, { backgroundColor: t.cardAlt }]}>
            <View style={[styles.bar, { backgroundColor: t.success, width: `${(done / list.entries.length) * 100}%` }]} />
            <Text style={[styles.progressText, { color: t.text }]}>
              {done === list.entries.length ? 'All packed!' : `${done} of ${list.entries.length} packed`}
            </Text>
          </View>
        )}

        <View style={[styles.search, { backgroundColor: t.card, borderColor: t.primary + '55' }]}>
          <Ionicons name="add-circle" size={22} color={t.primary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add from your totes (e.g. tent)"
            placeholderTextColor={t.textMuted}
            style={{ flex: 1, fontSize: 16, color: t.text }}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        {matches.length > 0 && (
          <Card style={{ padding: 0, marginTop: 8 }}>
            {matches.map((m, i) => (
              <Pressable
                key={m.itemId}
                onPress={() => {
                  tap();
                  lists.addEntry(list.id, { toteId: m.toteId, itemId: m.itemId, name: m.name });
                }}
                style={[styles.line, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ color: t.textMuted }}>in {m.toteName || 'Untitled tote'}</Text>
                </View>
                <Ionicons name="add" size={22} color={t.primary} />
              </Pressable>
            ))}
          </Card>
        )}
        {query.trim() && matches.length === 0 ? (
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 12 }}>No matching items in your totes.</Text>
        ) : null}

        {list.entries.length === 0 && !query.trim() ? (
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 21 }}>
            Search above to add items. You can also add an item from its tote screen.
          </Text>
        ) : null}

        {[...groups.entries()].map(([toteId, entries]) => {
          const tote = getTote(toteId);
          return (
            <View key={toteId}>
              <SectionTitle
                right={
                  tote ? (
                    <Pressable onPress={() => router.push(`/scan?find=${tote.id}`)} hitSlop={8} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <Ionicons name="scan" size={15} color={t.primary} />
                      <Text style={{ color: t.primary, fontWeight: '600' }}>Find</Text>
                    </Pressable>
                  ) : null
                }
              >
                {tote ? `${tote.name}${tote.location ? ' · ' + tote.location : ''}` : 'Tote deleted'}
              </SectionTitle>
              <Card style={{ padding: 0 }}>
                {entries.map((e, i) => {
                  const item = tote?.items.find((x) => x.id === e.itemId);
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        tap();
                        lists.togglePacked(list.id, e.id);
                      }}
                      onLongPress={() => lists.removeEntry(list.id, e.id)}
                      style={[styles.line, { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.border }]}
                    >
                      <Ionicons name={e.packed ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={e.packed ? t.success : t.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.entry, { color: e.packed ? t.textMuted : t.text, textDecorationLine: e.packed ? 'line-through' : 'none' }]}>
                          {item?.name ?? e.name}
                          {item && item.qty > 1 ? `  ×${item.qty}` : ''}
                        </Text>
                        {item?.out ? <Text style={{ color: '#B45309' }}>Out with {item.out.to}</Text> : null}
                      </View>
                      {tote ? <ToteBadge color={tote.color} icon={tote.icon} size={28} /> : null}
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          );
        })}
        {list.entries.length > 0 && <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 }}>Press and hold an item to take it off the list.</Text>}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  progress: { height: 40, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'center', marginBottom: 14 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.35 },
  progressText: { textAlign: 'center', fontWeight: '700', fontSize: 15 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderRadius: radius.md, borderWidth: 1.5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  entry: { fontSize: 16, fontWeight: '500' },
});
