// Supabase Edge Function (Deno): where partner stores keep their layout, weekly deals, out-of-stock
// items and a short notice for shoppers. Deployed with --no-verify-jwt; every call proves who it is:
//
//   Manager sign-in (no key needed)
//     POST {action:"login-code", email}                 emails a 6-digit sign-in code
//     POST {action:"login-verify", email, code}         -> {access_token, refresh_token, expires_in, email}
//     POST {action:"login-password", email, password}   -> a session (after the manager made a password)
//     POST {action:"login-refresh", refresh_token}      -> a fresh session
//
//   Approve / Deny buttons in Tyler's request email (signed link, no password)
//     POST {action:"decide-view", token}                the request
//     POST {action:"decide", token, choice:"approve"|"reject", note?}
//
//   Manager calls (header  x-manager-token: <access_token>)
//     POST {action:"me"}                                -> {email, stores:[...], claims:[...]}
//     POST {action:"set-password", password}            so later sign-ins can use email + password
//     POST {action:"find-stores", chain?, query}        partner stores to ask for, by name
//     POST {action:"claim", person, title, phone, partner_id? | chain+store_name+lat+lon, address?, note?}
//          asks Tyler for access to a store; he approves it on the admin page
//     Store actions below with "store_id" in the body (only stores the manager was approved for)
//
//   Store link calls (header  x-store-key: ssk_...  or  Authorization: Bearer ssk_...)
//     The store actions below, for the link's store.
//
//   Store actions
//     {action:"store"}                                  name, notice, layout, deals, out-of-stock
//     {action:"layout", csv | rows}                     replaces the layout   ("check": true = dry run)
//     {action:"deals",  csv | rows}                     replaces the deals    ("check": true = dry run)
//     {action:"layout-set", category, aisle?, department?}    one line of the layout
//     {action:"layout-remove", category}
//     {action:"deal-add", item, price?, starts?, ends?}  {action:"deal-remove", id}
//     {action:"out-set", item, until?}                  marks an item out of stock (shows 7 days with no date)
//     {action:"out-remove", id}
//     {action:"notice", text}                           a short note for shoppers ("" clears it)
//
//   Admin calls (header  x-admin-key: <admin password>; its SHA-256 is ADMIN_HASH below)
//     {action:"admin-list"}                             stores with their managers
//     {action:"admin-add", name, chain, lat, lon, store_key?}  -> {store, key} (the key is shown once)
//     {action:"admin-reset", id}                        -> {key} (the old key stops working)
//     {action:"admin-remove", id}
//     {action:"admin-claims"}                           waiting manager requests + the last 20 decided
//     {action:"admin-approve", id, partner_id?}         gives access (makes the store if it is new)
//     {action:"admin-reject", id, note?}
//     {action:"admin-remove-manager", partner_id, user_id}
//     {action:"admin-changes", id}                      the store's last 50 saves, by whom
//     {action:"admin-undo", change_id}                  puts back what that save replaced
//
// Only a SHA-256 hash of each store key is saved. The web page in portal/index.html calls this.
import {
  cleanDealRows,
  cleanEmail,
  cleanLayoutRows,
  cleanNotice,
  cleanPhone,
  cleanText,
  DealRow,
  findPartner,
  isWorkEmail,
  LayoutRow,
  metresBetween,
  SAME_STORE_METRES,
  PARTNER_CHAINS,
  parseDate,
  parseDeals,
  parseLayout,
  addDays,
} from '../grocery-runner/partnerData.ts';
import { cleanStoreKey, itemKey } from '../grocery-runner/votes.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || SERVICE;
// SHA-256 of Tyler's admin password (a random 29-character password, so its hash is safe to publish).
// To change it, hash a new password and replace this, or set the STORE_ADMIN_KEY secret, which wins.
const ADMIN_HASH = 'e99f140f9ee08c9dacdd6578ff2dd99b369596f01819064adcc5cf0d221fb967';
const ADMIN_SECRET = Deno.env.get('STORE_ADMIN_KEY') ?? '';
// Email is optional: with no Resend key, requests just wait on the admin page.
// STRIDE_RESEND_API_KEY is a Resend key for weltzcraft.com (set by the workflow from WELTZCRAFT_RESEND_API_KEY).
const RESEND = Deno.env.get('STRIDE_RESEND_API_KEY') ?? '';
// Signs the Approve / Deny links in request emails. Never leaves the server.
const DECIDE_SECRET = Deno.env.get('STORE_DECIDE_SECRET') || SERVICE;
const MAIL_FROM = Deno.env.get('STRIDE_EMAIL_FROM') || 'Shop Stride <shopstride@weltzcraft.com>';
const NOTIFY_TO = Deno.env.get('STORE_CLAIM_NOTIFY') || 'shopstride@weltzcraft.com';
const PORTAL_URL = 'https://weltzcraft.com/shopstride/stores/';
const SUPPORT_EMAIL = 'shopstride@weltzcraft.com';
const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const MAX_LAYOUT = 3000;
const MAX_DEALS = 1000;
const MAX_OUTS = 300;
const MAX_PENDING_CLAIMS = 3;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-store-key, x-admin-key, x-manager-token',
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

const uuidOk = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
const idOk = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;
const today = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The live end-to-end check (tools/e2e_store_portal.py) uses these addresses; it never sends email. */
const isTest = (email: string) => email.startsWith('stride-e2e-');

async function sendEmail(to: string, subject: string, text: string, html?: string, about?: string) {
  if (!RESEND || isTest(to) || (about && isTest(about))) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
    });
  } catch {
    // Email is a nice-to-have; the admin page always shows waiting requests.
  }
}

// ---------------------------------------------------------------------------------------------
// Stores

type Partner = {
  id: string;
  name: string;
  chain: string;
  lat: number | null;
  lon: number | null;
  store_key: string | null;
  address: string | null;
  phone: string | null;
  notice: string | null;
  layout_updated_at: string | null;
  deals_updated_at: string | null;
  notice_updated_at: string | null;
};
const PARTNER_COLS =
  'id,name,chain,lat,lon,store_key,address,phone,notice,layout_updated_at,deals_updated_at,notice_updated_at';

/** Who made a change, for the change log. */
type Who = { user_id: string | null; label: string };

async function storeFromKey(req: Request): Promise<Partner> {
  const header = req.headers.get('x-store-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const key = header.trim();
  if (!/^ssk_[a-z0-9]{20,64}$/.test(key)) throw new HttpError(401, 'Please sign in, or use the full store link you were sent.');
  const rows = (await db(
    `grocery_partner_stores?select=${PARTNER_COLS}&key_hash=eq.${await sha256(key)}&active=eq.true`,
  )) as Partner[];
  if (!rows.length) throw new HttpError(401, 'This store link is not valid any more. Ask Shop Stride for a new one.');
  return rows[0];
}

const layoutOf = (id: string) =>
  db(`grocery_partner_aisles?select=category,aisle,department&partner_id=eq.${id}&order=aisle.asc.nullslast,category.asc&limit=${MAX_LAYOUT}`) as Promise<
    { category: string; aisle: string | null; department: string | null }[]
  >;
const dealsOf = (id: string) =>
  db(
    `grocery_partner_deals?select=id,item,price,starts_on,ends_on&partner_id=eq.${id}&or=(ends_on.is.null,ends_on.gte.${today()})&order=item.asc&limit=${MAX_DEALS}`,
  ) as Promise<{ id: number; item: string; price: string | null; starts_on: string | null; ends_on: string | null }[]>;
/** Marks still showing: back-in date not passed, or no date and set in the last 7 days. */
const outsOf = (id: string) =>
  db(
    `grocery_partner_outs?select=id,item,until,at&partner_id=eq.${id}` +
      `&or=(until.gte.${today()},and(until.is.null,at.gte.${new Date(Date.now() - 7 * 86400_000).toISOString()}))&order=item.asc&limit=${MAX_OUTS}`,
  ) as Promise<{ id: number; item: string; until: string | null; at: string }[]>;

async function storeSummary(p: Partner) {
  const [layout, deals, outs] = await Promise.all([layoutOf(p.id), dealsOf(p.id), outsOf(p.id)]);
  return {
    store: {
      id: p.id,
      name: p.name,
      chain: p.chain,
      address: p.address,
      notice: p.notice,
      layout_updated_at: p.layout_updated_at,
      deals_updated_at: p.deals_updated_at,
      notice_updated_at: p.notice_updated_at,
    },
    layout,
    deals,
    outs,
  };
}

async function logChange(p: Partner, who: Who, what: string, detail: string, before: unknown) {
  try {
    await db('grocery_partner_changes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ partner_id: p.id, user_id: who.user_id, who: who.label.slice(0, 254), what, detail: detail.slice(0, 300), before }),
    });
  } catch {
    // The save itself already happened; a missing log line must not undo it.
  }
}

const touch = (p: Partner, field: 'layout_updated_at' | 'deals_updated_at' | 'notice_updated_at', extra: Record<string, unknown> = {}) =>
  db(`grocery_partner_stores?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: new Date().toISOString(), ...extra }) });

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

async function putLayout(p: Partner, rows: { category: string; aisle?: string | null; department?: string | null }[]) {
  await db(`grocery_partner_aisles?partner_id=eq.${p.id}`, { method: 'DELETE' });
  if (rows.length) {
    await db('grocery_partner_aisles', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows.map((r) => ({ partner_id: p.id, category: r.category, aisle: r.aisle ?? null, department: r.department ?? null }))),
    });
  }
}

async function putDeals(p: Partner, rows: { item: string; price?: string | null; starts_on?: string | null; ends_on?: string | null }[]) {
  await db(`grocery_partner_deals?partner_id=eq.${p.id}`, { method: 'DELETE' });
  if (rows.length) {
    await db('grocery_partner_deals', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        rows.map((r) => ({ partner_id: p.id, item: r.item, price: r.price ?? null, starts_on: r.starts_on ?? null, ends_on: r.ends_on ?? null })),
      ),
    });
  }
}

const dealSnapshot = async (p: Partner) => (await dealsOf(p.id)).map(({ id: _id, ...d }) => d);

async function saveLayout(p: Partner, body: Record<string, unknown>, who: Who) {
  const { rows, skipped } = readRows<LayoutRow>(body, parseLayout, cleanLayoutRows, MAX_LAYOUT);
  // One row per category: a later line for the same category wins.
  const byKey = new Map<string, LayoutRow>();
  for (const r of rows) byKey.set(itemKey(r.category), r);
  const unique = [...byKey.values()];
  if (body.check) return { ok: true, saved: false, rows: unique, skipped };
  if (!unique.length) throw new HttpError(400, 'No lines could be read. Each line needs a category and an aisle.');
  const before = await layoutOf(p.id);
  await putLayout(p, unique);
  await touch(p, 'layout_updated_at');
  await logChange(p, who, 'layout', `Replaced the layout (${unique.length} lines)`, { layout: before });
  return { ok: true, saved: true, count: unique.length, skipped };
}

async function saveDeals(p: Partner, body: Record<string, unknown>, who: Who) {
  const day = today();
  const { rows, skipped } = readRows<DealRow>(
    body,
    (text) => parseDeals(text, day),
    (r) => cleanDealRows(r, day),
    MAX_DEALS,
  );
  if (body.check) return { ok: true, saved: false, rows, skipped };
  const before = await dealSnapshot(p);
  // An empty list is allowed: it clears the deals.
  await putDeals(p, rows.map((r) => ({ item: r.item, price: r.price, starts_on: r.starts, ends_on: r.ends })));
  await touch(p, 'deals_updated_at');
  await logChange(p, who, 'deals', rows.length ? `Replaced the deals (${rows.length})` : 'Cleared the deals', { deals: before });
  return { ok: true, saved: true, count: rows.length, skipped };
}

async function setLayoutLine(p: Partner, body: Record<string, unknown>, who: Who) {
  const rows = cleanLayoutRows([{ category: body.category, aisle: body.aisle, department: body.department }]);
  if (!rows) throw new HttpError(400, 'Give the item or category, and an aisle (like 7) or a department (like Produce).');
  const r = rows[0];
  const before = await layoutOf(p.id);
  if (before.length >= MAX_LAYOUT && !before.some((b) => itemKey(b.category) === itemKey(r.category)))
    throw new HttpError(400, `The layout already has ${MAX_LAYOUT} lines.`);
  const kept = before.filter((b) => itemKey(b.category) !== itemKey(r.category));
  // Upsert by deleting the old spelling (if any) and adding this one.
  const old = before.filter((b) => itemKey(b.category) === itemKey(r.category));
  for (const o of old) await db(`grocery_partner_aisles?partner_id=eq.${p.id}&category=eq.${encodeURIComponent(o.category)}`, { method: 'DELETE' });
  await db('grocery_partner_aisles', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ partner_id: p.id, category: r.category, aisle: r.aisle ?? null, department: r.department ?? null }),
  });
  await touch(p, 'layout_updated_at');
  const where = r.aisle ? `aisle ${r.aisle}` : r.department;
  await logChange(p, who, 'layout', `${old.length ? 'Moved' : 'Added'} ${r.category} -> ${where}`, { layout: before });
  return { ok: true, count: kept.length + 1 };
}

async function removeLayoutLine(p: Partner, body: Record<string, unknown>, who: Who) {
  const key = typeof body.category === 'string' ? itemKey(body.category) : '';
  if (!key) throw new HttpError(400, 'Which line?');
  const before = await layoutOf(p.id);
  const gone = before.filter((b) => itemKey(b.category) === key);
  if (!gone.length) return { ok: true, removed: 0 };
  for (const g of gone) await db(`grocery_partner_aisles?partner_id=eq.${p.id}&category=eq.${encodeURIComponent(g.category)}`, { method: 'DELETE' });
  await touch(p, 'layout_updated_at');
  await logChange(p, who, 'layout', `Removed ${gone[0].category}`, { layout: before });
  return { ok: true, removed: gone.length };
}

async function addDeal(p: Partner, body: Record<string, unknown>, who: Who) {
  const rows = cleanDealRows([{ item: body.item, price: body.price, starts: body.starts, ends: body.ends }], today());
  if (!rows) throw new HttpError(400, 'Give the item, and an end date like 11/30 if it has one.');
  const r = rows[0];
  const before = await dealSnapshot(p);
  if (before.length >= MAX_DEALS) throw new HttpError(400, `There are already ${MAX_DEALS} deals.`);
  await db('grocery_partner_deals', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ partner_id: p.id, item: r.item, price: r.price ?? null, starts_on: r.starts ?? null, ends_on: r.ends ?? null }),
  });
  await touch(p, 'deals_updated_at');
  await logChange(p, who, 'deals', `Added deal ${r.item}${r.price ? ` ${r.price}` : ''}`, { deals: before });
  return { ok: true };
}

async function removeDeal(p: Partner, body: Record<string, unknown>, who: Who) {
  if (!idOk(body.id)) throw new HttpError(400, 'Which deal?');
  const before = await dealSnapshot(p);
  const rows = (await db(`grocery_partner_deals?id=eq.${body.id}&partner_id=eq.${p.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })) as { item: string }[];
  if (rows?.length) {
    await touch(p, 'deals_updated_at');
    await logChange(p, who, 'deals', `Removed deal ${rows[0].item}`, { deals: before });
  }
  return { ok: true, removed: rows?.length ?? 0 };
}

async function setOut(p: Partner, body: Record<string, unknown>, who: Who) {
  const item = cleanText(body.item, 80);
  if (!itemKey(item)) throw new HttpError(400, 'Which item is out of stock?');
  const day = today();
  // With no back-in date the mark shows for 7 days, so a forgotten one can't hide an item for good.
  const until = body.until ? parseDate(String(body.until), day) : null;
  if (body.until && (!until || until < day)) throw new HttpError(400, 'Give the date it is back, like 11/30, or leave it empty.');
  if (until && until > addDays(day, 60)) throw new HttpError(400, 'Pick a back-in date within 60 days.');
  const outs = await outsOf(p.id);
  const before = outs.map(({ item, until }) => ({ item, until }));
  if (outs.length >= MAX_OUTS) throw new HttpError(400, `There are already ${MAX_OUTS} items marked out.`);
  for (const o of outs.filter((o) => itemKey(o.item) === itemKey(item)))
    await db(`grocery_partner_outs?id=eq.${o.id}`, { method: 'DELETE' });
  await db('grocery_partner_outs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ partner_id: p.id, item, until }) });
  await logChange(p, who, 'outs', `Marked ${item} out of stock${until ? ` until ${until}` : ''}`, { outs: before });
  return { ok: true };
}

async function removeOut(p: Partner, body: Record<string, unknown>, who: Who) {
  if (!idOk(body.id)) throw new HttpError(400, 'Which item?');
  const before = (await outsOf(p.id)).map(({ item, until }) => ({ item, until }));
  const rows = (await db(`grocery_partner_outs?id=eq.${body.id}&partner_id=eq.${p.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })) as { item: string }[];
  if (rows?.length) await logChange(p, who, 'outs', `${rows[0].item} is back in stock`, { outs: before });
  return { ok: true, removed: rows?.length ?? 0 };
}

async function saveNotice(p: Partner, body: Record<string, unknown>, who: Who) {
  const text = cleanNotice(body.text);
  await touch(p, 'notice_updated_at', { notice: text || null });
  await logChange(p, who, 'notice', text ? `Notice: ${text}` : 'Cleared the notice', { notice: p.notice });
  return { ok: true, notice: text || null };
}

async function storeAction(p: Partner, body: Record<string, unknown>, who: Who) {
  switch (body.action) {
    case 'store':
      return storeSummary(p);
    case 'layout':
      return saveLayout(p, body, who);
    case 'deals':
      return saveDeals(p, body, who);
    case 'layout-set':
      return setLayoutLine(p, body, who);
    case 'layout-remove':
      return removeLayoutLine(p, body, who);
    case 'deal-add':
      return addDeal(p, body, who);
    case 'deal-remove':
      return removeDeal(p, body, who);
    case 'out-set':
      return setOut(p, body, who);
    case 'out-remove':
      return removeOut(p, body, who);
    case 'notice':
      return saveNotice(p, body, who);
  }
  throw new HttpError(400, 'Unknown action.');
}

// ---------------------------------------------------------------------------------------------
// Manager sign-in (Supabase Auth email codes; the same accounts as the Shop Stride app)

async function authCall(path: string, body: unknown) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

const session = (d: Record<string, unknown>) => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_in: d.expires_in,
  email: (d.user as { email?: string } | undefined)?.email ?? null,
});

async function login(action: string, body: Record<string, unknown>) {
  if (action === 'login-code') {
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Enter your email address.');
    const r = await authCall('otp', { email, create_user: true });
    if (r.status === 429) throw new HttpError(429, 'Too many codes asked for. Wait a minute and try again.');
    if (!r.ok) throw new HttpError(502, 'Could not send the code. Please try again.');
    return { ok: true };
  }
  if (action === 'login-verify') {
    const email = cleanEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!email || !/^\d{6,10}$/.test(code)) throw new HttpError(400, 'Enter the code from the email.');
    const r = await authCall('verify', { type: 'email', email, token: code });
    if (!r.ok || !r.data.access_token) throw new HttpError(401, 'That code is wrong or too old. Ask for a new one.');
    return session(r.data);
  }
  if (action === 'login-password') {
    const email = cleanEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
    const r = await authCall('token?grant_type=password', { email, password });
    if (r.status === 429) throw new HttpError(429, 'Too many tries. Wait a minute and try again.');
    if (!r.ok || !r.data.access_token)
      throw new HttpError(401, "That email and password don't match. Use \"Email me a code\" if you haven't made a password yet.");
    return session(r.data);
  }
  if (action === 'login-refresh') {
    const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    if (!token) throw new HttpError(401, 'Please sign in again.');
    const r = await authCall('token?grant_type=refresh_token', { refresh_token: token });
    if (!r.ok || !r.data.access_token) throw new HttpError(401, 'Please sign in again.');
    return session(r.data);
  }
  throw new HttpError(400, 'Unknown action.');
}

type User = { id: string; email: string };

async function userFrom(req: Request): Promise<User> {
  const token = req.headers.get('x-manager-token')?.trim() ?? '';
  if (!token) throw new HttpError(401, 'Please sign in.');
  const res = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'Your sign-in ran out. Please sign in again.');
  const u = (await res.json()) as { id?: string; email?: string };
  if (!u.id || !u.email) throw new HttpError(401, 'Please sign in with an email address.');
  return { id: u.id, email: u.email.toLowerCase() };
}

async function setPassword(req: Request, body: Record<string, unknown>) {
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72) throw new HttpError(400, 'Use 8 to 72 characters.');
  const res = await fetch(`${URL_}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON, Authorization: `Bearer ${req.headers.get('x-manager-token')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { msg?: string; message?: string };
    const why = d.msg || d.message || '';
    throw new HttpError(400, /weak|short|characters/i.test(why) ? `That password is too weak: ${why}` : 'Could not save the password. Try another one.');
  }
  return { ok: true };
}

const CLAIM_COLS = 'id,store_name,chain,address,status,decided_note,created_at,decided_at,partner_id';

async function managerStores(u: User): Promise<Partner[]> {
  const links = (await db(`grocery_store_managers?select=partner_id&user_id=eq.${u.id}`)) as { partner_id: string }[];
  if (!links.length) return [];
  const ids = links.map((l) => l.partner_id).join(',');
  return (await db(`grocery_partner_stores?select=${PARTNER_COLS}&id=in.(${ids})&active=eq.true&order=name.asc`)) as Partner[];
}

async function me(u: User) {
  const stores = await managerStores(u);
  const claims = await db(`grocery_store_claims?select=${CLAIM_COLS}&user_id=eq.${u.id}&order=created_at.desc&limit=10`);
  return { email: u.email, stores: stores.map((s) => ({ id: s.id, name: s.name, chain: s.chain, address: s.address })), claims };
}

async function findStores(body: Record<string, unknown>) {
  const q = cleanText(body.query, 40).replace(/[%*,()."]/g, ' ').trim();
  const chain = typeof body.chain === 'string' && PARTNER_CHAINS.includes(body.chain) ? body.chain : null;
  if (q.length < 2 && !chain) return [];
  let path = `grocery_partner_stores?select=id,name,chain,address&active=eq.true&order=name.asc&limit=20`;
  if (chain) path += `&chain=eq.${chain}`;
  if (q.length >= 2) path += `&or=(name.ilike.*${encodeURIComponent(q)}*,address.ilike.*${encodeURIComponent(q)}*)`;
  const rows = (await db(path)) as { id: string }[];
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id).join(',');
  const managed = (await db(`grocery_store_managers?select=partner_id&partner_id=in.(${ids})`)) as { partner_id: string }[];
  const pending = (await db(`grocery_store_claims?select=partner_id&status=eq.pending&partner_id=in.(${ids})`)) as { partner_id: string }[];
  const taken = new Set(managed.map((m) => m.partner_id));
  const asked = new Set(pending.map((m) => m.partner_id));
  return rows.map((r) => ({ ...r, claimed: taken.has(r.id), pending: !taken.has(r.id) && asked.has(r.id) }));
}

async function claim(u: User, body: Record<string, unknown>) {
  const person = cleanText(body.person, 80);
  const title = cleanText(body.title, 60);
  const phone = cleanPhone(body.phone);
  const note = cleanText(body.note, 500);
  if (!person) throw new HttpError(400, 'Enter your name.');
  if (!title) throw new HttpError(400, 'Enter your job title, like Store Manager.');
  if (!phone) throw new HttpError(400, "Enter the store's phone number (10 digits), so we can call to check.");
  const pending = (await db(`grocery_store_claims?select=id&user_id=eq.${u.id}&status=eq.pending`)) as unknown[];
  if (pending.length >= MAX_PENDING_CLAIMS) throw new HttpError(429, 'You already have requests waiting. We will email you when they are checked.');

  let store: { partner_id: string | null; chain: string; store_name: string; address: string | null; lat: number | null; lon: number | null; store_key: string | null };
  if (body.partner_id) {
    if (!uuidOk(body.partner_id)) throw new HttpError(400, 'Which store?');
    const rows = (await db(`grocery_partner_stores?select=${PARTNER_COLS}&id=eq.${body.partner_id}&active=eq.true`)) as Partner[];
    if (!rows.length) throw new HttpError(404, 'That store was not found.');
    const p = rows[0];
    const mine = (await db(`grocery_store_managers?select=user_id&partner_id=eq.${p.id}&user_id=eq.${u.id}`)) as unknown[];
    if (mine.length) throw new HttpError(400, 'You can already edit this store.');
    store = { partner_id: p.id, chain: p.chain, store_name: p.name, address: p.address, lat: p.lat, lon: p.lon, store_key: p.store_key };
  } else {
    const chain = typeof body.chain === 'string' ? body.chain : '';
    const name = cleanText(body.store_name, 80);
    const address = cleanText(body.address, 160) || null;
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const storeKey = cleanStoreKey(body.store_key);
    if (!PARTNER_CHAINS.includes(chain)) throw new HttpError(400, 'Pick your store chain.');
    if (!name) throw new HttpError(400, 'Enter the store name, like "Woodman\'s Altoona".');
    if (!address) throw new HttpError(400, "Enter the store's street address.");
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !!(lat || lon);
    if (!hasPos) throw new HttpError(400, "Add the store's map location (paste a Google Maps link).");
    // The store may already be a partner under another name: ask for that one instead of a copy.
    const partners = (await db(`grocery_partner_stores?select=${PARTNER_COLS}&active=eq.true`)) as Partner[];
    const key = `${chain}:g${lat < 0 ? 'm' : ''}${Math.round(Math.abs(lat) * 1000)}x${lon < 0 ? 'm' : ''}${Math.round(Math.abs(lon) * 1000)}`;
    const existing = findPartner(storeKey ?? key, partners) ?? findPartner(key, partners);
    store = existing
      ? { partner_id: existing.id, chain: existing.chain, store_name: existing.name, address: existing.address ?? address, lat: existing.lat, lon: existing.lon, store_key: existing.store_key }
      : { partner_id: null, chain, store_name: name, address, lat, lon, store_key: storeKey };
  }

  // One manager team per store, and one request at a time: no spam for Tyler. A claimed store opens again
  // only when Tyler removes its manager on the admin page.
  if (store.partner_id) {
    const managers = (await db(`grocery_store_managers?select=user_id&partner_id=eq.${store.partner_id}&limit=1`)) as unknown[];
    if (managers.length)
      throw new HttpError(409, `${store.store_name} is already claimed by its manager. If that has changed, email ${SUPPORT_EMAIL}.`);
  }
  const waiting = (await db(
    `grocery_store_claims?select=partner_id,chain,lat,lon&status=eq.pending&chain=eq.${store.chain}&limit=500`,
  )) as { partner_id: string | null; chain: string; lat: number | null; lon: number | null }[];
  const samePlace = (w: { lat: number | null; lon: number | null }) =>
    store.lat != null && store.lon != null && w.lat != null && w.lon != null &&
    metresBetween({ lat: store.lat, lon: store.lon }, { lat: w.lat, lon: w.lon }) <= SAME_STORE_METRES;
  if (waiting.some((w) => (store.partner_id && w.partner_id === store.partner_id) || samePlace(w)))
    throw new HttpError(409, `Someone already asked to manage ${store.store_name}. We're checking it now.`);

  const work = isWorkEmail(store.chain, u.email);
  const rows = await db(`grocery_store_claims?select=${CLAIM_COLS}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: u.id, email: u.email, person, title, phone, note: note || null, work_email: work, ...store }),
  });
  const token = await decideToken(rows[0].id);
  const link = (choice: string) => `${PORTAL_URL}#decide=${token}&choice=${choice}`;
  const lines = [
    `${person} (${title}) asked to manage ${store.store_name}${store.address ? `, ${store.address}` : ''}${store.partner_id ? '' : ' (a new store)'}.`,
    `Email: ${u.email}${work ? " (the chain's own email domain)" : ' (NOT a work email)'}`,
    `Store phone they gave: ${phone}`,
    ...(note ? [`Note: ${note}`] : []),
    `Before approving, call the store's public number (from Google Maps, not the one above) and ask for ${person}.`,
  ];
  const btn = (href: string, text: string, color: string) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:${color};color:#fff;font-weight:700;text-decoration:none;margin-right:10px">${text}</a>`;
  await sendEmail(
    NOTIFY_TO,
    `Shop Stride: ${person} asks to manage ${store.store_name}`,
    `${lines.join('\n')}\n\nApprove: ${link('approve')}\nDeny: ${link('reject')}\n\nOr use ${PORTAL_URL}#admin`,
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#121611">` +
      lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('') +
      `<p style="margin:18px 0">${btn(link('approve'), 'Approve', '#1F9D55')}${btn(link('reject'), 'Deny', '#C9353A')}</p>` +
      `<p style="color:#66705F;font-size:13px">The buttons open the store portal to confirm. They work for ${DECIDE_DAYS} days. ` +
      `All requests are also on <a href="${PORTAL_URL}#admin">the admin page</a>.</p></div>`,
    u.email,
  );
  return { ok: true, claim: rows[0] };
}

// ---------------------------------------------------------------------------------------------
// Deciding a manager request (admin page, or the Approve / Deny buttons in Tyler's email)

type Claim = {
  id: string; user_id: string; email: string; person: string; title: string | null; phone: string | null;
  partner_id: string | null; chain: string; store_name: string; address: string | null;
  lat: number | null; lon: number | null; store_key: string | null; note: string | null;
  work_email: boolean; status: string; created_at: string;
};

async function claimById(id: unknown): Promise<Claim> {
  if (!uuidOk(id)) throw new HttpError(400, 'Which request?');
  const rows = (await db(`grocery_store_claims?select=*&id=eq.${id}`)) as Claim[];
  if (!rows.length) throw new HttpError(404, 'That request was not found.');
  return rows[0];
}

async function decideClaim(c: Claim, choice: 'approve' | 'reject', body: Record<string, unknown>) {
  if (c.status !== 'pending') throw new HttpError(400, `That request was already ${c.status}.`);
  const decidedAt = new Date().toISOString();
  if (choice === 'reject') {
    const note = cleanText(body.note, 300) || null;
    await db(`grocery_store_claims?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected', decided_note: note, decided_at: decidedAt }) });
    await sendEmail(
      c.email,
      `Your Shop Stride request for ${c.store_name}`,
      `Hi ${c.person},\n\nWe couldn't confirm that you manage ${c.store_name}, so we haven't given access yet.` +
        `${note ? `\n\n${note}` : ''}\n\nReply to this email if you think this is a mistake.\n\nShop Stride`,
    );
    return { ok: true, status: 'rejected' };
  }
  // Approve: an existing store (or the one Tyler picked), else make the store from the request.
  let partnerId = uuidOk(body.partner_id) ? body.partner_id : c.partner_id;
  if (partnerId) {
    await partnerById(partnerId);
  } else {
    if (c.lat == null || c.lon == null) throw new HttpError(400, 'This request has no map location. Add the store by hand first.');
    const made = (await db(`grocery_partner_stores?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: c.store_name, chain: c.chain, lat: c.lat, lon: c.lon, store_key: c.store_key,
        address: c.address, phone: c.phone, key_hash: await sha256(newKey()),
      }),
    })) as { id: string }[];
    partnerId = made[0].id;
  }
  await db('grocery_store_managers', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ partner_id: partnerId, user_id: c.user_id, email: c.email, person: c.person, title: c.title }),
  });
  await db(`grocery_store_claims?id=eq.${c.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved', partner_id: partnerId, decided_at: decidedAt }),
  });
  await sendEmail(
    c.email,
    `You can now update ${c.store_name} on Shop Stride`,
    `Hi ${c.person},\n\nYou're approved to keep ${c.store_name} up to date on Shop Stride: where items are, ` +
      `this week's sales, items that are out of stock, and a short note for shoppers.\n\n` +
      `Sign in at ${PORTAL_URL}\n\nShop Stride`,
  );
  return { ok: true, status: 'approved', partner_id: partnerId };
}

// The email's buttons carry  <claim id>.<expiry, unix seconds>.<HMAC>  signed with a server-only secret,
// so only someone with that email can decide. The page still asks for one more click, so a mail
// scanner that opens links can't approve anyone.
const DECIDE_DAYS = 14;
async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`store-claims:${DECIDE_SECRET}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
async function decideToken(id: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DECIDE_DAYS * 86400;
  return `${id}.${exp}.${await hmac(`${id}.${exp}`)}`;
}
async function claimFromToken(token: unknown): Promise<Claim> {
  const m = typeof token === 'string' ? token.match(/^([0-9a-f-]{36})\.(\d{10})\.([0-9a-f]{40})$/) : null;
  if (!m || !same(await hmac(`${m[1]}.${m[2]}`), m[3])) throw new HttpError(401, 'This link is not valid. Use the admin page instead.');
  if (Number(m[2]) < Date.now() / 1000) throw new HttpError(401, 'This link is too old. Use the admin page instead.');
  return claimById(m[1]);
}

async function decideByLink(action: string, body: Record<string, unknown>) {
  const c = await claimFromToken(body.token);
  if (action === 'decide-view') {
    const { user_id: _u, ...shown } = c;
    return shown;
  }
  const choice = body.choice === 'approve' ? 'approve' : body.choice === 'reject' ? 'reject' : null;
  if (!choice) throw new HttpError(400, 'Approve or deny?');
  return decideClaim(c, choice, { note: body.note });
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

async function partnerById(id: unknown): Promise<Partner> {
  if (!uuidOk(id)) throw new HttpError(400, 'Which store?');
  const rows = (await db(`grocery_partner_stores?select=${PARTNER_COLS}&id=eq.${id}`)) as Partner[];
  if (!rows.length) throw new HttpError(404, 'That store was not found.');
  return rows[0];
}

async function admin(action: string, body: Record<string, unknown>) {
  if (action === 'admin-list') {
    const stores = (await db(`grocery_partner_stores?select=${PARTNER_COLS},created_at&active=eq.true&order=created_at.desc`)) as (Partner & {
      managers?: unknown[];
    })[];
    const managers = (await db('grocery_store_managers?select=partner_id,user_id,email,person,title,created_at&order=created_at.asc')) as {
      partner_id: string;
    }[];
    for (const s of stores) s.managers = managers.filter((m) => m.partner_id === s.id);
    return stores;
  }
  if (action === 'admin-add') {
    const name = cleanText(body.name, 80);
    const chain = typeof body.chain === 'string' ? body.chain : '';
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const storeKey = cleanStoreKey(body.store_key);
    if (!name) throw new HttpError(400, 'Give the store a name, like "Woodman\'s Altoona".');
    if (!PARTNER_CHAINS.includes(chain)) throw new HttpError(400, `Chain must be one of: ${PARTNER_CHAINS.join(', ')}.`);
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon);
    if (!hasPos && !storeKey) throw new HttpError(400, "Add the store's location (latitude, longitude) so the app can find it.");
    const key = newKey();
    const rows = await db(`grocery_partner_stores?select=${PARTNER_COLS}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, chain, lat: hasPos ? lat : null, lon: hasPos ? lon : null, store_key: storeKey, key_hash: await sha256(key) }),
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
    // Deleting the store deletes its layout, deals, managers and log too (on delete cascade).
    await db(`grocery_partner_stores?id=eq.${body.id}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (action === 'admin-claims') {
    const cols = 'id,user_id,email,person,title,phone,partner_id,chain,store_name,address,lat,lon,store_key,note,work_email,status,decided_note,created_at,decided_at';
    const pending = await db(`grocery_store_claims?select=${cols}&status=eq.pending&order=created_at.asc&limit=100`);
    const decided = await db(`grocery_store_claims?select=${cols}&status=neq.pending&order=decided_at.desc&limit=20`);
    return { pending, decided };
  }
  if (action === 'admin-approve' || action === 'admin-reject') {
    return decideClaim(await claimById(body.id), action === 'admin-approve' ? 'approve' : 'reject', body);
  }
  if (action === 'admin-remove-manager') {
    if (!uuidOk(body.partner_id) || !uuidOk(body.user_id)) throw new HttpError(400, 'Which manager?');
    await db(`grocery_store_managers?partner_id=eq.${body.partner_id}&user_id=eq.${body.user_id}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (action === 'admin-changes') {
    if (!uuidOk(body.id)) throw new HttpError(400, 'Which store?');
    return db(`grocery_partner_changes?select=id,who,what,detail,at&partner_id=eq.${body.id}&order=at.desc&limit=50`);
  }
  if (action === 'admin-undo') {
    if (!idOk(body.change_id)) throw new HttpError(400, 'Which change?');
    const rows = (await db(`grocery_partner_changes?select=partner_id,what,before,at&id=eq.${body.change_id}`)) as {
      partner_id: string; what: string; before: Record<string, unknown> | null; at: string;
    }[];
    if (!rows.length || !rows[0].before) throw new HttpError(404, 'That change cannot be undone.');
    const ch = rows[0];
    const p = await partnerById(ch.partner_id);
    const who: Who = { user_id: null, label: 'Shop Stride admin' };
    const b = ch.before!;
    if (ch.what === 'layout' && Array.isArray(b.layout)) {
      const now = await layoutOf(p.id);
      await putLayout(p, b.layout as LayoutRow[]);
      await touch(p, 'layout_updated_at');
      await logChange(p, who, 'layout', `Undid a change from ${ch.at}`, { layout: now });
    } else if (ch.what === 'deals' && Array.isArray(b.deals)) {
      const now = await dealSnapshot(p);
      await putDeals(p, b.deals as { item: string }[]);
      await touch(p, 'deals_updated_at');
      await logChange(p, who, 'deals', `Undid a change from ${ch.at}`, { deals: now });
    } else if (ch.what === 'outs' && Array.isArray(b.outs)) {
      const now = (await outsOf(p.id)).map(({ item, until }) => ({ item, until }));
      await db(`grocery_partner_outs?partner_id=eq.${p.id}`, { method: 'DELETE' });
      const back = (b.outs as { item: string; until: string | null }[]).filter((o) => !o.until || o.until >= today());
      if (back.length)
        await db('grocery_partner_outs', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(back.map((o) => ({ partner_id: p.id, item: o.item, until: o.until }))),
        });
      await logChange(p, who, 'outs', `Undid a change from ${ch.at}`, { outs: now });
    } else if (ch.what === 'notice') {
      const text = typeof b.notice === 'string' ? b.notice : null;
      await touch(p, 'notice_updated_at', { notice: text });
      await logChange(p, who, 'notice', `Undid a change from ${ch.at}`, { notice: p.notice });
    } else {
      throw new HttpError(400, 'That change cannot be undone.');
    }
    return { ok: true };
  }
  throw new HttpError(400, 'Unknown action.');
}

// ---------------------------------------------------------------------------------------------

const MANAGER_ONLY = new Set(['me', 'find-stores', 'claim', 'set-password']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST. See the Shop Stride store portal page.' }, 405);
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') throw new HttpError(400, 'Send JSON with an "action".');
    const action = body.action;
    if (action.startsWith('admin-')) {
      await checkAdmin(req);
      return json(await admin(action, body));
    }
    if (action.startsWith('login-')) return json(await login(action, body));
    if (action === 'decide-view' || action === 'decide') return json(await decideByLink(action, body));

    if (req.headers.get('x-manager-token')) {
      const u = await userFrom(req);
      if (action === 'me') return json(await me(u));
      if (action === 'find-stores') return json(await findStores(body));
      if (action === 'claim') return json(await claim(u, body));
      if (action === 'set-password') return json(await setPassword(req, body));
      const store = (await managerStores(u)).find((s) => s.id === body.store_id);
      if (!store) throw new HttpError(403, "You can't edit that store yet. Ask for access first.");
      return json(await storeAction(store, body, { user_id: u.id, label: u.email }));
    }
    if (MANAGER_ONLY.has(action)) throw new HttpError(401, 'Please sign in.');
    const store = await storeFromKey(req);
    return json(await storeAction(store, body, { user_id: null, label: 'store link' }));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof HttpError ? e.message : 'Something went wrong. Please try again.' }, status);
  }
});
