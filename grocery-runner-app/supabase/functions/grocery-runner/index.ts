// Supabase Edge Function (Deno) behind Grocery Runner. Keeps every secret off the phone.
//
//   GET  ?action=kroger-stores&zip=50309
//   GET  ?action=kroger-products&term=milk&locationId=01400943
//   GET  ?action=walmart-stores&zip=50309
//   GET  ?action=nearby&lat=41.6&lon=-93.6       official Kroger/Walmart stores near a point, for the map
//   POST {action:"coverage", stores:[keys]}     items with shared aisles per store
//   GET  ?action=status                          which lookups are switched on
//   POST {action:"aisles", store, items:[...]}   shared shopper aisles for a list
//   POST {action:"vote", store, item, device, aisle | department}
//   POST {action:"store-aisles", store}          every item's shared aisle at one store (layout learning)
//   POST {action:"kroger-stock", locationId, items:[...]}           stock + price per item at one Kroger store
//
// Deployed by .github/workflows/grocery-runner-app.yml.
import { sharedAisles, storeAisles, voteAisle } from './aisles.ts';
import { krogerProducts, krogerReady, krogerStock, krogerStores } from './kroger.ts';
import { coverage, officialStoresNear } from './nearby.ts';
import { walmartReady, walmartStores } from './walmart.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const zipOk = (zip: string | null): zip is string => !!zip && /^\d{5}$/.test(zip);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method === 'POST') {
      const body = await req.json();
      if (body.action === 'aisles') return json(await sharedAisles(body.store, body.items));
      if (body.action === 'vote') return json(await voteAisle(body));
      if (body.action === 'store-aisles') return json(await storeAisles(body.store));
      if (body.action === 'coverage') return json(await coverage(body.stores));
      if (body.action === 'kroger-stock') return json(await krogerStock(body.locationId, body.items));
      return json({ error: 'Unknown action.' }, 400);
    }

    const q = new URL(req.url).searchParams;
    const zip = q.get('zip');
    switch (q.get('action')) {
      case 'status':
        return json({ kroger: krogerReady(), walmart: walmartReady(), shared: true });
      case 'kroger-stores':
        if (!zipOk(zip)) return json({ error: 'Enter a 5-digit ZIP code.' }, 400);
        return json(await krogerStores(zip));
      case 'kroger-products': {
        const term = (q.get('term') ?? '').trim();
        const locationId = q.get('locationId') ?? '';
        if (term.length < 2 || !locationId) return json({ error: 'term and locationId are required.' }, 400);
        return json(await krogerProducts(term, locationId));
      }
      case 'nearby': {
        const lat = Number(q.get('lat'));
        const lon = Number(q.get('lon'));
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return json({ error: 'lat and lon are required.' }, 400);
        return json(await officialStoresNear(lat, lon));
      }
      case 'walmart-stores':
        if (!zipOk(zip)) return json({ error: 'Enter a 5-digit ZIP code.' }, 400);
        return json(await walmartStores(zip));
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
