// Supported stores near a point, for the map. Kroger and Walmart come from their official store APIs
// when those keys are set (so their ids match aisle lookup); every other chain comes from
// OpenStreetMap via the Overpass API (data © OpenStreetMap contributors, ODbL; the app shows this credit).
import { Chain, chainOf, osmStoreKey } from './chains.ts';
import { krogerReady, krogerStoresNear } from './kroger.ts';
import { walmartReady, walmartStoresNear } from './walmart.ts';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 15000;

export type NearbyStore = {
  key: string;
  chain: Chain;
  name: string;
  address: string;
  lat: number;
  lon: number;
  /** "kroger" = full aisle data from Kroger; "shared" = aisles from shoppers (see items). */
  coverage: 'kroger' | 'shared';
  /** Items with shared shopper aisles at this store. */
  items: number;
};

// Small in-memory cache so panning the map doesn't hit Overpass every time. Lives as long as the
// function instance (minutes), which is fine for store locations.
const cache = new Map<string, { at: number; stores: NearbyStore[] }>();

async function fromOsm(lat: number, lon: number): Promise<NearbyStore[]> {
  const query = `[out:json][timeout:20];nwr["shop"~"^(supermarket|wholesale|department_store|grocery)$"](around:${RADIUS_M},${lat},${lon});out center tags 300;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'GroceryRunner/1.0 (github.com/Tweltz1/football_azure)' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Store map lookup failed (${res.status}).`);
  const body = await res.json();
  const out: NearbyStore[] = [];
  // deno-lint-ignore no-explicit-any
  for (const el of body.elements ?? []) {
    const tags = el.tags ?? {};
    const chain = chainOf(tags);
    const la = el.lat ?? el.center?.lat;
    const lo = el.lon ?? el.center?.lon;
    if (!chain || la == null || lo == null) continue;
    out.push({
      key: osmStoreKey(chain, el.type, el.id),
      chain,
      name: tags.name ?? tags.brand ?? chain,
      address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' '),
      lat: la,
      lon: lo,
      coverage: 'shared',
      items: 0,
    });
  }
  return out;
}

async function krogerNear(lat: number, lon: number): Promise<NearbyStore[]> {
  return (await krogerStoresNear(lat, lon)).map((s) => ({ ...s, key: `kroger:${s.id.toLowerCase()}`, chain: 'kroger' as const, coverage: 'kroger' as const, items: 0 }));
}

async function walmartNear(lat: number, lon: number): Promise<NearbyStore[]> {
  return (await walmartStoresNear(lat, lon)).map((s) => ({ ...s, key: `walmart:${s.id}`, chain: 'walmart' as const, coverage: 'shared' as const, items: 0 }));
}

async function coverage(stores: NearbyStore[]) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const keys = stores.filter((s) => s.coverage === 'shared').map((s) => `"${s.key}"`);
  if (!keys.length) return;
  const q = new URLSearchParams({ select: 'store_key,items', store_key: `in.(${keys.join(',')})` });
  const res = await fetch(`${url}/rest/v1/grocery_store_coverage?${q}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  if (!res.ok) return; // the map still works without counts
  const counts = new Map<string, number>((await res.json()).map((r: { store_key: string; items: number }) => [r.store_key, r.items]));
  for (const s of stores) s.items = counts.get(s.key) ?? 0;
}

export async function nearbyStores(lat: number, lon: number): Promise<NearbyStore[]> {
  // Round to ~1 km so nearby requests share a cache entry.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(cacheKey);
  let stores: NearbyStore[];
  if (hit && Date.now() - hit.at < 30 * 60_000) {
    stores = hit.stores.map((s) => ({ ...s }));
  } else {
    const [osm, kroger, walmart] = await Promise.all([
      fromOsm(lat, lon),
      krogerReady() ? krogerNear(lat, lon).catch(() => null) : null,
      walmartReady() ? walmartNear(lat, lon).catch(() => null) : null,
    ]);
    // Official lists replace the OSM copies of the same chain, so ids match aisle lookup.
    stores = [
      ...osm.filter((s) => !(kroger && s.chain === 'kroger') && !(walmart && s.chain === 'walmart')),
      ...(kroger ?? []),
      ...(walmart ?? []),
    ];
    cache.set(cacheKey, { at: Date.now(), stores: stores.map((s) => ({ ...s })) });
  }
  await coverage(stores);
  return stores;
}
