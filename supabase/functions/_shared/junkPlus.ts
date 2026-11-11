// How Curbsy pays for itself (/api/junk/plus, purchases, searches, push, partners):
//
// - Curbsy Plus, a $4.99 a month App Store subscription: up to 10 saved searches with instant alerts, search
//   up to 100 miles instead of 25, a 10-minute early look at new listings, and no sponsor cards.
// - Tips: one-time "Support Curbsy" in-app purchases.
// - Junk haulers: a poster whose stuff isn't going can call a local hauler; each tap is logged as a lead.
// - Local sponsors: one card in the Browse feed from a business that paid for the area.
//
// Purchases are bought on the phone with StoreKit and sent here as Apple-signed transactions, which are
// checked (appleJws.ts) before anything is unlocked. Partners are rows in junk_partners that the person
// running Curbsy adds in Supabase.

import type { Ctx, Res } from './handlers.ts';
import type { PushSender } from './applePush.ts';
import { asCategory, distanceKm, searchWords, type JunkCategory, type JunkItem, type JunkSearch } from './junk.ts';

export const BUNDLE_ID = 'com.hoodleague.junk';
export const PLUS_PRODUCT = 'com.hoodleague.junk.plus.monthly';
export const TIP_PRODUCTS = ['com.hoodleague.junk.tip.small', 'com.hoodleague.junk.tip.medium', 'com.hoodleague.junk.tip.large'];
export const MI = 1.609344;
export const FREE_MAX_MILES = 25;
export const PLUS_MAX_MILES = 100;
export const FREE_SAVED_SEARCHES = 1;
export const PLUS_SAVED_SEARCHES = 10;
/** New listings show only to Plus members for this long. */
export const EARLY_MINUTES = 10;
/** Most people one new listing alerts. */
export const MAX_ALERTS = 200;
export const PARTNER_KINDS = ['hauler', 'sponsor'] as const;
export type PartnerKind = typeof PARTNER_KINDS[number];

export interface JunkPlus {
  userId: string;
  originalTransactionId: string;
  productId: string;
  expiresAt: string;
  environment: string;
  updatedAt: string;
}

export interface JunkSaved {
  id: string;
  userId: string;
  q: string;
  category: JunkCategory | null;
  lat: number;
  lng: number;
  km: number;
  createdAt: string;
  seenAt: string;
}

export interface JunkPartner {
  id: string;
  kind: PartnerKind;
  name: string;
  blurb: string;
  phone: string;
  url: string;
  lat: number;
  lng: number;
  /** How far from (lat, lng) it serves. */
  km: number;
  active: boolean;
}

export interface PlusStore {
  /** The person's subscriptions (one per Apple subscription they bought). */
  plusRows(userId: string): Promise<JunkPlus[]>;
  /** Saves a subscription; 'taken' when that Apple subscription already belongs to another Curbsy account. */
  savePlus(row: JunkPlus): Promise<'ok' | 'taken'>;
  /** Records a tip once (false when that transaction was already recorded). */
  addTip(t: { transactionId: string; userId: string; productId: string; environment: string; createdAt: string }): Promise<boolean>;
  countTips(userId: string): Promise<number>;
  savedSearches(userId: string): Promise<JunkSaved[]>;
  addSavedSearch(s: JunkSaved): Promise<void>;
  deleteSavedSearch(userId: string, id: string): Promise<void>;
  seeSavedSearch(userId: string, id: string, at: string): Promise<void>;
  /** Saved searches by anyone whose area might include this spot (checked exactly afterwards). */
  savedSearchesNear(lat: number, lng: number): Promise<JunkSaved[]>;
  savePushToken(userId: string, token: string, sandbox: boolean, at: string): Promise<void>;
  pushTokens(userIds: string[]): Promise<{ userId: string; token: string; sandbox: boolean }[]>;
  dropPushTokens(tokens: string[]): Promise<void>;
  /** Active partners of this kind whose area might include this spot (checked exactly afterwards). */
  partnersNear(kind: PartnerKind, lat: number, lng: number): Promise<JunkPartner[]>;
  getPartner(id: string): Promise<JunkPartner | null>;
  logPartnerTap(t: { id: string; partnerId: string; userId: string | null; itemId: string | null; createdAt: string }): Promise<void>;
  /** Items search (the same one Browse uses), for "new matches" on saved searches. */
  search(q: JunkSearch): Promise<(JunkItem & { km: number })[]>;
  blocked(userId: string): Promise<string[]>;
}

export interface PlusDeps {
  store: PlusStore;
  /** Checks an Apple-signed transaction and returns what's in it (throws when it isn't genuine). */
  verifyPurchase?: ((jws: string) => Promise<Record<string, unknown>>) | null;
  push?: PushSender | null;
}

const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

/** When the person's Plus runs out (null: not a member). */
export async function plusUntil(store: PlusStore, userId: string | null, now: Date): Promise<string | null> {
  if (!userId) return null;
  const rows = await store.plusRows(userId);
  const best = rows.map((r) => r.expiresAt).sort().pop() ?? null;
  return best && Date.parse(best) > now.getTime() ? best : null;
}

export const maxKmFor = (plus: boolean) => (plus ? PLUS_MAX_MILES : FREE_MAX_MILES) * MI + 0.1;

/** True while a listing is in its Plus-only early window. */
export const isEarly = (createdAt: string, now: Date) => now.getTime() - Date.parse(createdAt) < EARLY_MINUTES * 60_000;

/** Whether a saved search wants this new listing. */
export function savedSearchWants(s: JunkSaved, item: JunkItem): boolean {
  if (s.userId === item.ownerId) return false;
  if (distanceKm(s.lat, s.lng, item.lat, item.lng) > s.km) return false;
  const cats = new Set([item.category, ...(item.pieces ?? []).map((p) => p.category)]);
  if (s.category && !cats.has(s.category)) return false;
  return searchWords(s.q).every((w) => item.searchText.includes(w));
}

const savedLabel = (s: Pick<JunkSaved, 'q' | 'category'>) => s.q || (s.category ? s.category.replace(/_/g, ' ') : 'anything');

/**
 * A new listing went up: Plus members whose saved search matches get a notification right away.
 * (Everyone else sees it as a new match on their saved search in the app.)
 */
export async function alertSavedSearches(ctx: Ctx, deps: PlusDeps, item: JunkItem): Promise<number> {
  const { store, push } = deps;
  if (!push || item.status !== 'available') return 0;
  const now = ctx.now();
  const wanted = new Map<string, JunkSaved>();
  for (const s of await store.savedSearchesNear(item.lat, item.lng)) {
    if (!wanted.has(s.userId) && savedSearchWants(s, item)) wanted.set(s.userId, s);
  }
  if (!wanted.size) return 0;
  const ownerBlocked = new Set(await store.blocked(item.ownerId));
  const users: string[] = [];
  for (const userId of wanted.keys()) {
    if (users.length >= MAX_ALERTS) break;
    if (ownerBlocked.has(userId)) continue;
    if (!(await plusUntil(store, userId, now))) continue;
    if ((await store.blocked(userId)).includes(item.ownerId)) continue;
    users.push(userId);
  }
  if (!users.length) return 0;
  const tokens = await store.pushTokens(users);
  let sent = 0;
  for (const userId of users) {
    const s = wanted.get(userId)!;
    const mine = tokens.filter((t) => t.userId === userId);
    if (!mine.length) continue;
    const km = distanceKm(s.lat, s.lng, item.lat, item.lng);
    const dist = km / MI < 0.2 ? 'Right nearby' : `${(km / MI).toFixed(km / MI < 10 ? 1 : 0)} mi away`;
    const dead = await push.send(mine.map((t) => ({ token: t.token, sandbox: t.sandbox })), {
      title: `Free: ${item.title}`,
      body: `${dist} · matches your “${savedLabel(s)}” search`,
      path: `/junk/item/${item.id}`,
    });
    if (dead.length) await store.dropPushTokens(dead);
    sent += 1;
  }
  return sent;
}

const partnerOut = (p: JunkPartner, km?: number) => ({
  id: p.id, kind: p.kind, name: p.name, blurb: p.blurb, phone: p.phone, url: p.url,
  ...(km === undefined ? {} : { km: Math.round(km * 10) / 10 }),
});

/** Handles the money routes; null for anything else. */
export async function junkPlusRoute(
  ctx: Ctx, deps: PlusDeps, method: string, parts: string[], data: unknown, params?: URLSearchParams,
): Promise<Res | null> {
  const [, section, a, b] = parts;
  if (!['plus', 'purchases', 'searches', 'push', 'partners'].includes(section)) return null;
  const { store } = deps;
  const me = ctx.userId;
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const now = ctx.now();
  const nowIso = now.toISOString();

  const status = async () => {
    const until = await plusUntil(store, me, now);
    return {
      plus: !!until,
      expiresAt: until,
      products: { plus: PLUS_PRODUCT, tips: TIP_PRODUCTS },
      maxMiles: until ? PLUS_MAX_MILES : FREE_MAX_MILES,
      savedSearches: until ? PLUS_SAVED_SEARCHES : FREE_SAVED_SEARCHES,
      perks: { maxMiles: PLUS_MAX_MILES, freeMaxMiles: FREE_MAX_MILES, savedSearches: PLUS_SAVED_SEARCHES, freeSavedSearches: FREE_SAVED_SEARCHES, earlyMinutes: EARLY_MINUTES },
      tips: me ? await store.countTips(me) : 0,
    };
  };

  // ---- Partners: work signed out ----
  if (section === 'partners' && !a && method === 'GET') {
    const kind = PARTNER_KINDS.find((k) => k === params?.get('kind'));
    const lat = num(params?.get('lat')), lng = num(params?.get('lng'));
    if (!kind) return bad('Which kind?');
    if (!isLat(lat) || !isLng(lng)) return bad('Location needed.');
    // Plus members don't see sponsor cards.
    if (kind === 'sponsor' && await plusUntil(store, me, now)) return ok([]);
    const near = (await store.partnersNear(kind, lat, lng))
      .filter((p) => p.active && p.kind === kind)
      .map((p) => ({ p, km: distanceKm(lat, lng, p.lat, p.lng) }))
      .filter(({ p, km }) => km <= p.km);
    if (kind === 'sponsor') {
      // One card, a different sponsor each time when an area has several.
      const pick = near[Math.floor(Math.random() * near.length)];
      return ok(pick ? [partnerOut(pick.p)] : []);
    }
    return ok(near.sort((x, y) => x.km - y.km).slice(0, 5).map(({ p, km }) => partnerOut(p, km)));
  }
  if (section === 'partners' && a && b === 'tap' && method === 'POST') {
    if (!UUID.test(a)) return { status: 404, body: 'Not found.' };
    const p = await store.getPartner(a);
    if (!p) return { status: 404, body: 'Not found.' };
    const itemId = typeof body.itemId === 'string' && UUID.test(body.itemId) ? body.itemId : null;
    await store.logPartnerTap({ id: ctx.newId(), partnerId: p.id, userId: me, itemId, createdAt: nowIso });
    return ok({ logged: true });
  }

  if (section === 'plus' && !a && method === 'GET') return ok(await status());

  if (!me) return { status: 401, body: 'Sign in first.' };

  // ---- Purchases made on the phone (Apple-signed transactions) ----
  if (section === 'purchases' && !a && method === 'POST') {
    const list = Array.isArray(body.transactions) ? body.transactions.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    if (!list.length) return bad('Nothing to check.');
    if (!deps.verifyPurchase) return { status: 503, body: 'Purchases can\'t be checked right now. Try again later.' };
    let thanks = false;
    let otherAccount = false;
    for (const jws of list) {
      let t: Record<string, unknown>;
      try {
        t = await deps.verifyPurchase(jws);
      } catch (error) {
        ctx.log.warn('junk: purchase refused', error);
        continue;
      }
      if (t.bundleId !== BUNDLE_ID || t.revocationDate) continue;
      const productId = String(t.productId ?? '');
      // Purchases made in Curbsy are tagged with the account that bought it. A promo (offer) code redeemed
      // in the App Store has no tag, so a Plus subscription without one goes to the signed-in account,
      // unless another account already has it (savePlus answers 'taken').
      const token = typeof t.appAccountToken === 'string' ? t.appAccountToken.toLowerCase() : '';
      if (token ? token !== me.toLowerCase() : productId !== PLUS_PRODUCT) { otherAccount = true; continue; }
      const environment = String(t.environment ?? 'Production');
      if (productId === PLUS_PRODUCT) {
        const expires = num(t.expiresDate);
        if (!Number.isFinite(expires)) continue;
        const saved = await store.savePlus({
          userId: me, originalTransactionId: String(t.originalTransactionId ?? t.transactionId), productId,
          expiresAt: new Date(expires).toISOString(), environment, updatedAt: nowIso,
        });
        if (saved === 'taken') otherAccount = true;
      } else if (TIP_PRODUCTS.includes(productId)) {
        if (await store.addTip({ transactionId: String(t.transactionId), userId: me, productId, environment, createdAt: nowIso })) thanks = true;
      }
    }
    const s = await status();
    return ok({ ...s, thanks, ...(otherAccount && !s.plus ? { note: 'That subscription belongs to a different Curbsy account. Sign in with that account to use it.' } : {}) });
  }

  // ---- Saved searches ----
  if (section === 'searches' && !a && method === 'GET') {
    const list = await store.savedSearches(me);
    const hidden = new Set(await store.blocked(me));
    const plus = !!(await plusUntil(store, me, now));
    const out = await Promise.all(list.map(async (s) => {
      const rows = await store.search({
        lat: s.lat, lng: s.lng, km: s.km, words: searchWords(s.q), category: s.category, sort: 'new', limit: 40, since: s.seenAt,
      });
      const fresh = rows.filter((r) => r.createdAt > s.seenAt && r.ownerId !== me && !hidden.has(r.ownerId) && (plus || !isEarly(r.createdAt, now)));
      return { id: s.id, q: s.q, category: s.category, miles: Math.round(s.km / MI), createdAt: s.createdAt, newCount: fresh.length };
    }));
    return ok(out);
  }
  if (section === 'searches' && !a && method === 'POST') {
    const q = str(body.q, 60);
    const category = asCategory(body.category);
    if (!searchWords(q).length && !category) return bad('Search for something first, then save it.');
    const lat = num(body.lat), lng = num(body.lng);
    if (!isLat(lat) || !isLng(lng)) return bad('Location needed.');
    const plus = !!(await plusUntil(store, me, now));
    const limit = plus ? PLUS_SAVED_SEARCHES : FREE_SAVED_SEARCHES;
    const mine = await store.savedSearches(me);
    const dup = mine.find((s) => s.q.toLowerCase() === q.toLowerCase() && s.category === category);
    if (dup) return ok({ id: dup.id, saved: true });
    if (mine.length >= limit) {
      return { status: 402, body: plus ? `You can save up to ${limit} searches. Delete one to add another.` : 'Free accounts can save 1 search. Curbsy Plus saves up to 10, with instant alerts.' };
    }
    const miles = Math.min(plus ? PLUS_MAX_MILES : FREE_MAX_MILES, Math.max(1, num(body.miles) || 10));
    const s: JunkSaved = {
      id: ctx.newId(), userId: me, q, category, lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000,
      km: miles * MI, createdAt: nowIso, seenAt: nowIso,
    };
    await store.addSavedSearch(s);
    return ok({ id: s.id, saved: true });
  }
  if (section === 'searches' && a && !b && method === 'DELETE') {
    if (!UUID.test(a)) return { status: 404, body: 'Not found.' };
    await store.deleteSavedSearch(me, a);
    return ok({ deleted: true });
  }
  if (section === 'searches' && a && b === 'seen' && method === 'POST') {
    if (!UUID.test(a)) return { status: 404, body: 'Not found.' };
    await store.seeSavedSearch(me, a, nowIso);
    return ok({ seen: true });
  }

  // ---- This phone's notification token ----
  if (section === 'push' && !a && method === 'POST') {
    const token = str(body.token, 200);
    if (!/^[0-9a-f]{32,200}$/i.test(token)) return bad('Bad token.');
    await store.savePushToken(me, token.toLowerCase(), body.sandbox === true, nowIso);
    return ok({ saved: true });
  }

  return { status: 405, body: 'Not allowed.' };
}
