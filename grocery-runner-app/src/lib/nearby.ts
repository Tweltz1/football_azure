import { FoundPlace, searchPlaces } from '../../modules/store-search';
import { backendConfigured, OfficialStore, officialStoresNear, storeCoverage } from './api';
import { SEARCHES } from './chainMatch';
import { MapStore, mergeStores } from './mergeStores';

export type { MapStore };

const SEARCH_RADIUS_M = 15000;

// Apple limits how often an app may search, so results are kept per ~1 km for this session.
const cache = new Map<string, MapStore[]>();

export async function storesNear(lat: number, lon: number): Promise<MapStore[]> {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let stores = cache.get(cacheKey)?.map((s) => ({ ...s }));
  if (!stores) {
    const [placeLists, official] = await Promise.all([
      Promise.all(SEARCHES.map((q) => searchPlaces(q, lat, lon, SEARCH_RADIUS_M).catch(() => [] as FoundPlace[]))),
      backendConfigured ? officialStoresNear(lat, lon).catch(() => [] as OfficialStore[]) : Promise.resolve([]),
    ]);
    stores = mergeStores(placeLists.flat(), official);
    cache.set(cacheKey, stores.map((s) => ({ ...s })));
  }
  if (backendConfigured) {
    try {
      const counts = await storeCoverage(stores.filter((s) => s.coverage === 'shared').map((s) => s.key));
      for (const s of stores) s.items = counts[s.key] ?? 0;
    } catch {}
  }
  return stores;
}
