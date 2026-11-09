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

export type Stock = 'high' | 'low' | 'out' | 'unknown';
export type StockCheck = {
  item: string;
  product: string | null;
  stock: Stock;
  /** Regular or sale price in dollars, if Kroger shows one for this store. */
  price: number | null;
  aisle: string | null;
};

// deno-lint-ignore no-explicit-any
const stockOf = (p: any): Stock => {
  const level = p.items?.[0]?.inventory?.stockLevel;
  if (level === 'HIGH') return 'high';
  if (level === 'LOW') return 'low';
  if (level === 'TEMPORARILY_OUT_OF_STOCK') return 'out';
  return 'unknown';
};

/**
 * Stock and price per item at one Kroger store. Kroger's product search returns inventory and price only
 * when a store (locationId) is given. Prefers the first product that is in stock.
 */
export async function krogerStock(locationId: unknown, items: unknown): Promise<StockCheck[]> {
  if (typeof locationId !== 'string' || !/^[0-9a-z]{6,12}$/i.test(locationId)) throw new Error('locationId is required.');
  if (!Array.isArray(items)) throw new Error('items are required.');
  const names = [...new Set(items.filter((i): i is string => typeof i === 'string' && i.trim().length > 1))].slice(0, 40);

  const check = async (item: string): Promise<StockCheck> => {
    try {
      const body = await get('/products', { 'filter.term': item.slice(0, 60), 'filter.locationId': locationId, 'filter.limit': '5' });
      // deno-lint-ignore no-explicit-any
      const list: any[] = body.data ?? [];
      const best = list.find((p) => stockOf(p) === 'high') ?? list.find((p) => stockOf(p) === 'low') ?? list[0];
      if (!best) return { item, product: null, stock: 'unknown', price: null, aisle: null };
      const price = best.items?.[0]?.price;
      const value = price?.promo || price?.regular;
      return {
        item,
        product: best.description ?? null,
        stock: stockOf(best),
        price: typeof value === 'number' && value > 0 ? value : null,
        aisle: best.aisleLocations?.[0]?.number ?? null,
      };
    } catch {
      return { item, product: null, stock: 'unknown', price: null, aisle: null };
    }
  };

  // A few at a time, to stay polite with Kroger's rate limits.
  const out: StockCheck[] = [];
  for (let i = 0; i < names.length; i += 6) out.push(...(await Promise.all(names.slice(i, i + 6).map(check))));
  return out;
}
