// Supabase Edge Function (Deno): a thin proxy to the official Kroger Public API.
// The Kroger client secret must never ship inside the app, so the app calls this
// function and the function calls Kroger.
//
// Deploy:  supabase secrets set KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
//          supabase functions deploy kroger
//
// Routes (GET):
//   ?action=locations&zip=50309            nearby Kroger-family stores
//   ?action=products&term=milk&locationId=01400943   products with aisle locations

const KROGER = 'https://api.kroger.com/v1';

let token: { value: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const id = Deno.env.get('KROGER_CLIENT_ID');
  const secret = Deno.env.get('KROGER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Kroger credentials are not set on the server.');
  const res = await fetch(`${KROGER}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) throw new Error(`Kroger token request failed (${res.status}).`);
  const body = await res.json();
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function kroger(path: string, params: Record<string, string>) {
  const url = new URL(`${KROGER}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${await getToken()}` },
  });
  if (!res.ok) throw new Error(`Kroger ${path} failed (${res.status}).`);
  return res.json();
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const q = new URL(req.url).searchParams;
  try {
    switch (q.get('action')) {
      case 'locations': {
        const zip = q.get('zip') ?? '';
        if (!/^\d{5}$/.test(zip)) return json({ error: 'Enter a 5-digit ZIP code.' }, 400);
        const body = await kroger('/locations', { 'filter.zipCode.near': zip, 'filter.limit': '10' });
        return json(
          (body.data ?? []).map((l: any) => ({
            locationId: l.locationId,
            name: l.name,
            chain: l.chain,
            address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
          })),
        );
      }
      case 'products': {
        const term = (q.get('term') ?? '').trim();
        const locationId = q.get('locationId') ?? '';
        if (term.length < 2 || !locationId) return json({ error: 'term and locationId are required.' }, 400);
        const body = await kroger('/products', {
          'filter.term': term,
          'filter.locationId': locationId,
          'filter.limit': '10',
        });
        return json(
          (body.data ?? []).map((p: any) => ({
            productId: p.productId,
            description: p.description,
            brand: p.brand,
            categories: p.categories ?? [],
            aisleLocations: (p.aisleLocations ?? []).map((a: any) => ({
              number: a.number,
              description: a.description,
              side: a.side,
              bayNumber: a.bayNumber,
              shelfNumber: a.shelfNumber,
            })),
          })),
        );
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
