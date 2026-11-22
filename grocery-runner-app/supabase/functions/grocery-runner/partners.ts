// Partner store data for the app: a store's own aisle list (beats shopper votes) and its weekly deals.
// Stores send it through the store-portal function; tables are made by tools/setup_supabase.py.
import { findPartner, matchCategory, matchDeals, matchOuts, OFFICIAL_VOTES, PartnerStore } from './partnerData.ts';
import { cleanStoreKey, itemKey, SharedLocation } from './votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

type Aisle = { category: string; aisle: string | null; department: string | null };
type Deal = { item: string; price: string | null; ends_on: string | null };
type Out = { item: string; until: string | null };

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: auth });
  if (!res.ok) throw new Error(`Partner store lookup failed (${res.status}).`);
  return (await res.json()) as T;
}

// The partner list is tiny and changes rarely, so each function instance keeps it for a minute.
type Partner = PartnerStore & { notice?: string | null };
let cached: { at: number; rows: Partner[] } | null = null;
async function partners(): Promise<Partner[]> {
  if (cached && Date.now() - cached.at < 60_000) return cached.rows;
  try {
    const rows = await rest<Partner[]>('grocery_partner_stores?select=id,name,chain,lat,lon,store_key,notice&active=eq.true');
    cached = { at: Date.now(), rows };
  } catch {
    // Before the tables exist (or if they fail) the app just gets shopper aisles.
    cached = { at: Date.now(), rows: [] };
  }
  return cached.rows;
}

export async function partnerFor(store: unknown): Promise<Partner | null> {
  const key = cleanStoreKey(store);
  return key ? findPartner(key, await partners()) : null;
}

const aislesOf = (id: string) =>
  rest<Aisle[]>(`grocery_partner_aisles?select=category,aisle,department&partner_id=eq.${id}&limit=5000`);

/** US-ish "today": a deal ending "Nov 15" still shows on the evening of the 15th in Wisconsin. */
const today = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);

const activeDeals = (id: string) => {
  const d = today();
  return rest<Deal[]>(
    `grocery_partner_deals?select=item,price,ends_on&partner_id=eq.${id}` +
      `&and=(or(starts_on.is.null,starts_on.lte.${d}),or(ends_on.is.null,ends_on.gte.${d}))&limit=2000`,
  );
};

/** The store's own locations for these items, in the same shape as shopper answers, marked official. */
export async function officialAisles(partner: PartnerStore, items: string[]) {
  const rows = await aislesOf(partner.id);
  const out: Record<string, SharedLocation & { official: true; store: string }> = {};
  for (const name of items) {
    const key = itemKey(name);
    const row = key && matchCategory(name, rows);
    if (!row) continue;
    out[key] = {
      ...(row.aisle ? { aisle: row.aisle } : {}),
      ...(row.department ? { department: row.department } : {}),
      votes: OFFICIAL_VOTES,
      total: OFFICIAL_VOTES,
      official: true,
      store: partner.name,
    };
  }
  return out;
}

/** Every category with an aisle, for learning the store's layout (frozen in aisle 12, ...). */
export async function officialStoreAisles(partner: PartnerStore) {
  const rows = await aislesOf(partner.id);
  return rows.flatMap((r) => (r.aisle ? [{ item: itemKey(r.category), aisle: r.aisle, votes: OFFICIAL_VOTES }] : []));
}

const activeOuts = (id: string) =>
  rest<Out[]>(
    `grocery_partner_outs?select=item,until&partner_id=eq.${id}` +
      `&or=(until.gte.${today()},and(until.is.null,at.gte.${new Date(Date.now() - 7 * 86400_000).toISOString()}))&limit=500`,
  ).catch(() => [] as Out[]);

type AppDeal = { item: string; price?: string; ends?: string };
const appDeal = (d: Deal): AppDeal => ({ item: d.item, ...(d.price ? { price: d.price } : {}), ...(d.ends_on ? { ends: d.ends_on } : {}) });

/**
 * POST {action:"deals", store, items:[...]}
 *   -> { store: "Woodman's Altoona" | null, deals: { itemKey: deal }, outs: { itemKey: {item, until} } }.
 * Only this week's deals, and items the store marked out of stock, that match something on the list.
 */
export async function listDeals(store: unknown, items: unknown) {
  if (!Array.isArray(items)) throw new Error('store and items are required.');
  const partner = await partnerFor(store);
  if (!partner) return { store: null, deals: {}, outs: {} };
  const names = items.filter((i): i is string => typeof i === 'string').slice(0, 100);
  const [dealRows, outRows] = await Promise.all([activeDeals(partner.id), activeOuts(partner.id)]);
  const deals: Record<string, AppDeal> = {};
  for (const [key, d] of Object.entries(matchDeals(names, dealRows))) deals[key] = appDeal(d);
  const outs: Record<string, { item: string; until?: string }> = {};
  for (const [key, o] of Object.entries(matchOuts(names, outRows))) outs[key] = { item: o.item, ...(o.until ? { until: o.until } : {}) };
  return { store: partner.name, deals, outs };
}

/**
 * POST {action:"store-info", store} -> { store: name | null, notice, deals: [every deal this week] }.
 * For the app's "Deals this week" screen.
 */
export async function storeInfo(store: unknown) {
  const partner = await partnerFor(store);
  if (!partner) return { store: null, notice: null, deals: [] };
  const rows = await activeDeals(partner.id);
  rows.sort((a, b) => a.item.localeCompare(b.item));
  return { store: partner.name, notice: partner.notice ?? null, deals: rows.slice(0, 500).map(appDeal) };
}
