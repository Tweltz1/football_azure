// Curbsy (internally "Junk App") API (/api/junk/*): free stuff people are giving away, found by distance and search.
// Anyone can browse; posting, messaging, reporting and blocking need a sign-in.
//
// Photos go to the public `junk-photos` Storage bucket under <user id>/<random>.jpg. When the first photo
// of a listing is uploaded, Gemini (the free GEMINI_API_KEY the other apps use) names the item, picks a
// category, writes a short description and search tags, and refuses photos that can't be posted.
// Locations are rounded to about 100 m before they are saved, and only distances are shown to others.

import type { Ctx, Res } from './handlers.ts';

export const JUNK_CATEGORIES = [
  'furniture', 'appliances', 'electronics', 'home', 'kids', 'clothing', 'books', 'sports', 'tools', 'garden',
  'building', 'toys', 'other',
] as const;
export type JunkCategory = typeof JUNK_CATEGORIES[number];
export const JUNK_CONDITIONS = ['like_new', 'good', 'fair', 'needs_work', 'for_parts'] as const;
export type JunkCondition = typeof JUNK_CONDITIONS[number];
export const JUNK_STATUSES = ['available', 'pending', 'gone'] as const;
export type JunkStatus = typeof JUNK_STATUSES[number] | 'hidden';

export interface JunkItem {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  category: JunkCategory;
  tags: string[];
  condition: JunkCondition;
  /** Where and when to pick it up ("on the curb, any time"). */
  pickup: string;
  /** Storage paths in the junk-photos bucket. */
  photos: string[];
  lat: number;
  lng: number;
  status: JunkStatus;
  aiDetected: boolean;
  reports: number;
  /** Lower-case title, description, category and tags, for search. */
  searchText: string;
  createdAt: string;
  updatedAt: string;
}

export interface JunkMessage {
  id: string;
  itemId: string;
  fromId: string;
  toId: string;
  fromName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface JunkSearch {
  lat: number;
  lng: number;
  km: number;
  /** Lower-case words that must all appear in the item's search text. */
  words: string[];
  category: JunkCategory | null;
  sort: 'near' | 'new';
  limit: number;
  /** Items posted or changed after this time only (keeps the feed fresh). */
  since: string;
}

export interface JunkStore {
  getItem(id: string): Promise<JunkItem | null>;
  putItem(item: JunkItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  /** Available and pending items within `km`, each with its distance. */
  search(q: JunkSearch): Promise<(JunkItem & { km: number })[]>;
  byOwner(ownerId: string): Promise<JunkItem[]>;
  countItemsSince(ownerId: string, since: string): Promise<number>;
  addReport(r: { id: string; itemId: string; reporterId: string; reason: string; createdAt: string }): Promise<boolean>;
  block(userId: string, blockedId: string, at: string): Promise<void>;
  blocked(userId: string): Promise<string[]>;
  addMessage(m: JunkMessage): Promise<void>;
  /** Every message to or from the user, newest first. */
  messagesFor(userId: string, limit: number): Promise<JunkMessage[]>;
  markRead(userId: string, itemId: string, otherId: string, at: string): Promise<void>;
  countUploadsSince(userId: string, since: string): Promise<number>;
  logUpload(userId: string, path: string, at: string): Promise<void>;
  /** Removes the user's items, messages, reports, blocks and upload log; returns their photo paths. */
  deleteUserData(userId: string): Promise<string[]>;
}

export interface JunkPhotos {
  put(path: string, jpeg: Uint8Array): Promise<void>;
  remove(paths: string[]): Promise<void>;
  url(path: string): string;
}

export interface JunkDetection {
  allowed: boolean;
  reason?: string;
  title: string;
  category: JunkCategory;
  description: string;
  tags: string[];
  condition: JunkCondition;
}

export interface JunkDetector { detect(jpegBase64: string): Promise<JunkDetection> }

export interface JunkDeps {
  store: JunkStore;
  photos: JunkPhotos;
  detector: JunkDetector | null;
  /** Deletes the sign-in account itself (the user's data is removed first). */
  deleteAccount: (userId: string) => Promise<void>;
}

type Body = Record<string, unknown>;

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 2_500_000;
export const UPLOADS_PER_DAY = 60;
export const ITEMS_PER_DAY = 25;
export const MAX_KM = 160;
export const FRESH_DAYS = 45;
export const HIDE_AFTER_REPORTS = 3;

const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const needSignIn: Res = { status: 401, body: 'Sign in first.' };
const notFound: Res = { status: 404, body: 'That item is gone.' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const longStr = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;
/** About 110 m: close enough to judge the drive, not enough to find someone's door. */
const fuzz = (n: number) => Math.round(n * 1000) / 1000;
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export const asCategory = (v: unknown): JunkCategory | null => ((JUNK_CATEGORIES as readonly string[]).includes(v as string) ? v as JunkCategory : null);
export const asCondition = (v: unknown): JunkCondition => ((JUNK_CONDITIONS as readonly string[]).includes(v as string) ? v as JunkCondition : 'good');

const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'for', 'free', 'of', 'or', 'with', 'in', 'to', 'some', 'any', 'i', 'my', 'want', 'need', 'looking', 'find', 'get', 'anyone', 'got', 'have']);

/** Lower-case words from a search box, without characters that would act as wildcards. */
export function searchWords(q: unknown): string[] {
  if (typeof q !== 'string') return [];
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w)))].slice(0, 6);
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((t) => str(t, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
}

export const searchTextOf = (i: Pick<JunkItem, 'title' | 'description' | 'category' | 'tags'>) =>
  [i.title, i.description, i.category, ...i.tags].join(' ').toLowerCase();

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const decodeJpeg = (v: unknown): Uint8Array | null => {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // JPEG files start with FF D8.
    return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
  } catch {
    return null;
  }
};

const itemOut = (deps: JunkDeps, i: JunkItem, me: string | null, km?: number) => ({
  id: i.id,
  title: i.title,
  description: i.description,
  category: i.category,
  tags: i.tags,
  condition: i.condition,
  pickup: i.pickup,
  photos: i.photos.map((p) => deps.photos.url(p)),
  status: i.status,
  aiDetected: i.aiDetected,
  ownerId: i.ownerId,
  ownerName: i.ownerName,
  mine: me !== null && me === i.ownerId,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  ...(km === undefined ? {} : { km: Math.round(km * 10) / 10 }),
  // Only the owner gets the saved spot back (to edit it); everyone else just sees the distance.
  ...(me !== null && me === i.ownerId ? { lat: i.lat, lng: i.lng } : {}),
});

/** Reads and checks the editable fields of a listing. */
function readFields(body: Body, userId: string, prev: JunkItem | null): { fields: Partial<JunkItem> } | { error: string } {
  const fields: Partial<JunkItem> = {};
  if (!prev || 'title' in body) {
    const title = str(body.title, 80);
    if (title.length < 2) return { error: 'Give it a name (like "Wood dresser").' };
    fields.title = title;
  }
  if (!prev || 'description' in body) fields.description = longStr(body.description, 1000);
  if (!prev || 'category' in body) fields.category = asCategory(body.category) ?? 'other';
  if (!prev || 'condition' in body) fields.condition = asCondition(body.condition);
  if (!prev || 'tags' in body) fields.tags = cleanTags(body.tags);
  if (!prev || 'pickup' in body) fields.pickup = longStr(body.pickup, 300);
  if (!prev || 'aiDetected' in body) fields.aiDetected = body.aiDetected === true;
  if (!prev || 'photos' in body) {
    if (!Array.isArray(body.photos)) return { error: 'Photos missing.' };
    const photos = [...new Set(body.photos.filter((p): p is string => typeof p === 'string'))];
    if (photos.length > MAX_PHOTOS) return { error: `Up to ${MAX_PHOTOS} photos.` };
    // Only the user's own uploads (or photos the listing already had).
    const own = new RegExp(`^${userId}/[a-z0-9-]{8,64}\\.jpg$`);
    if (photos.some((p) => !own.test(p) && !prev?.photos.includes(p))) return { error: 'Bad photo.' };
    fields.photos = photos;
  }
  if (!prev || 'lat' in body || 'lng' in body) {
    const lat = num(body.lat), lng = num(body.lng);
    if (!isLat(lat) || !isLng(lng)) return { error: 'Turn on location so people nearby can find it.' };
    fields.lat = fuzz(lat);
    fields.lng = fuzz(lng);
  }
  if (prev && 'status' in body) {
    if (!(JUNK_STATUSES as readonly string[]).includes(body.status as string)) return { error: 'Bad status.' };
    if (prev.status === 'hidden') return { error: 'This listing was hidden after reports.' };
    fields.status = body.status as JunkStatus;
  }
  return { fields };
}

export async function junkRoute(
  ctx: Ctx, deps: JunkDeps | null | undefined, method: string, parts: string[], data: unknown, params?: URLSearchParams,
): Promise<Res | null> {
  if (parts[0] !== 'junk') return null;
  if (!deps) return { status: 503, body: 'Curbsy is not set up here yet.' };
  const { store, photos } = deps;
  const me = ctx.userId;
  const body = (data && typeof data === 'object' ? data : {}) as Body;
  const now = ctx.now();
  const nowIso = now.toISOString();
  const [, section, a, b] = parts;

  // ---- Browse (no sign-in needed) ----
  if (section === 'items' && !a && method === 'GET') {
    const lat = num(params?.get('lat')), lng = num(params?.get('lng'));
    if (!isLat(lat) || !isLng(lng)) return bad('Location needed.');
    const km = Math.min(MAX_KM, Math.max(0.5, num(params?.get('km')) || 16));
    const limit = Math.min(100, Math.max(1, num(params?.get('limit')) || 60));
    const rows = await store.search({
      lat, lng, km, limit: limit + 20,
      words: searchWords(params?.get('q')),
      category: asCategory(params?.get('category')),
      sort: params?.get('sort') === 'new' ? 'new' : 'near',
      since: daysAgo(now, FRESH_DAYS),
    });
    const hidden = new Set(me ? await store.blocked(me) : []);
    return ok(rows.filter((r) => !hidden.has(r.ownerId)).slice(0, limit).map((r) => itemOut(deps, r, me, r.km)));
  }

  if (section === 'items' && a && !b && method === 'GET') {
    if (!UUID.test(a)) return notFound;
    const item = await store.getItem(a);
    if (!item || (item.status === 'hidden' && item.ownerId !== me)) return notFound;
    const lat = num(params?.get('lat')), lng = num(params?.get('lng'));
    const km = isLat(lat) && isLng(lng) ? distanceKm(lat, lng, item.lat, item.lng) : undefined;
    return ok(itemOut(deps, item, me, km));
  }

  if (section === 'categories' && method === 'GET') return ok({ categories: JUNK_CATEGORIES, conditions: JUNK_CONDITIONS });

  // ---- Everything below needs a sign-in ----
  if (!me) return needSignIn;
  const myName = str(ctx.displayName, 40) || 'Neighbor';

  // Upload one photo; the first photo of a listing also asks Gemini what the item is.
  if (section === 'photos' && !a && method === 'POST') {
    const jpeg = decodeJpeg(body.image);
    if (!jpeg) return bad('Send the photo as a JPEG.');
    if (jpeg.length > MAX_PHOTO_BYTES) return bad('That photo is too big.');
    if (await store.countUploadsSince(me, daysAgo(now, 1)) >= UPLOADS_PER_DAY) {
      return { status: 429, body: 'That\'s a lot of photos today. Try again tomorrow.' };
    }
    const path = `${me}/${ctx.newId().toLowerCase()}.jpg`;
    let detected: JunkDetection | null = null;
    if (body.detect === true && deps.detector) {
      try {
        detected = await deps.detector.detect(String(body.image).slice('data:image/jpeg;base64,'.length));
      } catch (error) {
        ctx.log.warn('junk: item detection failed', error);
      }
      if (detected && !detected.allowed) {
        return { status: 422, body: detected.reason || 'This photo can\'t be posted. Try a photo of just the item.' };
      }
    }
    await photos.put(path, jpeg);
    await store.logUpload(me, path, nowIso);
    return ok({ path, url: photos.url(path), detected });
  }

  if (section === 'items' && !a && method === 'POST') {
    if (await store.countItemsSince(me, daysAgo(now, 1)) >= ITEMS_PER_DAY) {
      return { status: 429, body: 'You\'ve posted a lot today. Try again tomorrow.' };
    }
    const read = readFields(body, me, null);
    if ('error' in read) return bad(read.error);
    const f = read.fields;
    const item: JunkItem = {
      id: ctx.newId(), ownerId: me, ownerName: myName,
      title: f.title!, description: f.description!, category: f.category!, tags: f.tags!, condition: f.condition!,
      pickup: f.pickup!, photos: f.photos!, lat: f.lat!, lng: f.lng!, aiDetected: f.aiDetected!,
      status: 'available', reports: 0, searchText: '', createdAt: nowIso, updatedAt: nowIso,
    };
    item.searchText = searchTextOf(item);
    await store.putItem(item);
    return ok(itemOut(deps, item, me));
  }

  if (section === 'items' && a && !b && (method === 'POST' || method === 'DELETE')) {
    const item = await store.getItem(a);
    if (!item) return notFound;
    if (item.ownerId !== me) return { status: 403, body: 'Only the person who posted it can change it.' };
    if (method === 'DELETE') {
      await store.deleteItem(item.id);
      await photos.remove(item.photos).catch((error) => ctx.log.warn('junk: photo cleanup failed', error));
      return ok({ deleted: true });
    }
    const read = readFields(body, me, item);
    if ('error' in read) return bad(read.error);
    const next: JunkItem = { ...item, ...read.fields, ownerName: myName, updatedAt: nowIso };
    next.searchText = searchTextOf(next);
    await store.putItem(next);
    const dropped = item.photos.filter((p) => !next.photos.includes(p));
    if (dropped.length) await photos.remove(dropped).catch((error) => ctx.log.warn('junk: photo cleanup failed', error));
    return ok(itemOut(deps, next, me));
  }

  if (section === 'items' && a && b === 'report' && method === 'POST') {
    const item = await store.getItem(a);
    if (!item) return notFound;
    if (item.ownerId === me) return bad('That\'s your own listing.');
    const reason = str(body.reason, 300) || 'No reason given';
    const fresh = await store.addReport({ id: ctx.newId(), itemId: item.id, reporterId: me, reason, createdAt: nowIso });
    if (fresh) {
      const reports = item.reports + 1;
      await store.putItem({ ...item, reports, status: reports >= HIDE_AFTER_REPORTS ? 'hidden' : item.status });
      ctx.log.warn(`junk: item ${item.id} reported (${reports}): ${reason}`);
    }
    return ok({ reported: true });
  }

  if (section === 'mine' && method === 'GET') {
    const rows = await store.byOwner(me);
    return ok(rows.map((r) => itemOut(deps, r, me)));
  }

  if (section === 'block' && method === 'POST') {
    const other = str(body.userId, 64);
    if (!UUID.test(other) || other === me) return bad('Who?');
    await store.block(me, other, nowIso);
    return ok({ blocked: true });
  }

  // ---- Messages: one conversation per item and pair of people ----
  if (section === 'inbox' && method === 'GET') {
    const [msgs, blockedIds] = await Promise.all([store.messagesFor(me, 500), store.blocked(me)]);
    const hidden = new Set(blockedIds);
    const threads = new Map<string, { itemId: string; otherId: string; otherName: string; last: JunkMessage; unread: number }>();
    for (const m of msgs) {
      const otherId = m.fromId === me ? m.toId : m.fromId;
      if (hidden.has(otherId)) continue;
      const key = `${m.itemId}/${otherId}`;
      let t = threads.get(key);
      if (!t) {
        t = { itemId: m.itemId, otherId, otherName: m.fromId === me ? '' : m.fromName, last: m, unread: 0 };
        threads.set(key, t);
      }
      if (!t.otherName && m.fromId !== me) t.otherName = m.fromName;
      if (m.toId === me && !m.readAt) t.unread += 1;
    }
    const list = await Promise.all([...threads.values()].map(async (t) => {
      const item = await store.getItem(t.itemId);
      return {
        itemId: t.itemId, otherId: t.otherId, otherName: t.otherName || 'Neighbor', unread: t.unread,
        last: { body: t.last.body, mine: t.last.fromId === me, createdAt: t.last.createdAt },
        item: item ? { title: item.title, photo: item.photos[0] ? photos.url(item.photos[0]) : null, status: item.status, mine: item.ownerId === me } : null,
      };
    }));
    return ok(list);
  }

  if (section === 'chat' && a && b) {
    if (!UUID.test(a) || !UUID.test(b)) return notFound;
    const item = await store.getItem(a);
    const other = b;
    if (other === me) return bad('That\'s you.');
    if (method === 'GET') {
      const msgs = (await store.messagesFor(me, 500))
        .filter((m) => m.itemId === a && (m.fromId === other || m.toId === other))
        .reverse();
      if (msgs.some((m) => m.toId === me && !m.readAt)) await store.markRead(me, a, other, nowIso);
      return ok({
        item: item ? itemOut(deps, item, me) : null,
        otherName: msgs.find((m) => m.fromId === other)?.fromName || (item?.ownerId === other ? item.ownerName : 'Neighbor'),
        messages: msgs.map((m) => ({ id: m.id, body: m.body, mine: m.fromId === me, createdAt: m.createdAt })),
      });
    }
    if (method === 'POST') {
      if (!item || item.status === 'hidden') return notFound;
      // Either you're asking the owner, or you're the owner answering someone who asked.
      if (item.ownerId !== other && item.ownerId !== me) return { status: 403, body: 'Message the person who posted it.' };
      if (item.ownerId === me) {
        const asked = (await store.messagesFor(me, 500)).some((m) => m.itemId === a && m.fromId === other);
        if (!asked) return { status: 403, body: 'You can answer people who message you.' };
      }
      if ((await store.blocked(other)).includes(me) || (await store.blocked(me)).includes(other)) {
        return { status: 403, body: 'You can\'t message this person.' };
      }
      const text = longStr(body.body, 1000);
      if (!text) return bad('Type a message.');
      const msg: JunkMessage = { id: ctx.newId(), itemId: a, fromId: me, toId: other, fromName: myName, body: text, createdAt: nowIso, readAt: null };
      await store.addMessage(msg);
      return ok({ id: msg.id, body: msg.body, mine: true, createdAt: msg.createdAt });
    }
  }

  // Delete the account and everything posted with it (App Store rule 5.1.1(v)).
  if (section === 'account' && method === 'DELETE') {
    const paths = await store.deleteUserData(me);
    await photos.remove(paths).catch((error) => ctx.log.warn('junk: photo cleanup failed', error));
    await deps.deleteAccount(me);
    return ok({ deleted: true });
  }

  return { status: 405, body: 'Not allowed.' };
}

// ---- Gemini item detection ----

const DETECT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    allowed: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
    title: { type: 'STRING' },
    category: { type: 'STRING', enum: [...JUNK_CATEGORIES] },
    description: { type: 'STRING' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    condition: { type: 'STRING', enum: [...JUNK_CONDITIONS] },
  },
  required: ['allowed', 'title', 'category', 'description', 'tags', 'condition'],
};

const DETECT_SYSTEM = 'You help people list things they are giving away for free (furniture, appliances, scrap, yard junk and so on). ' +
  'Look at the photo and describe the main item being given away. ' +
  'title: a short plain name a neighbor would search for, 2 to 5 words, with material or color when obvious (for example "Oak 6-drawer dresser"). ' +
  'category: the best fit. description: one or two friendly sentences on what it is and anything visible worth knowing (size, damage, missing parts). Do not invent brands or measurements. ' +
  'tags: 5 to 10 lower-case search words and synonyms people might type (for "dresser": dresser, chest of drawers, bureau, bedroom, furniture, wood). ' +
  'condition: your best guess from the photo. ' +
  'allowed: false only when the photo shows nudity or sexual content, graphic violence, weapons, drugs, animals or people offered as the item, or contains no item at all; then give a short, polite reason. Otherwise true.';

/** Gemini vision. Tries `models` in order when one is busy. */
export function geminiJunkDetector(apiKey: string, fetchFn: typeof fetch = fetch, models = ['gemini-flash-latest', 'gemini-flash-lite-latest']): JunkDetector {
  return {
    async detect(jpegBase64) {
      let last: unknown;
      for (const model of models) {
        try {
          const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: DETECT_SYSTEM }] },
              contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }, { text: 'What is being given away here?' }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: DETECT_SCHEMA, temperature: 0.2, maxOutputTokens: 1024 },
            }),
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status });
          const out = await res.json();
          const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : p.text ?? '')).join('');
          return cleanDetection(JSON.parse(text || '{}'));
        } catch (err) {
          last = err;
          const status = (err as { status?: number }).status;
          if (status && status !== 429 && status < 500) break;
        }
      }
      throw last;
    },
  };
}

export function cleanDetection(raw: unknown): JunkDetection {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Body;
  return {
    allowed: r.allowed !== false,
    ...(r.allowed === false ? { reason: str(r.reason, 200) || undefined } : {}),
    title: str(r.title, 80),
    category: asCategory(r.category) ?? 'other',
    description: longStr(r.description, 600),
    tags: cleanTags(r.tags),
    condition: asCondition(r.condition),
  };
}
