// For the store map. Store pins come from Apple Maps on the phone; this adds the official Kroger and
// Walmart store lists (when those keys are set, so their ids match aisle lookup) and how many items
// shoppers have mapped at each store.
import { krogerReady, krogerStoresNear } from './kroger.ts';
import { walmartReady, walmartStoresNear } from './walmart.ts';

export type OfficialStore = {
  key: string;
  chain: 'kroger' | 'walmart';
  name: string;
  address: string;
  lat: number;
  lon: number;
};

export async function officialStoresNear(lat: number, lon: number): Promise<OfficialStore[]> {
  const [kroger, walmart] = await Promise.all([
    krogerReady() ? krogerStoresNear(lat, lon).catch(() => []) : [],
    walmartReady() ? walmartStoresNear(lat, lon).catch(() => []) : [],
  ]);
  return [
    ...kroger.map((s) => ({ ...s, key: `kroger:${s.id.toLowerCase()}`, chain: 'kroger' as const })),
    ...walmart.map((s) => ({ ...s, key: `walmart:${s.id}`, chain: 'walmart' as const })),
  ];
}

/** Items with shared shopper aisles per store key (view grocery_store_coverage). */
export async function coverage(keys: unknown): Promise<Record<string, number>> {
  const clean = Array.isArray(keys)
    ? [...new Set(keys.filter((k) => typeof k === 'string' && /^[a-z]+:[a-z0-9-]{3,40}$/.test(k)))].slice(0, 200)
    : [];
  if (!clean.length) return {};
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const q = new URLSearchParams({ select: 'store_key,items', store_key: `in.(${clean.map((k) => `"${k}"`).join(',')})` });
  const res = await fetch(`${url}/rest/v1/grocery_store_coverage?${q}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!res.ok) throw new Error(`Coverage lookup failed (${res.status}).`);
  const out: Record<string, number> = {};
  for (const r of (await res.json()) as { store_key: string; items: number }[]) out[r.store_key] = r.items;
  return out;
}
