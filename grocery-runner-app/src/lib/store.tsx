import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { krogerConfigured, locationFromKroger, searchKrogerProducts } from './kroger';
import { ItemLocation, ListItem, Store } from './types';

const STORAGE_KEY = 'grocery-runner:v1';

type Data = {
  items: ListItem[];
  store: Store | null;
  coldLast: boolean;
  /** Aisles the shopper typed in, per store, keyed by lower-case item name. Reused next trip. */
  remembered: Record<string, Record<string, ItemLocation>>;
};

const EMPTY: Data = { items: [], store: null, coldLast: true, remembered: {} };

type Ctx = Data & {
  ready: boolean;
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  setLocation: (id: string, location: ItemLocation) => void;
  clearChecked: () => void;
  setStore: (store: Store) => void;
  setColdLast: (on: boolean) => void;
  /** Looks up items that have no location yet (Kroger stores only). */
  refreshLocations: () => Promise<void>;
};

const StoreContext = createContext<Ctx | null>(null);

const key = (name: string) => name.trim().toLowerCase();
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setData({ ...EMPTY, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, ready]);

  const lookUp = useCallback(async (store: Store | null, item: ListItem) => {
    if (!store || store.chain !== 'kroger' || !krogerConfigured) return;
    try {
      const results = await searchKrogerProducts(item.name, store.id.replace('kroger:', ''));
      const withAisle = results.find((p) => p.aisleLocations.length) ?? results[0];
      if (!withAisle) return;
      const location = locationFromKroger(withAisle);
      setData((d) => ({
        ...d,
        items: d.items.map((i) => (i.id === item.id && i.location.kind === 'unknown' ? { ...i, location } : i)),
      }));
    } catch {
      // Offline or Kroger down: the item keeps its guessed department.
    }
  }, []);

  const addItem = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const remembered = data.store ? data.remembered[data.store.id]?.[key(trimmed)] : undefined;
      const item: ListItem = { id: newId(), name: trimmed, checked: false, location: remembered ?? { kind: 'unknown' } };
      setData((d) => ({ ...d, items: [...d.items, item] }));
      if (!remembered) lookUp(data.store, item);
    },
    [data.store, data.remembered, lookUp],
  );

  const setLocation = useCallback((id: string, location: ItemLocation) => {
    setData((d) => {
      const item = d.items.find((i) => i.id === id);
      const remembered =
        item && d.store && location.kind !== 'unknown' && location.source === 'user'
          ? { ...d.remembered, [d.store.id]: { ...d.remembered[d.store.id], [key(item.name)]: location } }
          : d.remembered;
      return { ...d, remembered, items: d.items.map((i) => (i.id === id ? { ...i, location } : i)) };
    });
  }, []);

  const setStore = useCallback((store: Store) => {
    // Locations belong to a store, so a new store starts from what was remembered there.
    setData((d) => ({
      ...d,
      store,
      items: d.items.map((i) => ({ ...i, location: d.remembered[store.id]?.[key(i.name)] ?? { kind: 'unknown' } })),
    }));
  }, []);

  const refreshLocations = useCallback(async () => {
    await Promise.all(data.items.filter((i) => i.location.kind === 'unknown').map((i) => lookUp(data.store, i)));
  }, [data.items, data.store, lookUp]);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      ready,
      addItem,
      setLocation,
      setStore,
      refreshLocations,
      removeItem: (id) => setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })),
      toggleItem: (id) =>
        setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) })),
      clearChecked: () => setData((d) => ({ ...d, items: d.items.filter((i) => !i.checked) })),
      setColdLast: (coldLast) => setData((d) => ({ ...d, coldLast })),
    }),
    [data, ready, addItem, setLocation, setStore, refreshLocations],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
