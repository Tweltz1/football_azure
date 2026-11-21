import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { StoreMap } from '../components/StoreMap';
import { SaleBadge } from '../components/SaleBadge';
import { StockBadge } from '../components/StockBadge';
import { Button, Card, Chip, tap } from '../components/ui';
import { aisleChoices, needsAisle } from '../lib/aisleChoices';
import { metresBetween } from '../lib/chainMatch';
import { locationLabel } from '../lib/labels';
import { Checkoff, learnFromTrip } from '../lib/learnAisles';
import { dealFor, useDeals } from '../lib/deals';
import { stockFor, useStock } from '../lib/stock';
import { fetchStoreAisles, isShared, voteAisle } from '../lib/sharedAisles';
import { maybeAskForReview } from '../lib/review';
import { buildProfile } from '../lib/storeProfile';
import { ListItem, Store } from '../lib/types';
import { parseAisleNumber } from '../lib/routing/layout';
import { planFor } from '../lib/routing/plan';
import { planRoute } from '../lib/routing/planRoute';
import { useData } from '../lib/store';
import { radius, useTheme } from '../lib/theme';
import { capFirst } from '../lib/caps';

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
  const { items, store, coldLast, setColdLast, toggleItem, clearChecked, deviceId, remembered, buildings, setLocation } = useData();
  // Plan once from the items left when the screen opens, so checking items off doesn't reshuffle the walk.
  const [snapshot] = useState(() => items.filter((i) => !i.checked));
  const deals = useDeals(store, snapshot.map((i) => i.name));
  const stock = useStock(store, snapshot.map((i) => i.name));

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
  // The store's own floor plan (Woodman's Altoona, Walmart Chippewa Falls, Target Eau Claire). Other stores get no map.
  const plan = useMemo(() => planFor(store), [store]);
  // Generic plan: the highest numbered aisle shoppers have seen here beats a guess from the building's size.
  const knownAisles = useMemo(() => {
    const nums = sharedAnswers.flatMap((a) => (/^\d{1,2}$/.test(a.aisle.trim()) ? [parseAisleNumber(a.aisle) ?? 0] : []));
    return nums.length >= 5 ? Math.max(...nums) : null;
  }, [sharedAnswers]);
  const route = useMemo(
    () =>
      planRoute(snapshot, knownAisles ?? Math.min(40, building?.aisleEstimate ?? store?.aisleCount ?? 20), {
        coldLast,
        profile,
        mirror: building?.entranceSide === 'left',
        plan,
      }),
    [snapshot, store, coldLast, profile, building, plan, knownAisles],
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

  // "Which aisle?" under a just-checked item whose place was only a guess. One tap is a typed answer:
  // it is remembered on this phone and shared with other shoppers at this store (setLocation).
  const [ask, setAsk] = useState<{ itemId: string; choices: string[] } | null>(null);
  const answer = (itemId: string, aisle: string) => {
    setLocation(itemId, { kind: 'aisle', aisle, source: 'user' });
    setAsk(null);
  };

  // Items this store's aisles are known for: shared answers plus this phone's own.
  const knownHere = useMemo(() => {
    const names = new Set(sharedAnswers.map((a) => a.name.toLowerCase()));
    for (const [name, loc] of Object.entries((store && remembered[store.id]) ?? {})) if (loc.kind === 'aisle') names.add(name.toLowerCase());
    return names.size;
  }, [sharedAnswers, remembered, store]);

  const toggle = (item: ListItem, stopIndex: number) => {
    const nowChecked = !item.checked;
    toggleItem(item.id);
    if (store && nowChecked && needsAisle(item)) setAsk({ itemId: item.id, choices: aisleChoices(route.stops, stopIndex) });
    else if (!nowChecked && ask?.itemId === item.id) setAsk(null);
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
  const mapped = route.stops.filter((s) => !s.offMap);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ alignItems: 'center', padding: 12 }}>
        {plan ? (
          <StoreMap route={route} done={done} />
        ) : (
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
            <Ionicons name="map-outline" size={32} color={t.textMuted} />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>No floor plan for this store yet</Text>
            <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' }}>
              Your stops are in the order most grocery stores are laid out.
            </Text>
          </View>
        )}
        <Text style={{ color: t.textMuted, marginTop: 8 }}>
          {plan ? `About ${Math.round((route.distance * FEET_PER_CELL) / 10) * 10} ft · ` : ''}
          {mapped.length} stop{mapped.length === 1 ? '' : 's'}
        </Text>
        {store && (
          <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
            {knownHere > 0
              ? `Shop Stride knows the aisle for ${knownHere} item${knownHere === 1 ? '' : 's'} here. Each trip teaches it more.`
              : 'Shop Stride is still learning this store. Each trip teaches it more.'}
          </Text>
        )}
        {plan && (
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            {plan.name} floor plan, from the store&apos;s own map
          </Text>
        )}
      </Card>

      <View style={[styles.toggle, { backgroundColor: t.card }]}>
        <Ionicons name="snow" size={20} color={t.primary} />
        <Text style={{ flex: 1, color: t.text, fontSize: 16 }}>Cold and fresh food last</Text>
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
            {stop.offMap ? <Ionicons name="help" size={18} color="#fff" /> : <Text style={styles.numText}>{i + 1}</Text>}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              {stop.offMap ? "Not on this store's map. Ask an employee or check the aisle signs." : locationLabel(stop.items[0]).place}
            </Text>
            {stop.items.map((it) => (
              <View key={it.id} style={{ gap: 6 }}>
                <Pressable
                  key={it.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: checked.has(it.id) }}
                  onPress={() => {
                    tap();
                    toggle(items.find((i) => i.id === it.id) ?? it, i);
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
                      {capFirst(it.name)}
                    </Text>
                    {!checked.has(it.id) && <SaleBadge deal={dealFor(deals, it.name)} name={it.name} />}
                    {!checked.has(it.id) && <StockBadge check={stockFor(stock, it.name)} />}
                  </View>
                </Pressable>
                {ask?.itemId === it.id && (
                  <View style={[styles.ask, { backgroundColor: t.primarySoft }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: t.text, flex: 1, fontWeight: '600' }}>Which aisle was it in?</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Skip" hitSlop={10} onPress={() => setAsk(null)}>
                        <Ionicons name="close" size={20} color={t.textMuted} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {ask.choices.map((a) => (
                        <Chip key={a} label={`Aisle ${a}`} onPress={() => answer(it.id, a)} />
                      ))}
                      <Chip
                        label={ask.choices.length ? 'Other' : 'Enter aisle'}
                        onPress={() => {
                          setAsk(null);
                          router.push({ pathname: '/item/[id]', params: { id: it.id } });
                        }}
                      />
                    </View>
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>Helps you and other shoppers at this store.</Text>
                  </View>
                )}
              </View>
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
              setTimeout(maybeAskForReview, 1200);
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
  ask: { gap: 8, padding: 10, borderRadius: radius.md, marginLeft: 34 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
});
