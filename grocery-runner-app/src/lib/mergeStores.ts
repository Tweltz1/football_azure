import type { FoundPlace } from '../../modules/store-search';
import type { OfficialStore } from './api';
import { Chain, chainOf, metresBetween, placeStoreKey } from './chainMatch';

export type MapStore = {
  key: string;
  chain: Chain;
  name: string;
  address: string;
  lat: number;
  lon: number;
  /** "kroger" = aisles for every item from Kroger; "shared" = aisles from shoppers (see items). */
  coverage: 'kroger' | 'shared';
  items: number;
};

const SAME_STORE_M = 400;

/**
 * Combines Apple Maps places with the official Kroger/Walmart store lists. An official store within
 * 400 m of a place replaces it, so the store id matches Kroger aisle lookup and Walmart store numbers.
 */
export function mergeStores(places: FoundPlace[], official: OfficialStore[]): MapStore[] {
  const out: MapStore[] = official.map((o) => ({
    ...o,
    coverage: o.chain === 'kroger' ? 'kroger' : 'shared',
    items: 0,
  }));
  for (const p of places) {
    const chain = chainOf(p.name);
    if (!chain) continue;
    const at = { lat: p.latitude, lon: p.longitude };
    // Same chain already on the map nearby (official list, or the same place from another search).
    if (out.some((s) => s.chain === chain && metresBetween(s, at) < SAME_STORE_M)) continue;
    out.push({
      key: placeStoreKey(chain, at.lat, at.lon),
      chain,
      name: p.name,
      address: p.address,
      lat: at.lat,
      lon: at.lon,
      coverage: 'shared',
      items: 0,
    });
  }
  return out;
}
