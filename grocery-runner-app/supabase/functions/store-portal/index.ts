// Supabase Edge Function (Deno): where partner stores send their layout and weekly deals.
// Deployed with --no-verify-jwt; every call carries its own key instead:
//
//   Store calls (header  x-store-key: ssk_...  or  Authorization: Bearer ssk_...)
//     POST {action:"store"}                                  the store's name, saved layout and current deals
//     POST {action:"layout", csv:"..."} | {rows:[{category, aisle?, department?}]}   replaces the layout
//     POST {action:"deals",  csv:"..."} | {rows:[{item, price?, starts?, ends?}]}   replaces the deals
//     Add "check": true to see how a CSV is read without saving it.
//
//   Admin calls (header  x-admin-key: <admin password>; its SHA-256 is ADMIN_HASH below)
//     POST {action:"admin-list"}
//     POST {action:"admin-add", name, chain, lat, lon, store_key?}  -> {store, key} (the key is shown once)
//     POST {action:"admin-reset", id}                               -> {key} (the old key stops working)
//     POST {action:"admin-remove", id}
//
// Only a SHA-256 hash of each store key is saved. The web page in portal/index.html calls this.
import {
  cleanDealRows,
  cleanLayoutRows,
  DealRow,
  LayoutRow,
  parseDeals,
  parseLayout,
} from '../grocery-runner/partnerData.ts';
import { itemKey } from '../grocery-runner/votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// SHA-256 of Tyler's admin password (a random 29-character password, so its hash is safe to publish).
// To change it, hash a new password and replace this, or set the STORE_ADMIN_KEY secret, which wins.
const ADMIN_HASH = 'e99f140f9ee08c9dacdd6578ff2dd99b369596f01819064adcc5cf0d221fb967';
const ADMIN_SECRET = Deno.env.get('STORE_ADMIN_KEY') ?? '';
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const CHAINS = ['kroger', 'walmart', 'target', 'hyvee', 'costco', 'aldi', 'woodmans'];
const MAX_LAYOUT = 3000;
const MAX_DEALS = 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-store-key, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  if (!res.ok) throw new HttpError(502, `Saving failed (${res.status}). Please try again.`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newKey(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `ssk_${[...bytes].map((b) => abc[b % abc.length]).join('')}`;
}

/** Constant-time string compare, so the admin key can't be guessed one letter at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Partner = {
  id: string;
  name: string;
  chain: string;
  lat: number | null;
  lon: number | null;
  store_key: string | null;
  layout_updated_at: string | null;
  deals_updated_at: string | null;
};
const PARTNER_COLS = 'id,name,chain,lat,lon,store_key,layout_updated_at,deals_updated_at';

async function storeFromKey(req: Request): Promise<Partner> {
  const header = req.headers.get('x-store-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const key = header.trim();
  if (!/^ssk_[a-z0-9]{20,64}$/.test(key)) throw new HttpError(401, 'This store link is missing its key. Use the full link you were sent.');
  const rows = (await db(
    `grocery_partner_stores?select=${PARTNER_COLS}&key_hash=eq.${await sha256(key)}&active=eq.true`,
  )) as Partner[];
  if (!rows.length) throw new HttpError(401, 'This store link is not valid any more. Ask Shop Stride for a new one.');
  return rows[0];
}

const today = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);

async function storeSummary(p: Partner) {
  const layout = await db(
    `grocery_partner_aisles?select=category,aisle,department&partner_id=eq.${p.id}&order=aisle.asc.nullslast,category.asc&limit=${MAX_LAYOUT}`,
  );
  const deals = await db(
    `grocery_partner_deals?select=item,price,starts_on,ends_on&partner_id=eq.${p.id}&or=(ends_on.is.null,ends_on.gte.${today()})&order=item.asc&limit=${MAX_DEALS}`,
  );
  return {
    store: { name: p.name, chain: p.chain, layout_updated_at: p.layout_updated_at, deals_updated_at: p.deals_updated_at },
    layout,
    deals,
  };
}

function readRows<T>(
  body: Record<string, unknown>,
  parse: (text: string) => { rows: T[]; skipped: string[] },
  clean: (rows: unknown) => T[] | null,
  max: number,
) {
  let rows: T[] | null;
  let skipped: string[] = [];
  if (typeof body.csv === 'string') {
    if (body.csv.length > 500_000) throw new HttpError(400, 'That file is too big. Split it into smaller files.');
    ({ rows, skipped } = parse(body.csv));
  } else {
    rows = clean(body.rows);
    if (!rows) throw new HttpError(400, 'Send "csv" text or a "rows" list. Each row needs a name and a place.');
  }
  if (rows.length > max) throw new HttpError(400, `That is more than ${max} lines. Split it into smaller files.`);
  return { rows, skipped };
}

async function saveLayout(p: Partner, body: Record<string, unknown>) {
  const { rows, skipped } = readRows<LayoutRow>(body, parseLayout, cleanLayoutRows, MAX_LAYOUT);
  // One row per category: a later line for the same category wins.
  const byKey = new Map<string, LayoutRow>();
  for (const r of rows) byKey.set(itemKey(r.category), r);
  const unique = [...byKey.values()];
  if (body.check) return { ok: true, saved: false, rows: unique, skipped };
  if (!unique.length) throw new HttpError(400, 'No lines could be read. Each line needs a category and an aisle.');
  await db(`grocery_partner_aisles?partner_id=eq.${p.id}`, { method: 'DELETE' });
  await db('grocery_partner_aisles', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(
      unique.map((r) => ({ partner_id: p.id, category: r.category, aisle: r.aisle ?? null, department: r.department ?? null })),
    ),
  });
  await db(`grocery_partner_stores?id=eq.${p.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ layout_updated_at: new Date().toISOString() }),
  });
  return { ok: true, saved: true, count: unique.length, skipped };
}

async function saveDeals(p: Partner, body: Record<string, unknown>) {
  const day = today();
  const { rows, skipped } = readRows<DealRow>(
    body,
    (text) => parseDeals(text, day),
    (r) => cleanDealRows(r, day),
    MAX_DEALS,
  );
  if (body.check) return { ok: true, saved: false, rows, skipped };
  // An empty list is allowed: it clears the deals.
  await db(`grocery_partner_deals?partner_id=eq.${p.id}`, { method: 'DELETE' });
  if (rows.length) {
    await db('grocery_partner_deals', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        rows.map((r) => ({ partner_id: p.id, item: r.item, price: r.price ?? null, starts_on: r.starts ?? null, ends_on: r.ends ?? null })),
      ),
    });
  }
  await db(`grocery_partner_stores?id=eq.${p.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ deals_updated_at: new Date().toISOString() }),
  });
  return { ok: true, saved: true, count: rows.length, skipped };
}

// ---------------------------------------------------------------------------------------------
// Admin (Tyler)

async function adminOk(given: string): Promise<boolean> {
  if (ADMIN_SECRET.length >= 12) return same(given, ADMIN_SECRET);
  return same(await sha256(given), ADMIN_HASH);
}

async function checkAdmin(req: Request) {
  const given = req.headers.get('x-admin-key') ?? '';
  if (!(await adminOk(given))) throw new HttpError(401, 'Wrong admin password.');
}

const uuidOk = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);

async function admin(action: string, body: Record<string, unknown>) {
  if (action === 'admin-list') {
    return db(`grocery_partner_stores?select=${PARTNER_COLS},created_at&active=eq.true&order=created_at.desc`);
  }
  if (action === 'admin-add') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const chain = typeof body.chain === 'string' ? body.chain : '';
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const storeKey =
      typeof body.store_key === 'string' && /^[a-z]+:[a-z0-9-]{3,40}$/.test(body.store_key) ? body.store_key : null;
    if (!name) throw new HttpError(400, 'Give the store a name, like "Woodman\'s Altoona".');
    if (!CHAINS.includes(chain)) throw new HttpError(400, `Chain must be one of: ${CHAINS.join(', ')}.`);
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon);
    if (!hasPos && !storeKey) throw new HttpError(400, "Add the store's location (latitude, longitude) so the app can find it.");
    const key = newKey();
    const rows = await db(`grocery_partner_stores?select=${PARTNER_COLS}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        chain,
        lat: hasPos ? lat : null,
        lon: hasPos ? lon : null,
        store_key: storeKey,
        key_hash: await sha256(key),
      }),
    });
    return { store: rows[0], key };
  }
  if (action === 'admin-reset') {
    if (!uuidOk(body.id)) throw new HttpError(400, 'Which store?');
    const key = newKey();
    await db(`grocery_partner_stores?id=eq.${body.id}`, { method: 'PATCH', body: JSON.stringify({ key_hash: await sha256(key) }) });
    return { key };
  }
  if (action === 'admin-remove') {
    if (!uuidOk(body.id)) throw new HttpError(400, 'Which store?');
    // Deleting the store deletes its layout and deals too (on delete cascade).
    await db(`grocery_partner_stores?id=eq.${body.id}`, { method: 'DELETE' });
    return { ok: true };
  }
  throw new HttpError(400, 'Unknown action.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST. See the Shop Stride store portal page.' }, 405);
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') throw new HttpError(400, 'Send JSON with an "action".');
    if (body.action.startsWith('admin-')) {
      await checkAdmin(req);
      return json(await admin(body.action, body));
    }
    const store = await storeFromKey(req);
    if (body.action === 'store') return json(await storeSummary(store));
    if (body.action === 'layout') return json(await saveLayout(store, body));
    if (body.action === 'deals') return json(await saveDeals(store, body));
    throw new HttpError(400, 'Unknown action.');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
