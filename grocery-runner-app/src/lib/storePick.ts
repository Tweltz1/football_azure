// "Where should I shop?" Compares nearby stores for the items on the list.
//
// Only Kroger-family stores can be checked for stock: Kroger's official API gives stock level and price
// per store. Walmart, Target, Hy-Vee, Costco, Aldi and Woodman's publish no stock data the app may use,
// so for them the app can only say how many of the items other shoppers have already found an aisle for.
import { callBackend } from './api';
import { metresBetween } from './chainMatch';
import type { MapStore } from './mergeStores';
import { fetchDeals } from './deals';
import { fetchSharedAisles } from './sharedAisles';
import { Store } from './types';
import { chainInfo } from './chains';

export type Stock = 'high' | 'low' | 'out' | 'unknown';
export type StockCheck = { item: string; product: string | null; stock: Stock; price: number | null; aisle: string | null };

export type StoreOption = {
  store: MapStore;
  miles: number;
  items: number;
  /** Kroger stores: stock per item. Missing for stores without stock data. */
  stock?: StockCheck[];
  /** Items with a known aisle here (Kroger data, the store's own list or other shoppers). */
  mapped: number;
  /** Items on this week's deals at a partner store. */
  onSale?: number;
  score: number;
};

export const MAX_MILES = 15;
const KROGER_TO_CHECK = 3;
const OTHERS_TO_SHOW = 5;

export const milesBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  metresBetween(a, b) / 1609.34;

export const available = (s: StockCheck[]) => s.filter((c) => c.stock === 'high' || c.stock === 'low').length;
export const missing = (s: StockCheck[]) => s.filter((c) => c.stock === 'out').map((c) => c.item);

/** Sum of known prices, or null when Kroger showed none. */
export function estimate(s: StockCheck[]): { total: number; priced: number } | null {
  const priced = s.filter((c) => c.price != null && c.stock !== 'out');
  if (!priced.length) return null;
  return { total: Math.round(priced.reduce((sum, c) => sum + (c.price ?? 0), 0) * 100) / 100, priced: priced.length };
}

/**
 * Higher is better. A store confirmed to have everything scores 100; a store whose stock can't be
 * checked scores 50 plus up to 20 for aisles shoppers have mapped there. Each mile costs 3 points, so a
 * Kroger with everything in stock wins unless it is much farther away. Items on sale at a partner store
 * add 2 points each, up to 10.
 */
export function scoreOption(o: Omit<StoreOption, 'score'>): number {
  const n = Math.max(o.items, 1);
  const base = o.stock ? (100 * available(o.stock)) / n + (5 * o.mapped) / n : 50 + (20 * o.mapped) / n;
  const sale = Math.min(10, 2 * (o.onSale ?? 0));
  return Math.round((base + sale - 3 * o.miles) * 10) / 10;
}

export const rankOptions = (options: Omit<StoreOption, 'score'>[]): StoreOption[] =>
  options.map((o) => ({ ...o, score: scoreOption(o) })).sort((a, b) => b.score - a.score || a.miles - b.miles);

/** Which nearby stores to compare: the closest few official Kroger stores, and the closest of every other chain. */
export function candidates(stores: MapStore[], at: { lat: number; lon: number }) {
  const withMiles = stores
    .map((s) => ({ store: s, miles: milesBetween(at, s) }))
    .filter((s) => s.miles <= MAX_MILES)
    .sort((a, b) => a.miles - b.miles);
  const kroger = withMiles.filter((s) => s.store.coverage === 'kroger').slice(0, KROGER_TO_CHECK);
  const seen = new Set<string>();
  const others = withMiles.filter((s) => {
    if (s.store.coverage === 'kroger' || seen.has(s.store.chain)) return false;
    seen.add(s.store.chain);
    return true;
  });
  return { kroger, others: others.slice(0, OTHERS_TO_SHOW) };
}

export const krogerStock = (locationId: string, items: string[]) =>
  callBackend<StockCheck[]>({ body: { action: 'kroger-stock', locationId, items } });

export const toStore = (s: MapStore): Store => ({
  id: s.key,
  chain: s.chain,
  name: s.name,
  address: s.address || undefined,
  aisleCount: chainInfo(s.chain).aisles,
  lat: s.lat,
  lon: s.lon,
});

/** Checks stock at nearby Kroger stores and shared aisles at the others, then ranks them. */
export async function compareStores(stores: MapStore[], at: { lat: number; lon: number }, items: string[]) {
  const { kroger, others } = candidates(stores, at);
  const saleCount = (key: string) =>
    fetchDeals(key, items)
      .then((d) => Object.keys(d).length)
      .catch(() => 0);
  const checks = await Promise.all([
    ...kroger.map(async ({ store, miles }) => {
      try {
        const [stock, onSale] = await Promise.all([krogerStock(store.key.replace('kroger:', ''), items), saleCount(store.key)]);
        return { store, miles, items: items.length, stock, mapped: stock.filter((c) => c.aisle).length, onSale };
      } catch {
        return { store, miles, items: items.length, mapped: 0 };
      }
    }),
    ...others.map(async ({ store, miles }) => {
      let mapped = 0;
      const onSale = saleCount(store.key);
      try {
        mapped = Object.keys(await fetchSharedAisles(toStore(store), items)).length;
      } catch {}
      return { store, miles, items: items.length, mapped, onSale: await onSale };
    }),
  ]);
  return rankOptions(checks);
}
