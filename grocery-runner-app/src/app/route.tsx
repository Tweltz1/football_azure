import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { StoreMap } from '../components/StoreMap';
import { Card, tap } from '../components/ui';
import { locationLabel } from '../lib/labels';
import { planRoute } from '../lib/routing/planRoute';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

const FEET_PER_CELL = 5;

export default function RouteScreen() {
  const t = useTheme();
  const { items, store, coldLast, setColdLast, toggleItem } = useData();
  // Plan once from the items left when the screen opens, so checking items off doesn't reshuffle the walk.
  const [snapshot] = useState(() => items.filter((i) => !i.checked));
  const route = useMemo(() => planRoute(snapshot, store?.aisleCount ?? 20, { coldLast }), [snapshot, store, coldLast]);

  const checked = new Set(items.filter((i) => i.checked).map((i) => i.id));
  const done = new Set(route.stops.flatMap((s, i) => (s.items.every((it) => checked.has(it.id)) ? [i] : [])));
  const guessed = snapshot.filter((i) => locationLabel(i).guessed).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ alignItems: 'center', padding: 12 }}>
        <StoreMap route={route} done={done} />
        <Text style={{ color: t.textMuted, marginTop: 8 }}>
          About {Math.round((route.distance * FEET_PER_CELL) / 10) * 10} ft · {route.stops.length} stops
          {store?.chain === 'kroger' ? '' : ' · store layout is approximate'}
        </Text>
      </Card>

      <View style={[styles.toggle, { backgroundColor: t.card }]}>
        <Ionicons name="snow" size={20} color={t.primary} />
        <Text style={{ flex: 1, color: t.text, fontSize: 16 }}>Frozen and dairy last</Text>
        <Switch value={coldLast} onValueChange={setColdLast} />
      </View>

      {guessed > 0 && (
        <Text style={{ color: t.warn }}>
          {guessed} item{guessed === 1 ? '' : 's'} placed by department guess. Tap an item on your list to set its aisle.
        </Text>
      )}

      {route.stops.map((stop, i) => (
        <View key={i} style={[styles.stop, { backgroundColor: t.card, opacity: done.has(i) ? 0.5 : 1 }]}>
          <View style={[styles.num, { backgroundColor: done.has(i) ? t.shelf : t.stop }]}>
            <Text style={styles.numText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>{locationLabel(stop.items[0]).text}</Text>
            {stop.items.map((it) => (
              <Pressable
                key={it.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked.has(it.id) }}
                onPress={() => {
                  tap();
                  toggleItem(it.id);
                }}
                style={styles.itemRow}
              >
                <Ionicons
                  name={checked.has(it.id) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={checked.has(it.id) ? t.primary : t.textMuted}
                />
                <Text style={{ color: t.text, fontSize: 17, textDecorationLine: checked.has(it.id) ? 'line-through' : 'none' }}>
                  {it.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  stop: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '800' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
