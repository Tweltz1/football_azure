import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Field } from '../components/Field';
import { Button, Card, Chip, Segmented } from '../components/ui';
import { shortDate } from '../lib/deals';
import { managerCall, StoreData } from '../lib/storePortal';
import { radius, useTheme } from '../lib/theme';

type Tab = 'items' | 'sales' | 'outs' | 'news';
const DEPTS = ['Produce', 'Bakery', 'Deli', 'Meat', 'Dairy', 'Frozen', 'Pantry', 'Household', 'Health', 'Baby', 'Pet'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A manager's editor for one store: aisles, sales, out of stock, store news. Shoppers see changes right away. */
export default function ManageStoreScreen() {
  const t = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [data, setData] = useState<StoreData | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  // Quick-add boxes
  const [cat, setCat] = useState('');
  const [aisle, setAisle] = useState('');
  const [dept, setDept] = useState('');
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [ends, setEnds] = useState('');
  const [outItem, setOutItem] = useState('');
  const [back, setBack] = useState('');
  const [notice, setNotice] = useState('');

  const call = useCallback((body: Record<string, unknown>) => managerCall<StoreData>({ ...body, store_id: id }), [id]);
  const load = useCallback(
    () =>
      call({ action: 'store' })
        .then((d) => {
          setData(d);
          setNotice(d.store.notice ?? '');
        })
        .catch((e) => Alert.alert('Your store', (e as Error).message)),
    [call],
  );
  useEffect(() => {
    load();
  }, [load]);

  const run = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await call(body);
      after?.();
      await load();
    } catch (e) {
      Alert.alert('Not saved', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = (data?.layout ?? []).filter((r) => !filter || r.category.toLowerCase().includes(filter.toLowerCase()));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: data?.store.name ?? name ?? 'Your store' }} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'items', label: 'Aisles' },
          { value: 'sales', label: 'Sales' },
          { value: 'outs', label: 'Out' },
          { value: 'news', label: 'News' },
        ]}
      />
      <View style={{ height: 14 }} />

      {tab === 'items' && (
        <>
          <Card>
            <Text style={[styles.h, { color: t.text }]}>Where is it?</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>An item (&quot;Pop-Tarts&quot;) or a category (&quot;cereal&quot;). The most specific match wins.</Text>
            <Field label="Item or category" value={cat} onChangeText={setCat} placeholder="Frozen pizza" />
            <Field label="Aisle" value={aisle} onChangeText={(v) => { setAisle(v); if (v) setDept(''); }} placeholder="12" autoCapitalize="characters" />
            <Text style={[styles.label, { color: t.text }]}>or department</Text>
            <View style={styles.chips}>
              {DEPTS.map((d) => (
                <Chip key={d} label={d} selected={dept === d} onPress={() => { setDept(dept === d ? '' : d); setAisle(''); }} />
              ))}
            </View>
            <Button
              title="Save"
              loading={busy}
              disabled={!cat.trim() || (!aisle.trim() && !dept)}
              onPress={() => run({ action: 'layout-set', category: cat, aisle, department: dept }, () => { setCat(''); setAisle(''); setDept(''); })}
            />
          </Card>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder={`Search ${data?.layout.length ?? 0} saved lines`}
            placeholderTextColor={t.textMuted}
            style={[styles.search, { color: t.text, backgroundColor: t.card, borderColor: t.border }]}
          />
          {rows.slice(0, 300).map((r) => (
            <Line
              key={r.category}
              title={r.category}
              sub={r.aisle ? `Aisle ${r.aisle}` : cap(r.department ?? '')}
              onEdit={() => { setCat(r.category); setAisle(r.aisle ?? ''); setDept(r.department ? cap(r.department) : ''); }}
              onRemove={() => run({ action: 'layout-remove', category: r.category })}
            />
          ))}
        </>
      )}

      {tab === 'sales' && (
        <>
          <Card>
            <Text style={[styles.h, { color: t.text }]}>Add a sale</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>Shoppers with it on their list see &quot;On sale&quot;, and everyone can browse your sales. With no end date it runs 7 days.</Text>
            <Field label="Item" value={item} onChangeText={setItem} placeholder="Cheerios 12 oz" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Price" value={price} onChangeText={setPrice} placeholder="$2.99" />
              <Field label="Ends" value={ends} onChangeText={setEnds} placeholder="11/30" keyboardType="numbers-and-punctuation" />
            </View>
            <Button title="Add sale" loading={busy} disabled={!item.trim()} onPress={() => run({ action: 'deal-add', item, price, ends }, () => { setItem(''); setPrice(''); })} />
          </Card>
          {data?.deals.map((d) => (
            <Line
              key={d.id}
              title={d.item}
              sub={[d.price, d.ends_on ? `ends ${shortDate(d.ends_on)}` : null].filter(Boolean).join(' · ')}
              onRemove={() => run({ action: 'deal-remove', id: d.id })}
            />
          ))}
          {data && !data.deals.length && <Text style={{ color: t.textMuted, marginTop: 12 }}>No sales right now.</Text>}
        </>
      )}

      {tab === 'outs' && (
        <>
          <Card>
            <Text style={[styles.h, { color: t.text }]}>Mark out of stock</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>Shoppers with it on their list see &quot;Out of stock here&quot;. With no date it shows for 7 days.</Text>
            <Field label="Item" value={outItem} onChangeText={setOutItem} placeholder="Eggs" />
            <Field label="Back by (optional)" value={back} onChangeText={setBack} placeholder="11/30" keyboardType="numbers-and-punctuation" />
            <Button title="Mark out" loading={busy} disabled={!outItem.trim()} onPress={() => run({ action: 'out-set', item: outItem, until: back }, () => { setOutItem(''); setBack(''); })} />
          </Card>
          {data?.outs.map((o) => (
            <Line
              key={o.id}
              title={o.item}
              sub={o.until ? `back by ${shortDate(o.until)}` : 'back date not set'}
              removeLabel="Back in stock"
              onRemove={() => run({ action: 'out-remove', id: o.id })}
            />
          ))}
          {data && !data.outs.length && <Text style={{ color: t.textMuted, marginTop: 12 }}>Nothing is marked out of stock.</Text>}
        </>
      )}

      {tab === 'news' && (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>Store news</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>Shoppers see this when they pick your store, like holiday hours. Up to 3 lines.</Text>
          <TextInput
            value={notice}
            onChangeText={setNotice}
            multiline
            maxLength={280}
            placeholder="Open 7 AM to 3 PM on Thanksgiving."
            placeholderTextColor={t.textMuted}
            style={[styles.notice, { color: t.text, backgroundColor: t.cardAlt, borderColor: t.border }]}
          />
          <Text style={{ color: t.textMuted, fontSize: 12, alignSelf: 'flex-end', marginBottom: 8 }}>{notice.length}/280</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Save" loading={busy} onPress={() => run({ action: 'notice', text: notice })} style={{ flex: 1 }} />
            <Button title="Clear" variant="secondary" onPress={() => run({ action: 'notice', text: '' })} style={{ flex: 1 }} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function Line({ title, sub, onEdit, onRemove, removeLabel = 'Remove' }: { title: string; sub?: string; onEdit?: () => void; onRemove: () => void; removeLabel?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.line, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        {!!sub && <Text style={{ color: t.textMuted, fontSize: 13 }}>{sub}</Text>}
      </View>
      {onEdit && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}`} hitSlop={8} onPress={onEdit} style={{ padding: 6 }}>
          <Ionicons name="create-outline" size={20} color={t.primary} />
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${removeLabel}: ${title}`}
        hitSlop={8}
        onPress={() => Alert.alert(removeLabel, title, [{ text: 'Cancel', style: 'cancel' }, { text: removeLabel, style: 'destructive', onPress: onRemove }])}
        style={{ padding: 6 }}
      >
        <Ionicons name={removeLabel === 'Remove' ? 'trash-outline' : 'checkmark-circle-outline'} size={20} color={removeLabel === 'Remove' ? t.danger : t.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  hint: { fontSize: 13, marginBottom: 10 },
  label: { fontWeight: '600', fontSize: 14, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  search: { borderWidth: 1, borderRadius: radius.sm, padding: 10, fontSize: 15, marginVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1, marginTop: 8 },
  notice: { borderWidth: 1, borderRadius: radius.sm, padding: 10, fontSize: 16, minHeight: 90, textAlignVertical: 'top' },
});
