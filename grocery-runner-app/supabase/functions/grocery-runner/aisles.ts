// Shared shopper aisles, stored in the grocery_aisle_votes table (see tools/setup_supabase.py).
// The table has row level security on and no policies, so only this function (service role) can
// read or write it. One vote per phone per store + item; voting again replaces the old vote.
import { cleanAisle, cleanStoreKey, DEPARTMENTS, itemKey, tallyVotes, VoteRow } from './votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TABLE = `${URL_}/rest/v1/grocery_aisle_votes`;
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;

export async function sharedAisles(store: unknown, items: unknown) {
  const storeKey = cleanStoreKey(store);
  if (!storeKey || !Array.isArray(items)) throw new Error('store and items are required.');
  const keys = [...new Set(items.filter((i) => typeof i === 'string').map(itemKey).filter(Boolean))].slice(0, 100);
  if (!keys.length) return {};
  const q = new URLSearchParams({
    select: 'item_key,aisle,department,updated_at',
    store_key: `eq.${storeKey}`,
    item_key: `in.(${keys.map(quote).join(',')})`,
  });
  const res = await fetch(`${TABLE}?${q}`, { headers: auth });
  if (!res.ok) throw new Error(`Shared aisles lookup failed (${res.status}).`);
  return tallyVotes((await res.json()) as VoteRow[]);
}

export async function voteAisle(body: Record<string, unknown>) {
  const storeKey = cleanStoreKey(body.store);
  const item = typeof body.item === 'string' ? itemKey(body.item) : '';
  const device = typeof body.device === 'string' && /^[a-z0-9]{8,40}$/.test(body.device) ? body.device : null;
  const aisle = body.aisle == null ? null : cleanAisle(body.aisle);
  const department =
    typeof body.department === 'string' && DEPARTMENTS.includes(body.department) ? body.department : null;
  if (!storeKey || !item || !device || (!aisle && !department)) throw new Error('Invalid aisle report.');

  const res = await fetch(`${TABLE}?on_conflict=store_key,item_key,device_id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      store_key: storeKey,
      item_key: item,
      device_id: device,
      aisle,
      department,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Saving the aisle failed (${res.status}).`);
  return { ok: true };
}
