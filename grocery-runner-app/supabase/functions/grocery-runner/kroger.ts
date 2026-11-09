// Official Kroger Public API (https://developer.kroger.com). Client-credentials OAuth, product.compact scope.

const KROGER = 'https://api.kroger.com/v1';
let token: { value: string; expires: number } | null = null;

export const krogerReady = () => Boolean(Deno.env.get('KROGER_CLIENT_ID') && Deno.env.get('KROGER_CLIENT_SECRET'));

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const id = Deno.env.get('KROGER_CLIENT_ID');
  const secret = Deno.env.get('KROGER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Kroger lookup is not set up on the server.');
  const res = await fetch(`${KROGER}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) throw new Error(`Kroger sign-in failed (${res.status}).`);
  const body = await res.json();
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${KROGER}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${await getToken()}` } });
  if (!res.ok) throw new Error(`Kroger ${path} failed (${res.status}).`);
  return res.json();
}

export async function krogerStores(zip: string) {
  const body = await get('/locations', { 'filter.zipCode.near': zip, 'filter.limit': '10' });
  // deno-lint-ignore no-explicit-any
  return (body.data ?? []).map((l: any) => ({
    id: l.locationId,
    name: l.name,
    address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
  }));
}

export async function krogerProducts(term: string, locationId: string) {
  const body = await get('/products', { 'filter.term': term, 'filter.locationId': locationId, 'filter.limit': '10' });
  // deno-lint-ignore no-explicit-any
  return (body.data ?? []).map((p: any) => ({
    productId: p.productId,
    description: p.description,
    brand: p.brand,
    categories: p.categories ?? [],
    // deno-lint-ignore no-explicit-any
    aisleLocations: (p.aisleLocations ?? []).map((a: any) => ({
      number: a.number,
      description: a.description,
      side: a.side,
      bayNumber: a.bayNumber,
      shelfNumber: a.shelfNumber,
    })),
  }));
}

export type StoreSpot = { id: string; name: string; address: string; lat: number; lon: number };

export async function krogerStoresNear(lat: number, lon: number): Promise<StoreSpot[]> {
  const body = await get('/locations', { 'filter.latLong.near': `${lat},${lon}`, 'filter.radiusInMiles': '10', 'filter.limit': '50' });
  // deno-lint-ignore no-explicit-any
  return (body.data ?? []).map((l: any) => ({
    id: String(l.locationId),
    name: l.name,
    address: [l.address?.addressLine1, l.address?.city].filter(Boolean).join(', '),
    lat: l.geolocation?.latitude,
    lon: l.geolocation?.longitude,
  // deno-lint-ignore no-explicit-any
  })).filter((s: any) => typeof s.lat === 'number' && typeof s.lon === 'number');
}
