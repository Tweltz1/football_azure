// Shared shopper aisles, stored in the grocery_aisle_votes table (see tools/setup_supabase.py).
// The table has row level security on and no policies, so only this function (service role) can
// read or write it. One vote per phone per store + item; voting again replaces the old vote.
import { officialAisles, officialStoreAisles, partnerFor } from './partners.ts';
import { cleanAisle, cleanStoreKey, DEPARTMENTS, itemKey, tallyVotes, VoteRow } from './votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TABLE = `${URL_}/rest/v1/grocery_aisle_votes`;
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;

export async function sharedAisles(store: unknown, items: unknown) {
  const storeKey = cleanStoreKey(store);
  if (!storeKey || !Array.isArray(items)) throw new Error('store and items are required.');
  const names = items.filter((i): i is string => typeof i === 'string').slice(0, 100);
  // A partner store's own aisle list wins over shopper votes.
  const partner = await partnerFor(storeKey);
  const official = partner ? await officialAisles(partner, names).catch(() => ({})) : {};
  const keys = [...new Set(names.map(itemKey).filter(Boolean))].filter((k) => !(k in official));
  if (!keys.length) return official;
  const q = new URLSearchParams({
    select: 'item_key,aisle,department,updated_at,kind',
    store_key: `eq.${storeKey}`,
    item_key: `in.(${keys.map(quote).join(',')})`,
  });
  const res = await fetch(`${TABLE}?${q}`, { headers: auth });
  if (!res.ok) throw new Error(`Shared aisles lookup failed (${res.status}).`);
  return { ...tallyVotes((await res.json()) as VoteRow[]), ...official };
}

export async function voteAisle(body: Record<string, unknown>) {
  const storeKey = cleanStoreKey(body.store);
  const item = typeof body.item === 'string' ? itemKey(body.item) : '';
  const device = typeof body.device === 'string' && /^[a-z0-9]{8,40}$/.test(body.device) ? body.device : null;
  const aisle = body.aisle == null ? null : cleanAisle(body.aisle);
  const department =
    typeof body.department === 'string' && DEPARTMENTS.includes(body.department) ? body.department : null;
  if (!storeKey || !item || !device || (!aisle && !department)) throw new Error('Invalid aisle report.');
  const kind = body.kind === 'learned' ? 'learned' : 'typed';

  // A learned guess never replaces something this phone typed in.
  if (kind === 'learned') {
    const q = new URLSearchParams({
      select: 'kind',
      store_key: `eq.${storeKey}`,
      item_key: `eq.${item}`,
      device_id: `eq.${device}`,
    });
    const existing = await fetch(`${TABLE}?${q}`, { headers: auth });
    if (existing.ok && ((await existing.json()) as { kind: string }[]).some((r) => r.kind !== 'learned')) {
      return { ok: true, skipped: true };
    }
  }

  const res = await fetch(`${TABLE}?on_conflict=store_key,item_key,device_id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      store_key: storeKey,
      item_key: item,
      device_id: device,
      aisle,
      department,
      kind,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Saving the aisle failed (${res.status}).`);
  return { ok: true };
}

/**
 * Every item with a shared aisle answer at one store, as item + aisle. The app uses it to learn the
 * store's layout (which aisle is frozen, dairy, ...). Capped to the most recent votes.
 */
export async function storeAisles(store: unknown) {
  const storeKey = cleanStoreKey(store);
  if (!storeKey) throw new Error('store is required.');
  const q = new URLSearchParams({
    select: 'item_key,aisle,department,updated_at,kind',
    store_key: `eq.${storeKey}`,
    aisle: 'not.is.null',
    order: 'updated_at.desc',
    limit: '3000',
  });
  const res = await fetch(`${TABLE}?${q}`, { headers: auth });
  if (!res.ok) throw new Error(`Store aisles lookup failed (${res.status}).`);
  const best = tallyVotes((await res.json()) as VoteRow[]);
  const shoppers = Object.entries(best).flatMap(([item, s]) => (s.aisle ? [{ item, aisle: s.aisle, votes: s.votes }] : []));
  // A partner store's category list comes first and replaces shopper answers for the same name.
  const partner = await partnerFor(storeKey);
  const official = partner ? await officialStoreAisles(partner).catch(() => []) : [];
  const taken = new Set(official.map((o) => o.item));
  return [...official, ...shoppers.filter((s) => !taken.has(s.item))];
}
