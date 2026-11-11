import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { StoreMap } from '../components/StoreMap';
import { SaleBadge } from '../components/SaleBadge';
import { Button, Card, tap } from '../components/ui';
import { metresBetween } from '../lib/chainMatch';
import { locationLabel } from '../lib/labels';
import { Checkoff, learnFromTrip } from '../lib/learnAisles';
import { dealFor, useDeals } from '../lib/deals';
import { fetchStoreAisles, isShared, voteAisle } from '../lib/sharedAisles';
import { buildProfile } from '../lib/storeProfile';
import { ListItem, Store } from '../lib/types';
import { planRoute } from '../lib/routing/planRoute';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

const FEET_PER_CELL = 5;
// About 500 ft: big-box stores plus GPS error, but not the house down the road.
const IN_STORE_M = 150;

/** True when the phone is at the store. Needs location permission and a store picked on the map. */
async function atStore(store: Store): Promise<boolean> {
  if (store.lat == null || store.lon == null) return false;
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return false;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return metresBetween({ lat: pos.coords.latitude, lon: pos.coords.longitude }, { lat: store.lat, lon: store.lon }) <= IN_STORE_M;
  } catch {
    return false;
  }
}

/** Notes when and where an item was checked off (time first, then the slower GPS check). */
function recordCheckoff(log: Map<string, Checkoff>, item: ListItem, store: Store) {
  const at = Date.now();
  const aisle = knownAisle(item);
  atStore(store).then((inStore) => log.set(item.id, { itemId: item.id, name: item.name, at, aisle, inStore }));
}

const knownAisle = (i: ListItem) =>
  i.location.kind === 'aisle' && i.location.source !== 'guess' ? i.location.aisle : undefined;

export default function RouteScreen() {
  const t = useTheme();
  const { items, store, coldLast, setColdLast, toggleItem, clearChecked, deviceId, remembered, buildings } = useData();
  // Plan once from the items left when the screen opens, so checking items off doesn't reshuffle the walk.
  const [snapshot] = useState(() => items.filter((i) => !i.checked));
  const deals = useDeals(store, snapshot.map((i) => i.name));

  // This store's layout as shoppers have shown it: every shared item + aisle answer, plus this
  // phone's own and the aisles already on the list (lib/storeProfile.ts).
  const [sharedAnswers, setSharedAnswers] = useState<{ name: string; aisle: string }[]>([]);
  useEffect(() => {
    if (isShared(store)) fetchStoreAisles(store).then(setSharedAnswers).catch(() => {});
  }, [store]);
  const profile = useMemo(() => {
    const mine = Object.entries((store && remembered[store.id]) ?? {}).flatMap(([name, loc]) =>
      loc.kind === 'aisle' ? [{ name, aisle: loc.aisle }] : [],
    );
    const onList = snapshot.flatMap((i) =>
      i.location.kind === 'aisle' && i.location.source !== 'guess' ? [{ name: i.name, aisle: i.location.aisle }] : [],
    );
    return buildProfile([...mine, ...onList, ...sharedAnswers]);
  }, [store, remembered, snapshot, sharedAnswers]);

  // The building outline sizes the map and puts the entrance on the right side.
  const building = store ? buildings[store.id]?.info : null;
  const route = useMemo(
    () =>
      planRoute(snapshot, building?.aisleEstimate ?? store?.aisleCount ?? 20, {
        coldLast,
        profile,
        mirror: building?.entranceSide === 'left',
      }),
    [snapshot, store, coldLast, profile, building],
  );
  // Learning aisles from check-off order (rules in lib/learnAisles.ts). Only for shared stores
  // picked on the map, so we know where the store is.
  const learning = isShared(store) && store.lat != null;
  const checkoffs = useRef(new Map<string, Checkoff>());
  const latest = useRef({ items, store, deviceId });
  useEffect(() => {
    latest.current = { items, store, deviceId };
  });

  useEffect(() => {
    if (learning) Location.requestForegroundPermissionsAsync().catch(() => {});
  }, [learning]);

  // When the shopper leaves the Route screen, turn the trip into learned aisle votes.
  useEffect(() => {
    const log = checkoffs.current;
    return () => {
      const { items: now, store: s, deviceId: device } = latest.current;
      if (!isShared(s)) return;
      for (const l of learnFromTrip([...log.values()])) {
        const item = now.find((i) => i.id === l.itemId);
        // Never second-guess the shopper's own aisle or the store's own list.
        if (!item || (item.location.kind !== 'unknown' && ['user', 'store'].includes(item.location.source))) continue;
        voteAisle(s, item.name, device, { kind: 'aisle', aisle: l.aisle, source: 'community' }, 'learned').catch(() => {});
      }
    };
  }, []);

  const toggle = (item: ListItem) => {
    const nowChecked = !item.checked;
    toggleItem(item.id);
    if (!learning || !store) return;
    if (!nowChecked) {
      checkoffs.current.delete(item.id);
      return;
    }
    recordCheckoff(checkoffs.current, item, store);
  };

  const checked = new Set(items.filter((i) => i.checked).map((i) => i.id));
  const done = new Set(route.stops.flatMap((s, i) => (s.items.every((it) => checked.has(it.id)) ? [i] : [])));
  const guessed = snapshot.filter((i) => locationLabel(i).guessed).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ alignItems: 'center', padding: 12 }}>
        <StoreMap route={route} done={done} />
        <Text style={{ color: t.textMuted, marginTop: 8 }}>
          About {Math.round((route.distance * FEET_PER_CELL) / 10) * 10} ft · {route.stops.length} stop
          {route.stops.length === 1 ? '' : 's'}
        </Text>
        {building && (
          <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
            Store outline © OpenStreetMap contributors
          </Text>
        )}
      </Card>

      <View style={[styles.toggle, { backgroundColor: t.card }]}>
        <Ionicons name="snow" size={20} color={t.primary} />
        <Text style={{ flex: 1, color: t.text, fontSize: 16 }}>Frozen and dairy last</Text>
        <Switch value={coldLast} onValueChange={setColdLast} />
      </View>

      {guessed > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/aisle-scan')}
          style={[styles.hint, { backgroundColor: t.primarySoft }]}
        >
          <Ionicons name="scan" size={18} color={t.primary} />
          <Text style={{ color: t.text, flex: 1 }}>
            {guessed} item{guessed === 1 ? ' is' : 's are'} placed by department.{' '}
            <Text style={{ color: t.primary, fontWeight: '600' }}>Find aisles from screenshots</Text>
          </Text>
        </Pressable>
      )}

      {route.stops.map((stop, i) => (
        <View key={i} style={[styles.stop, { backgroundColor: t.card, opacity: done.has(i) ? 0.5 : 1 }]}>
          <View style={[styles.num, { backgroundColor: done.has(i) ? t.shelf : t.stop }]}>
            <Text style={styles.numText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>{locationLabel(stop.items[0]).place}</Text>
            {stop.items.map((it) => (
              <Pressable
                key={it.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked.has(it.id) }}
                onPress={() => {
                  tap();
                  toggle(items.find((i) => i.id === it.id) ?? it);
                }}
                style={styles.itemRow}
              >
                <Ionicons
                  name={checked.has(it.id) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={checked.has(it.id) ? t.primary : t.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 17, textDecorationLine: checked.has(it.id) ? 'line-through' : 'none' }}>
                    {it.name}
                  </Text>
                  {!checked.has(it.id) && <SaleBadge deal={dealFor(deals, it.name)} name={it.name} />}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {route.stops.length > 0 && done.size === route.stops.length && (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Ionicons name="checkmark-circle" size={40} color={t.primary} />
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>All done. Nice shopping!</Text>
          <Button
            title="Finish trip"
            icon="checkmark"
            onPress={() => {
              clearChecked();
              router.back();
            }}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  stop: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '800' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
});
