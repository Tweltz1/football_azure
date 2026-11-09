import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { QRCodeView } from '../../components/QRCodeView';
import { Button, Card, EmptyState, IconButton, SectionTitle, tap, ToteBadge } from '../../components/ui';
import { photoUri } from '../../lib/photos';
import { presetQuery, qrPayload, shortCode } from '../../lib/qr';
import { itemCount, timeAgo, useTotes } from '../../lib/store';
import { radius, useTheme } from '../../lib/theme';
import { Item } from '../../lib/types';
import { addMonths, daysUntil, daysUntilSeason, expiryLabel, money, parseDate, parseMoney, toteValue } from '../../lib/extras';
import { useLists } from '../../lib/lists';
import { ToteNative } from '../../../modules/tote-native';

export default function ToteDetail() {
  const { id, name: presetName, loc, c } = useLocalSearchParams<{ id: string; name?: string; loc?: string; c?: string }>();
  const t = useTheme();
  const store = useTotes();
  const tote = store.getTote(id);
  const lists = useLists();
  const [draft, setDraft] = useState('');

  if (!store.ready) return null;

  if (!tote) {
    return (
      <>
        <Stack.Screen options={{ title: 'New label' }} />
        <EmptyState
          icon="qr-code-outline"
          title="This label isn't set up yet"
          body={`Label ${shortCode(id)} isn't linked to a tote. Set it up now and it'll open this tote every time you scan it.`}
          action={<Button title="Set up this tote" icon="add" onPress={() => router.replace(`/tote/edit?claim=${id}${presetQuery({ name: presetName, location: loc, color: c ? `#${c}` : undefined })}`)} />}
        />
      </>
    );
  }

  const add = () => {
    if (!draft.trim()) return;
    // "3 tent stakes" or "tent stakes x3" set a quantity.
    let name = draft.trim();
    let qty = 1;
    const lead = name.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
    const trail = name.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
    if (lead) {
      qty = parseInt(lead[1], 10);
      name = lead[2];
    } else if (trail) {
      name = trail[1];
      qty = parseInt(trail[2], 10);
    }
    store.addItem(tote.id, name, Math.max(1, qty));
    setDraft('');
    tap();
  };

  const rename = (item: Item) => {
    if (Platform.OS !== 'ios') return;
    Alert.prompt('Rename item', undefined, (text) => text?.trim() && store.updateItem(tote.id, item.id, { name: text.trim() }), 'plain-text', item.name);
  };

  const remove = (item: Item) =>
    Alert.alert(`Remove “${item.name}”?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => store.removeItem(tote.id, item.id) },
    ]);

  const move = (item: Item) => {
    const others = store.totes.filter((x) => x.id !== tote.id);
    if (!others.length) return Alert.alert('No other totes', 'Create another tote to move items into it.');
    const names = others.map((x) => x.name || 'Untitled tote');
    const pick = (i: number) => {
      store.moveItem(tote.id, item.id, others[i].id);
      tap();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title: `Move “${item.name}” to…`, options: [...names, 'Cancel'], cancelButtonIndex: names.length }, (i) => {
        if (i < names.length) pick(i);
      });
    } else {
      Alert.alert(`Move “${item.name}” to…`, undefined, [...names.slice(0, 2).map((n, i) => ({ text: n, onPress: () => pick(i) })), { text: 'Cancel', style: 'cancel' }]);
    }
  };

  const sheet = (title: string, choices: { label: string; run: () => void; destructive?: boolean }[], message?: string) => {
    const options = [...choices.map((c) => c.label), 'Cancel'];
    const destructive = choices.findIndex((c) => c.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options, cancelButtonIndex: choices.length, destructiveButtonIndex: destructive >= 0 ? destructive : undefined },
      (i) => choices[i]?.run(),
    );
  };

  const lend = (item: Item) =>
    Alert.prompt(
      `Who has “${item.name}”?`,
      'Or where it went, like “Mike” or “the cabin”. It stays listed here, marked as out.',
      (text) => {
        if (!text?.trim()) return;
        store.updateItem(tote.id, item.id, { out: { to: text.trim(), at: Date.now() } });
        tap();
      },
      'plain-text',
    );

  const typeExpiry = (item: Item) =>
    Alert.prompt('Expiration date', 'For example 3/2027, 3/15/2027 or March 2027.', (text) => {
      if (!text?.trim()) return;
      const d = parseDate(text);
      if (!d) return Alert.alert("Couldn't read that date", 'Try something like 3/15/2027 or March 2027.');
      store.updateItem(tote.id, item.id, { expires: d });
    }, 'plain-text', item.expires ?? '');

  const expiry = (item: Item) =>
    sheet(
      'Expiration date',
      [
        ...[1, 3, 6, 12, 24].map((m) => ({
          label: m < 12 ? `In ${m} month${m > 1 ? 's' : ''}` : `In ${m / 12} year${m > 12 ? 's' : ''}`,
          run: () => store.updateItem(tote.id, item.id, { expires: addMonths(m) }),
        })),
        { label: 'Type a date…', run: () => typeExpiry(item) },
        ...(item.expires ? [{ label: 'Clear date', destructive: true, run: () => store.updateItem(tote.id, item.id, { expires: undefined }) }] : []),
      ],
      item.expires ? expiryLabel(item.expires) : 'You’ll see it on the Reminders screen a month before.',
    );

  const setValue = (item: Item) =>
    Alert.prompt(
      'Value of one',
      'Used for the home inventory report (handy for insurance or a move).',
      (text) => {
        if (text === undefined) return;
        if (!text.trim()) return store.updateItem(tote.id, item.id, { value: undefined });
        const v = parseMoney(text);
        if (v === null) return Alert.alert("Couldn't read that amount");
        store.updateItem(tote.id, item.id, { value: v || undefined });
      },
      'plain-text',
      item.value ? String(item.value) : '',
      'decimal-pad',
    );

  const addToList = (item: Item) => {
    const entry = { toteId: tote.id, itemId: item.id, name: item.name };
    const make = () =>
      Alert.prompt('New packing list', 'Like “Camping trip” or “Beach weekend”.', (text) => {
        if (!text?.trim()) return;
        const l = lists.createList(text);
        lists.addEntry(l.id, entry);
        tap();
      });
    if (!lists.lists.length) return make();
    sheet(`Add “${item.name}” to…`, [
      ...lists.lists.map((l) => ({ label: l.name, run: () => (lists.addEntry(l.id, entry), tap()) })),
      { label: 'New list…', run: make },
    ]);
  };

  const itemMenu = (item: Item) => {
    if (Platform.OS === 'ios') {
      sheet(item.name, [
        item.out
          ? { label: 'Mark as back in the tote', run: () => (store.updateItem(tote.id, item.id, { out: undefined }), tap()) }
          : { label: 'Lend out / take out…', run: () => lend(item) },
        { label: item.expires ? 'Change expiration date' : 'Add expiration date', run: () => expiry(item) },
        { label: item.value ? `Change value (${money(item.value)})` : 'Add value', run: () => setValue(item) },
        { label: 'Add to packing list', run: () => addToList(item) },
        { label: 'Rename', run: () => rename(item) },
        { label: 'Move to another tote', run: () => move(item) },
        { label: 'Remove', destructive: true, run: () => remove(item) },
      ], item.out ? `Out with ${item.out.to} since ${new Date(item.out.at).toLocaleDateString()}` : undefined);
    } else {
      Alert.alert(item.name, undefined, [
        { text: 'Move', onPress: () => move(item) },
        { text: 'Remove', style: 'destructive', onPress: () => remove(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const deleteTote = () =>
    Alert.alert('Delete this tote?', 'Its item list will be deleted. The printed label can be reused for a new tote.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          store.deleteTote(tote.id);
        },
      },
    ]);

  const photo = photoUri(tote.photo);

  return (
    <>
      <Stack.Screen
        options={{
          title: tote.name || 'Tote',
          headerRight: () => <IconButton icon="create-outline" label="Edit tote" onPress={() => router.push(`/tote/edit?id=${tote.id}`)} />,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          {photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={150} /> : <View style={[styles.hero, { backgroundColor: tote.color }]} />}
          <View style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <ToteBadge color={tote.color} icon={tote.icon} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>{tote.name || 'Untitled tote'}</Text>
              {tote.location ? (
                <View style={styles.meta}>
                  <Ionicons name="location" size={14} color={t.textMuted} />
                  <Text style={[styles.metaText, { color: t.textMuted }]}>{tote.location}</Text>
                </View>
              ) : null}
              <Text style={[styles.metaText, { color: t.textMuted, marginTop: 2 }]}>
                {itemCount(tote)} items{toteValue(tote) ? ` · ${money(toteValue(tote))}` : ''} · updated {timeAgo(tote.updatedAt)}
              </Text>
              {tote.season ? (
                <View style={styles.meta}>
                  <Ionicons name="calendar-outline" size={14} color={t.primary} />
                  <Text style={[styles.metaText, { color: t.primary, fontWeight: '600' }]}>
                    {tote.season}
                    {(() => {
                      const d = daysUntilSeason(tote.season);
                      return d === undefined ? '' : d === 0 ? ' · starts today' : ` · in ${d} day${d === 1 ? '' : 's'}`;
                    })()}
                  </Text>
                </View>
              ) : null}
              {tote.moveTo ? (
                <View style={styles.meta}>
                  <Ionicons name="arrow-forward-circle-outline" size={14} color={t.textMuted} />
                  <Text style={[styles.metaText, { color: t.textMuted }]}>
                    Moving to {tote.moveTo}
                    {tote.unloadedAt ? ' · unloaded' : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {tote.notes ? <Text style={[styles.notes, { color: t.text, borderColor: t.border }]}>{tote.notes}</Text> : null}
        </Card>

        <SectionTitle
          right={
            ToteNative ? (
              <Pressable onPress={() => router.push(`/tote/snap?id=${tote.id}`)} hitSlop={8} style={styles.snap}>
                <Ionicons name="camera" size={16} color={t.primary} />
                <Text style={{ color: t.primary, fontWeight: '700', fontSize: 14 }}>Snap to add</Text>
              </Pressable>
            ) : null
          }
        >
          What’s inside
        </SectionTitle>
        <View style={[styles.addRow, { backgroundColor: t.card, borderColor: t.primary + '55' }]}>
          <Ionicons name="add-circle" size={24} color={t.primary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add an item (e.g. 3 beach towels)"
            placeholderTextColor={t.textMuted}
            style={[styles.addInput, { color: t.text }]}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={add}
          />
          {draft.trim() ? (
            <Pressable onPress={add} style={[styles.addBtn, { backgroundColor: t.primary }]}>
              <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Add</Text>
            </Pressable>
          ) : ToteNative ? (
            <Pressable
              accessibilityLabel="Snap a photo to add items"
              onPress={() => router.push(`/tote/snap?id=${tote.id}`)}
              style={[styles.addBtn, { backgroundColor: t.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            >
              <Ionicons name="camera" size={18} color={t.onPrimary} />
              <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Snap</Text>
            </Pressable>
          ) : null}
        </View>

        {tote.items.length === 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.emptyItems, { color: t.textMuted }]}>
              {ToteNative
                ? 'No items yet. Type above, or tap Snap to take a photo of the open tote and pick from what your iPhone sees.'
                : 'No items yet. Type above and hit return to add things quickly.'}
            </Text>
            {ToteNative ? (
              <Button title="Snap a photo of what's inside" icon="camera" variant="secondary" onPress={() => router.push(`/tote/snap?id=${tote.id}`)} style={{ marginTop: 14, alignSelf: 'stretch' }} />
            ) : null}
          </View>
        ) : (
          <Card style={{ padding: 0, marginTop: 12 }}>
            {tote.items.map((item, idx) => (
              <Pressable
                key={item.id}
                onPress={() => itemMenu(item)}
                style={({ pressed }) => [
                  styles.item,
                  { borderTopColor: t.border, borderTopWidth: idx ? StyleSheet.hairlineWidth : 0, backgroundColor: pressed ? t.cardAlt : 'transparent' },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.itemName, { color: item.out ? t.textMuted : t.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.out || item.expires || item.value ? (
                    <View style={styles.tags}>
                      {item.out ? <Tag icon="arrow-redo-outline" text={`Out: ${item.out.to}`} color="#B45309" /> : null}
                      {item.expires ? (
                        <Tag
                          icon="hourglass-outline"
                          text={expiryLabel(item.expires)}
                          color={daysUntil(item.expires) < 0 ? t.danger : daysUntil(item.expires) <= 30 ? '#B45309' : t.textMuted}
                        />
                      ) : null}
                      {item.value ? <Tag icon="pricetag-outline" text={money(item.value)} color={t.textMuted} /> : null}
                    </View>
                  ) : null}
                </View>
                <View style={[styles.stepper, { backgroundColor: t.cardAlt }]}>
                  <Pressable
                    hitSlop={6}
                    accessibilityLabel={`Decrease ${item.name}`}
                    onPress={() => {
                      tap();
                      if (item.qty <= 1) remove(item);
                      else store.updateItem(tote.id, item.id, { qty: item.qty - 1 });
                    }}
                    style={styles.stepBtn}
                  >
                    <Ionicons name={item.qty <= 1 ? 'trash-outline' : 'remove'} size={18} color={item.qty <= 1 ? t.danger : t.text} />
                  </Pressable>
                  <Text style={[styles.qty, { color: t.text }]}>{item.qty}</Text>
                  <Pressable
                    hitSlop={6}
                    accessibilityLabel={`Increase ${item.name}`}
                    onPress={() => {
                      tap();
                      store.updateItem(tote.id, item.id, { qty: item.qty + 1 });
                    }}
                    style={styles.stepBtn}
                  >
                    <Ionicons name="add" size={18} color={t.text} />
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        <SectionTitle>QR label</SectionTitle>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={styles.qrWrap}>
            <QRCodeView value={qrPayload(tote.id)} size={112} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={[styles.code, { color: t.textMuted }]}>{shortCode(tote.id)}</Text>
            <Button title="Print label" icon="print-outline" onPress={() => router.push(`/print?ids=${tote.id}`)} style={{ height: 44 }} />
            {ToteNative?.nfcAvailable() ? (
              <Button
                title="Write NFC sticker"
                icon="radio-outline"
                variant="secondary"
                onPress={async () => {
                  try {
                    const ok = await ToteNative!.writeNfc(qrPayload(tote.id));
                    if (ok) tap();
                  } catch (e) {
                    Alert.alert("Couldn't write the sticker", e instanceof Error ? e.message : String(e));
                  }
                }}
                style={{ height: 44 }}
              />
            ) : null}
          </View>
        </Card>

        <Button title="Delete tote" icon="trash-outline" variant="danger" onPress={deleteTote} style={{ marginTop: 32 }} />
      </ScrollView>
    </>
  );
}

function Tag({ icon, text, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '1A' }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  snap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  hero: { height: 10 },
  photo: { width: '100%', height: 200 },
  title: { fontSize: 24, fontWeight: '800' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 14 },
  notes: { fontSize: 15, lineHeight: 21, padding: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, height: 54, borderRadius: radius.md, borderWidth: 1.5 },
  addInput: { flex: 1, fontSize: 16, height: '100%' },
  addBtn: { paddingHorizontal: 16, height: 40, borderRadius: 10, justifyContent: 'center' },
  emptyItems: { fontSize: 15, textAlign: 'center', marginTop: 20, paddingHorizontal: 24, lineHeight: 21 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 12, minHeight: 56 },
  itemName: { fontSize: 16, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  qrWrap: { padding: 6, backgroundColor: '#fff', borderRadius: 12 },
  code: { fontSize: 15, fontWeight: '700', letterSpacing: 1.5, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
