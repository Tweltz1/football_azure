// Calls the grocery-runner Supabase function. Both values are public and safe to ship in the app.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const backendConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export async function callBackend<T>(params: Record<string, string> | { body: Record<string, unknown> }): Promise<T> {
  if (!backendConfigured) throw new Error('Online lookups are not set up in this build.');
  const base = `${SUPABASE_URL}/functions/v1/grocery-runner`;
  const headers = { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY!, 'Content-Type': 'application/json' };
  const res =
    'body' in params
      ? await fetch(base, { method: 'POST', headers, body: JSON.stringify(params.body) })
      : await fetch(`${base}?${new URLSearchParams(params as Record<string, string>)}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export type BackendStatus = { kroger: boolean; walmart: boolean; shared: boolean; recipes?: boolean };
export type FoundStore = { id: string; name: string; address: string };

export const backendStatus = () => callBackend<BackendStatus>({ action: 'status' });
export const findStores = (chain: 'kroger' | 'walmart', zip: string) =>
  callBackend<FoundStore[]>({ action: `${chain}-stores`, zip });

export type OfficialStore = {
  key: string;
  chain: 'kroger' | 'walmart';
  name: string;
  address: string;
  lat: number;
  lon: number;
};

export const officialStoresNear = (lat: number, lon: number) =>
  callBackend<OfficialStore[]>({ action: 'nearby', lat: lat.toFixed(4), lon: lon.toFixed(4) });

export const storeCoverage = (keys: string[]) =>
  callBackend<Record<string, number>>({ body: { action: 'coverage', stores: keys } });
