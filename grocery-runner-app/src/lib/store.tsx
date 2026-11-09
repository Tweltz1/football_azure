import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backendConfigured } from './api';
import { BuildingInfo } from './footprint';
import { locationFromKroger, searchKrogerProducts } from './kroger';
import { fetchBuildingInfo } from './osmBuilding';
import { fetchSharedAisles, isShared, itemKey, voteAisle } from './sharedAisles';
import { deletePhoto } from './recipePhotos';
import { Recipe } from './recipes';
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
  /** Recipes this shopper scanned, linked or pasted. Newest first. */
  myRecipes: Recipe[];
  /** Building outline facts per store id, from OpenStreetMap (null = no building mapped). */
  buildings: Record<string, { info: BuildingInfo | null; at: number }>;
};

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const fresh = (): Data => ({ items: [], store: null, coldLast: true, remembered: {}, deviceId: newId(), myRecipes: [], buildings: {} });

/** Stores with no building mapped are checked again after this long, in case someone maps it. */
const RECHECK_MISSING_MS = 14 * 24 * 3600_000;

type Ctx = Data & {
  ready: boolean;
  addItem: (name: string) => void;
  /** Adds several items at once (a recipe) and looks their aisles up together. */
  addItems: (names: string[]) => void;
  saveRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
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

  // Fetch the chosen store's building outline once (used to size and orient the store map).
  const { store: current, buildings } = data;
  useEffect(() => {
    if (!ready || !current || current.lat == null || current.lon == null) return;
    const cached = buildings[current.id];
    if (cached && (cached.info || Date.now() - cached.at < RECHECK_MISSING_MS)) return;
    const { id, lat, lon } = current;
    fetchBuildingInfo({ lat, lon })
      .then((info) => setData((d) => ({ ...d, buildings: { ...d.buildings, [id]: { info, at: Date.now() } } })))
      .catch(() => {}); // offline or server busy: try again next time
  }, [ready, current, buildings]);

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

  const addItems = useCallback(
    (names: string[]) => {
      const store = data.store;
      const added: ListItem[] = names
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({
          id: newId(),
          name,
          checked: false,
          location: (store && data.remembered[store.id]?.[itemKey(name)]) || { kind: 'unknown' },
        }));
      if (!added.length) return;
      setData((d) => ({ ...d, items: [...d.items, ...added] }));
      if (store) resolve(store, added.filter((i) => i.location.kind === 'unknown'));
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
      addItems,
      setLocation,
      setStore,
      saveRecipe: (recipe) =>
        setData((d) => ({ ...d, myRecipes: [recipe, ...d.myRecipes.filter((r) => r.id !== recipe.id)].slice(0, 50) })),
      deleteRecipe: (id) => {
        deletePhoto(data.myRecipes.find((r) => r.id === id)?.photo);
        setData((d) => ({ ...d, myRecipes: d.myRecipes.filter((r) => r.id !== id) }));
      },
      removeItem: (id) => setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })),
      toggleItem: (id) =>
        setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) })),
      clearChecked: () => setData((d) => ({ ...d, items: d.items.filter((i) => !i.checked) })),
      setColdLast: (coldLast) => setData((d) => ({ ...d, coldLast })),
    }),
    [data, ready, addItem, addItems, setLocation, setStore],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
