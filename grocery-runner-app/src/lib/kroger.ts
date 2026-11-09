import { departmentFromKrogerCategory } from './departments';
import { ItemLocation } from './types';

// Set these in a .env file (see README). Both are safe to ship in the app.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const krogerConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export type KrogerStore = { locationId: string; name: string; chain: string; address: string };

export type KrogerAisle = {
  number?: string;
  description?: string;
  side?: string;
  bayNumber?: string;
  shelfNumber?: string;
};

export type KrogerProduct = {
  productId: string;
  description: string;
  brand?: string;
  categories: string[];
  aisleLocations: KrogerAisle[];
};

async function call<T>(params: Record<string, string>): Promise<T> {
  if (!krogerConfigured) throw new Error('Kroger lookup is not set up yet. Add the Supabase values to .env.');
  const url = `${SUPABASE_URL}/functions/v1/kroger?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY! } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export const findKrogerStores = (zip: string) => call<KrogerStore[]>({ action: 'locations', zip });

export const searchKrogerProducts = (term: string, locationId: string) =>
  call<KrogerProduct[]>({ action: 'products', term, locationId });

/** Converts a Kroger product to a routable location. Prefers the first numbered aisle. */
export function locationFromKroger(p: KrogerProduct): ItemLocation {
  const department = departmentFromKrogerCategory(p.categories[0]) ?? undefined;
  const aisle = p.aisleLocations.find((a) => a.number && /\d/.test(a.number)) ?? p.aisleLocations[0];
  if (aisle?.number) {
    const side = aisle.side === 'L' || aisle.side === 'R' ? aisle.side : undefined;
    const bay = aisle.bayNumber ? parseInt(aisle.bayNumber, 10) : undefined;
    return {
      kind: 'aisle',
      aisle: aisle.number,
      side,
      bay: Number.isFinite(bay) ? bay : undefined,
      department,
      source: 'kroger',
    };
  }
  if (department) return { kind: 'department', department, source: 'kroger' };
  return { kind: 'unknown' };
}
