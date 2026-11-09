import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backendConfigured } from './api';
import { locationFromKroger, searchKrogerProducts } from './kroger';
import { fetchSharedAisles, isShared, itemKey, voteAisle } from './sharedAisles';
import { ItemLocation, ListItem, Store } from './types';

const STORAGE_KEY = 'grocery-runner:v1';

type Data = {
  items: ListItem[];
  store: Store | null;
  coldLast: boolean;
  /** Aisles this shopper set, per store, keyed by itemKey(name). Always wins over other sources. */
  remembered: Record<string, Record<string, ItemLocation>>;
  /** Random id for this install, so each phone gets one vote per item per store. */
  deviceId: string;
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const fresh = (): Data => ({ items: [], store: null, coldLast: true, remembered: {}, deviceId: newId() });

type Ctx = Data & {
  ready: boolean;
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  /** The shopper's own answer: remembered here and, for real stores, shared with other shoppers. */
  setLocation: (id: string, location: ItemLocation) => void;
  clearChecked: () => void;
  setStore: (store: Store) => void;
  setColdLast: (on: boolean) => void;
};

const StoreContext = createContext<Ctx | null>(null);

/**
 * Finds locations for items that have none, best source first:
 * Kroger's own aisle data (Kroger stores), then the shared shopper answers for this store.
 * Items keep a department guess if neither knows. Network errors are ignored (offline is fine).
 */
async function lookUp(store: Store, items: ListItem[]): Promise<Record<string, ItemLocation>> {
  const found: Record<string, ItemLocation> = {};
  if (!backendConfigured || !items.length) return found;

  if (store.chain === 'kroger') {
    const locationId = store.id.replace('kroger:', '');
    await Promise.all(
      items.map(async (item) => {
        try {
          const results = await searchKrogerProducts(item.name, locationId);
          const best = results.find((p) => p.aisleLocations.length) ?? results[0];
          if (best) {
            const loc = locationFromKroger(best);
            if (loc.kind !== 'unknown') found[item.id] = loc;
          }
        } catch {}
      }),
    );
  }

  const rest = items.filter((i) => !found[i.id]);
  if (isShared(store) && rest.length) {
    try {
      const shared = await fetchSharedAisles(store, rest.map((i) => i.name));
      for (const item of rest) {
        const loc = shared[itemKey(item.name)];
        if (loc) found[item.id] = loc;
      }
    } catch {}
  }
  return found;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(fresh);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setData((d) => ({ ...d, ...JSON.parse(raw) })))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, ready]);

  /** Looks up the given items and fills in any that are still unknown at the same store. */
  const resolve = useCallback(async (store: Store, items: ListItem[]) => {
    const found = await lookUp(store, items);
    if (!Object.keys(found).length) return;
    setData((d) =>
      d.store?.id !== store.id
        ? d // the shopper switched stores meanwhile
        : {
            ...d,
            items: d.items.map((i) => (found[i.id] && i.location.kind === 'unknown' ? { ...i, location: found[i.id] } : i)),
          },
    );
  }, []);

  const addItem = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const store = data.store;
      const mine = store ? data.remembered[store.id]?.[itemKey(trimmed)] : undefined;
      const item: ListItem = { id: newId(), name: trimmed, checked: false, location: mine ?? { kind: 'unknown' } };
      setData((d) => ({ ...d, items: [...d.items, item] }));
      if (store && !mine) resolve(store, [item]);
    },
    [data.store, data.remembered, resolve],
  );

  const setLocation = useCallback(
    (id: string, location: ItemLocation) => {
      const item = data.items.find((i) => i.id === id);
      const store = data.store;
      if (item && isShared(store)) voteAisle(store, item.name, data.deviceId, location).catch(() => {});
      setData((d) => {
        const remembered =
          item && d.store
            ? { ...d.remembered, [d.store.id]: { ...d.remembered[d.store.id], [itemKey(item.name)]: location } }
            : d.remembered;
        return { ...d, remembered, items: d.items.map((i) => (i.id === id ? { ...i, location } : i)) };
      });
    },
    [data.items, data.store, data.deviceId],
  );

  const setStore = useCallback(
    (store: Store) => {
      // Locations belong to a store: start from what this shopper set there, then look up the rest.
      const items = data.items.map((i) => ({
        ...i,
        location: data.remembered[store.id]?.[itemKey(i.name)] ?? ({ kind: 'unknown' } as ItemLocation),
      }));
      setData((d) => ({ ...d, store, items }));
      resolve(store, items.filter((i) => i.location.kind === 'unknown'));
    },
    [data.items, data.remembered, resolve],
  );

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      ready,
      addItem,
      setLocation,
      setStore,
      removeItem: (id) => setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })),
      toggleItem: (id) =>
        setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) })),
      clearChecked: () => setData((d) => ({ ...d, items: d.items.filter((i) => !i.checked) })),
      setColdLast: (coldLast) => setData((d) => ({ ...d, coldLast })),
    }),
    [data, ready, addItem, setLocation, setStore],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
