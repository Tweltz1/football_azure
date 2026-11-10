// Curbsy (internally "Junk App") API (/api/junk/*): free stuff people are giving away, found by distance and search.
// Anyone can browse; posting, messaging, reporting and blocking need a sign-in.
//
// Photos go to the public `junk-photos` Storage bucket under <user id>/<random>.jpg. When the first photo
// of a listing is uploaded, Gemini (the free GEMINI_API_KEY the other apps use) names the item, picks a
// category, writes a short description and search tags, and refuses photos that can't be posted.
// Locations are rounded to about 100 m before they are saved, and only distances are shown to others.

import type { Ctx, Res } from './handlers.ts';
import {
  CLAIMS_PER_DAY, MAX_CLAIM_KM, OPEN_CLAIM, RECLAIM_COOLDOWN_MIN, claimOut, etaMinutes, judgeClaim, newClaim, pingClaim,
  type ClaimStore, type JunkClaim,
} from './junkClaims.ts';
import { CHAT_RULES, LABEL_MIN_CONFIDENCE, LABEL_RULES, SAFETY_RULES, checkText, hasContactDetails, personalDetails } from './junkSafety.ts';

export const JUNK_CATEGORIES = [
  'furniture', 'appliances', 'electronics', 'home', 'kids', 'clothing', 'books', 'sports', 'tools', 'garden',
  'building', 'toys', 'other',
] as const;
export type JunkCategory = typeof JUNK_CATEGORIES[number];
export const JUNK_CONDITIONS = ['like_new', 'good', 'fair', 'needs_work', 'for_parts'] as const;
export type JunkCondition = typeof JUNK_CONDITIONS[number];
export const JUNK_HANDOFFS = ['porch', 'meet'] as const;
export type JunkHandoff = typeof JUNK_HANDOFFS[number];
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
  /** First come, first served: "I'm on my way" doesn't hold it, several people can head over at once. */
  firstCome: boolean;
  /** Private pickup details (street address, which door): only the poster, whoever is on the way, and people the
   *  poster has written back to see it. */
  spot?: string;
  /** "porch": left out for no-contact pickup (the default); "meet": handed over in person. */
  handoff?: JunkHandoff;
  /** A multi-item post: the separate things in it (empty for a single item). */
  pieces: JunkPiece[];
  reports: number;
  /** Lower-case title, description, category and tags, for search. */
  searchText: string;
  createdAt: string;
  updatedAt: string;
}

export interface JunkPiece {
  id: string;
  title: string;
  category: JunkCategory;
  /** Taken already (picked up, or the poster marked it). */
  gone: boolean;
  /** Which photo shows it, and where in it (0 to 1, from the top left), when the phone spotted it. */
  photo: number;
  box: { x: number; y: number; w: number; h: number } | null;
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

export interface JunkStore extends ClaimStore {
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
  /** The person's most recent claim (open or ended), or null. */
  latestClaimForUser(userId: string): Promise<JunkClaim | null>;
  /** Removes the user's items, messages, reports, blocks, claims and upload log; returns their photo paths. */
  deleteUserData(userId: string): Promise<string[]>;
  /** When the person agreed to the Terms and whether they're banned (null: never seen). */
  member(userId: string): Promise<JunkMember | null>;
  acceptTerms(userId: string, at: string): Promise<void>;
  /** Saves when the account was made and how they sign in, for the member card others see. */
  touchMember(userId: string, joinedAt: string | null, provider: string | null): Promise<void>;
  /** Notes that this account used this phone; returns whether the phone is banned and how many accounts used it lately. */
  seeDevice(userId: string, deviceId: string, at: string, since: string): Promise<{ banned: boolean; accounts: number }>;
  /** The other people in this person's finished pickups ("Got it" at the spot), as giver or taker. */
  pickupPartners(userId: string): Promise<string[]>;
  addFeedback(f: { id: string; userId: string; userName: string; body: string; createdAt: string; kind?: 'contact' | 'appeal'; itemId?: string | null }): Promise<void>;
  countFeedbackSince(userId: string, since: string): Promise<number>;
  /** Learning loop: a fix to the name or category the phone guessed (see addLabelFix in the handler). */
  addLabelFix(f: JunkLabelFix): Promise<void>;
  countLabelFixesSince(userId: string, since: string): Promise<number>;
}

export interface JunkLabelFix {
  id: string;
  userId: string;
  app: 'curbsy' | 'totetrack';
  guessLabel: string;
  guessTitle: string;
  guessSource: string;
  guessConfidence: number | null;
  finalTitle: string;
  finalCategory: string;
  /** Base64 JPEG of just the item, only when the person opted in. */
  crop: string | null;
  createdAt: string;
}

export interface JunkMember {
  termsAt: string | null; bannedAt: string | null; joinedAt?: string | null; provider?: string | null;
  /** Confirmed rule breaks (the daily review's hide_item). The second one bans the account. */
  strikes?: number; banReason?: string;
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
export const MAX_PIECES = 12;
export const FEEDBACK_PER_DAY = 5;
/** Learning loop: name fixes a person can send a day, and the largest item picture kept (base64 JPEG). */
export const LABEL_FIXES_PER_DAY = 150;
export const MAX_CROP_CHARS = 80_000;
/** Accounts younger than this get tighter daily limits (bots and throwaway accounts are usually brand new). */
export const NEW_ACCOUNT_HOURS = 48;
export const NEW_ITEMS_PER_DAY = 3;
export const NEW_CLAIMS_PER_DAY = 3;
export const NEW_CHATS_PER_DAY = 5;
export const CHATS_PER_DAY = 40;
/** A phone that several accounts post or message from is treated like a brand-new account (throwaway accounts). */
export const ACCOUNTS_PER_DEVICE = 3;
/** "Verified neighbor": finished pickups (checked at the spot by location) with this many different people. */
export const VERIFIED_PICKUPS = 3;
/** A member card says "New member" for this long. */
export const NEW_MEMBER_DAYS = 14;

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

export const searchTextOf = (i: Pick<JunkItem, 'title' | 'description' | 'category' | 'tags'> & { pieces?: JunkPiece[] }) =>
  [i.title, i.description, i.category, ...i.tags, ...(i.pieces ?? []).filter((p) => !p.gone).flatMap((p) => [p.title, p.category])]
    .join(' ').toLowerCase();

/** Pieces of a multi-item post that someone's open claim is for (a claim with no pieces is for all of them). */
export const heldPieces = (i: JunkItem, claims: JunkClaim[]) =>
  new Set(claims.flatMap((c) => (c.pieceIds?.length ? c.pieceIds : (i.pieces ?? []).map((p) => p.id))));

const unit = (v: unknown) => { const n = num(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : NaN; };

/** Reads the pieces of a multi-item post, keeping the ids (and taken flags) the listing already had. */
function readPieces(v: unknown, prev: JunkPiece[]): JunkPiece[] | { error: string } {
  if (v == null) return [];
  if (!Array.isArray(v)) return { error: 'Bad item list.' };
  if (v.length > MAX_PIECES) return { error: `Up to ${MAX_PIECES} things in one post.` };
  const used = new Set(prev.map((p) => p.id));
  let next = prev.reduce((m, p) => Math.max(m, Number(p.id.replace(/^p/, '')) || 0), 0);
  const out: JunkPiece[] = [];
  for (const raw of v) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Body;
    const title = str(r.title, 60);
    if (title.length < 2) continue;
    const old = typeof r.id === 'string' ? prev.find((p) => p.id === r.id) : undefined;
    const box = r.box && typeof r.box === 'object' ? r.box as Body : null;
    const b = box ? { x: unit(box.x), y: unit(box.y), w: unit(box.w), h: unit(box.h) } : null;
    let id = old?.id;
    if (!id) { do { id = `p${++next}`; } while (used.has(id)); used.add(id); }
    out.push({
      id, title, category: asCategory(r.category) ?? old?.category ?? 'other',
      gone: 'gone' in r ? r.gone === true : old?.gone ?? false,
      photo: Math.max(0, Math.min(MAX_PHOTOS - 1, Math.floor(num(r.photo)) || 0)),
      box: b && Object.values(b).every(Number.isFinite) && b.w > 0 && b.h > 0 ? b : old?.box ?? null,
    });
  }
  // One thing isn't a multi-item post.
  return out.length >= 2 ? out : [];
}

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

export interface OwnerCard { since: string | null; provider: string | null; given: number; isNew: boolean; verified: boolean }

const itemOut = (
  deps: JunkDeps, i: JunkItem, me: string | null, km?: number, claims: JunkClaim[] = [],
  extra: { spotOk?: boolean; owner?: OwnerCard } = {},
) => ({
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
  firstCome: !!i.firstCome,
  handoff: i.handoff === 'meet' ? 'meet' : 'porch',
  // The private spot (and the rounded map point) for the poster, whoever is on the way, and people the poster wrote to.
  ...((me !== null && me === i.ownerId) || extra.spotOk ? { spot: i.spot ?? '', spotOk: true, lat: i.lat, lng: i.lng } : { spotOk: false, hasSpot: !!i.spot }),
  ...(extra.owner ? { owner: extra.owner } : {}),
  // A multi-item post: each thing, whether it's taken, and whether someone is on the way for it.
  pieces: (() => {
    const held = heldPieces(i, claims);
    const mineIds = new Set(claims.filter((c) => c.claimerId === me).flatMap((c) => (c.pieceIds?.length ? c.pieceIds : (i.pieces ?? []).map((p) => p.id))));
    return (i.pieces ?? []).map((p) => ({ ...p, held: !p.gone && held.has(p.id), mine: mineIds.has(p.id) }));
  })(),
  // People who tapped "I'm on my way" (only open claims are passed in). On a normal listing the one claim
  // holds it; on a first come, first served listing `claim` is only your own trip.
  claim: (() => {
    const shared = i.firstCome || (i.pieces ?? []).length > 0;
    const c = shared ? claims.find((x) => x.claimerId === me) : claims[0];
    return c ? claimOut(c, me) : null;
  })(),
  onTheWay: claims.length,
  ...(me !== null && me === i.ownerId ? { claimers: claims.map((c) => claimOut(c, me)) } : {}),
});

/** "Chair and lamp", "Chair, lamp and 3 more". */
export function bundleTitle(pieces: Pick<JunkPiece, 'title'>[]): string {
  const names = pieces.map((p, n) => (n ? p.title.charAt(0).toLowerCase() + p.title.slice(1) : p.title));
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`.slice(0, 80);
}

const readSpot = (body: Body): { lat: number; lng: number } | null => {
  const lat = num(body.lat), lng = num(body.lng);
  return isLat(lat) && isLng(lng) ? { lat, lng } : null;
};

/** Reads and checks the editable fields of a listing. */
function readFields(body: Body, userId: string, prev: JunkItem | null): { fields: Partial<JunkItem> } | { error: string } {
  const fields: Partial<JunkItem> = {};
  if (!prev || 'pieces' in body) {
    const pieces = readPieces(body.pieces, prev?.pieces ?? []);
    if ('error' in pieces) return pieces;
    fields.pieces = pieces;
    // A post of several things can go without its own name: "Chair, lamp and 2 more".
    if (pieces.length && !str(body.title, 80) && !prev) body = { ...body, title: bundleTitle(pieces) };
    if (pieces.length && !asCategory(body.category) && !prev) body = { ...body, category: pieces[0].category };
  }
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
  if (!prev || 'firstCome' in body) fields.firstCome = body.firstCome === true;
  if (!prev || 'spot' in body) fields.spot = longStr(body.spot, 300);
  if (!prev || 'handoff' in body) fields.handoff = body.handoff === 'meet' ? 'meet' : 'porch';
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
  const unsafe = listingProblem(fields, body);
  if (unsafe) return { error: unsafe };
  const personal = personalDetails([fields.title ?? '', fields.description ?? '', fields.pickup ?? '', ...(fields.pieces ?? []).map((p) => p.title)].join('\n'));
  if (personal) return { error: personal };
  return { fields };
}

const ALL_RULES = SAFETY_RULES.map((r) => r.key);
/** Why a listing can't be posted (see junkSafety.ts), or null. Names, tags and the phone's photo labels get every
 *  rule; longer text skips plain animal names ("my dog chewed one leg" is fine). */
export function listingProblem(fields: Partial<JunkItem>, body: Body = {}): string | null {
  const strict = [fields.title ?? '', ...(fields.tags ?? []), ...(fields.pieces ?? []).map((p) => p.title)].join(' . ');
  const loose = [fields.description ?? '', fields.pickup ?? '', fields.spot ?? ''].join(' . ');
  const labels = Array.isArray(body.labels)
    ? body.labels
      .filter((l): l is { label: string; confidence: number } => !!l && typeof (l as Body).label === 'string' && typeof (l as Body).confidence === 'number')
      .filter((l) => l.confidence >= LABEL_MIN_CONFIDENCE)
      .slice(0, 40)
      .map((l) => l.label.replace(/_/g, ' '))
      .join(' . ')
    : '';
  const hit = checkText(strict, ALL_RULES)
    || checkText(loose, ALL_RULES.filter((k) => k !== 'animal_names'))
    || (labels ? checkText(labels, LABEL_RULES) : null);
  return hit ? `${hit.reason} If we got this wrong, change the wording and try again.` : null;
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

  /** An open claim as it stands now: ended (and saved) first when the trip rules say so. */
  const liveClaim = async (c: JunkClaim | null): Promise<JunkClaim | null> => {
    if (!c) return null;
    const judged = judgeClaim(c, now);
    if (judged !== c) await store.updateClaim(judged);
    return OPEN_CLAIM.includes(judged.status) ? judged : null;
  };
  /** Open claims on these items as they stand now, by item. */
  const liveClaimsFor = async (itemIds: string[]) => {
    const byItem = new Map<string, JunkClaim[]>();
    if (!itemIds.length) return byItem;
    for (const c of await store.openClaimsForItems(itemIds)) {
      const live = await liveClaim(c);
      if (live) byItem.set(live.itemId, [...(byItem.get(live.itemId) ?? []), live]);
    }
    for (const list of byItem.values()) list.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return byItem;
  };
  const liveClaimsOn = async (itemId: string) => (await liveClaimsFor([itemId])).get(itemId) ?? [];
  const endClaim = async (c: JunkClaim, status: JunkClaim['status'], reason: string) => {
    const ended: JunkClaim = { ...c, status, reason, endedAt: nowIso };
    await store.updateClaim(ended);
    return ended;
  };

  /** Whether `me` may see the listing's private pickup spot: they're on the way, or the poster wrote to them about it. */
  const canSeeSpot = async (item: JunkItem, claims: JunkClaim[]) => {
    if (!me) return false;
    if (me === item.ownerId) return true;
    if (claims.some((c) => c.claimerId === me)) return true;
    return (await store.messagesFor(me, 500)).some((m) => m.itemId === item.id && m.fromId === item.ownerId && m.toId === me);
  };
  const ownerCard = async (ownerId: string): Promise<OwnerCard> => {
    const [m, theirs, partners] = await Promise.all([store.member(ownerId), store.byOwner(ownerId), store.pickupPartners(ownerId)]);
    const since = m?.joinedAt ?? null;
    return {
      since,
      provider: m?.provider ?? null,
      given: theirs.filter((x) => x.status === 'gone').length,
      isNew: !since || now.getTime() - Date.parse(since) < NEW_MEMBER_DAYS * 86_400_000,
      verified: new Set(partners).size >= VERIFIED_PICKUPS,
    };
  };
  // Curbsy signs in with Apple or Google only (both check a phone number). Older GitHub sign-ins keep new-account limits.
  const newAccount = () => crowdedDevice || ctx.userProvider === 'github' || (!!ctx.userCreatedAt && now.getTime() - Date.parse(ctx.userCreatedAt) < NEW_ACCOUNT_HOURS * 3_600_000);

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
    const shown = rows.filter((r) => !hidden.has(r.ownerId)).slice(0, limit);
    const claims = await liveClaimsFor(shown.map((r) => r.id));
    // Items someone is already driving to go after the ones still up for grabs (the order is otherwise kept).
    // First come, first served listings stay where they are.
    const out = shown.map((r) => itemOut(deps, r, me, r.km, claims.get(r.id)));
    const held = (o: typeof out[number]) => !o.firstCome && o.onTheWay > 0 && o.pieces.every((p) => p.gone || p.held);
    return ok([...out.filter((o) => !held(o)), ...out.filter(held)]);
  }

  if (section === 'items' && a && !b && method === 'GET') {
    if (!UUID.test(a)) return notFound;
    const item = await store.getItem(a);
    if (!item || (item.status === 'hidden' && item.ownerId !== me)) return notFound;
    const lat = num(params?.get('lat')), lng = num(params?.get('lng'));
    const km = isLat(lat) && isLng(lng) ? distanceKm(lat, lng, item.lat, item.lng) : undefined;
    const claims = await liveClaimsOn(item.id);
    return ok(itemOut(deps, item, me, km, claims, { spotOk: await canSeeSpot(item, claims), owner: await ownerCard(item.ownerId) }));
  }

  if (section === 'categories' && method === 'GET') return ok({ categories: JUNK_CATEGORIES, conditions: JUNK_CONDITIONS });

  // ---- Everything below needs a sign-in ----
  if (!me) return needSignIn;
  const myName = str(ctx.displayName, 40) || 'Neighbor';
  /** Posting and messaging need the Terms agreed to (App Store guideline 1.2), and no ban. */
  let crowdedDevice = false;
  const gate = async (): Promise<Res | null> => {
    const m = await store.member(me);
    const phone = ctx.deviceId ? await store.seeDevice(me, ctx.deviceId, nowIso, daysAgo(now, 30)) : null;
    crowdedDevice = !!phone && phone.accounts > ACCOUNTS_PER_DEVICE;
    if (m?.bannedAt || phone?.banned) return { status: 403, body: 'Your account can\'t post or send messages on Curbsy after repeated or serious rule breaks. If that\'s a mistake, tap Appeal in the Me tab.' };
    if (!m?.termsAt) return { status: 428, body: 'Please agree to the Curbsy Terms first.' };
    if (ctx.userCreatedAt && (m.joinedAt !== ctx.userCreatedAt || (m.provider ?? null) !== (ctx.userProvider ?? null))) {
      await store.touchMember(me, ctx.userCreatedAt, ctx.userProvider ?? null);
    }
    return null;
  };

  if (section === 'member' && !a && method === 'GET') {
    const m = await store.member(me);
    // A ban that came from a banned phone (another account) shows as banned too.
    const phone = ctx.deviceId ? await store.seeDevice(me, ctx.deviceId, nowIso, daysAgo(now, 30)) : null;
    return ok({
      terms: !!m?.termsAt, banned: !!m?.bannedAt || !!phone?.banned, strikes: m?.strikes ?? 0,
      ...(m?.banReason ? { reason: m.banReason } : {}),
    });
  }
  if (section === 'terms' && !a && method === 'POST') {
    if (body.agree !== true) return bad('Agree to the Terms to continue.');
    await store.acceptTerms(me, nowIso);
    return ok({ terms: true });
  }
  // "Contact Curbsy": questions and complaints for the person running the app (listed by the daily review).
  if (section === 'contact' && !a && method === 'POST') {
    const text = longStr(body.body, 2000);
    if (text.length < 3) return bad('Type a message.');
    if (await store.countFeedbackSince(me, daysAgo(now, 1)) >= FEEDBACK_PER_DAY) {
      return { status: 429, body: 'Thanks, we have your messages. Try again tomorrow if there\'s more.' };
    }
    await store.addFeedback({ id: ctx.newId(), userId: me, userName: myName, body: text, createdAt: nowIso });
    ctx.log.warn(`junk: contact message from ${me}`);
    return ok({ sent: true });
  }
  // Appeal a ban, a warning or a hidden listing ("I was falsely reported"). Works while banned; the daily review lists it.
  if (section === 'appeal' && !a && method === 'POST') {
    const text = longStr(body.body, 2000);
    if (text.length < 3) return bad('Tell us what happened.');
    const itemId = typeof body.itemId === 'string' && UUID.test(body.itemId) ? body.itemId : null;
    if (itemId) {
      const item = await store.getItem(itemId);
      if (!item || item.ownerId !== me) return notFound;
    }
    if (await store.countFeedbackSince(me, daysAgo(now, 1)) >= FEEDBACK_PER_DAY) {
      return { status: 429, body: 'We have your appeal. We\'ll look at it within 24 hours.' };
    }
    await store.addFeedback({ id: ctx.newId(), userId: me, userName: myName, body: text, createdAt: nowIso, kind: 'appeal', itemId });
    ctx.log.warn(`junk: appeal from ${me}`);
    return ok({ sent: true });
  }

  // Learning loop: the phone guessed a name and the person changed it. Saved to retrain the item namer; the
  // picture of just that item comes only when they turned on "Help improve item recognition".
  if (section === 'labels' && !a && method === 'POST') {
    const finalTitle = str(body.title, 60);
    if (!finalTitle) return bad('Name needed.');
    const guess = (body.guess && typeof body.guess === 'object' ? body.guess : {}) as Body;
    const conf = num(guess.confidence);
    let crop: string | null = null;
    if (typeof body.crop === 'string' && body.crop) {
      const raw = body.crop.replace(/^data:image\/jpeg;base64,/, '');
      if (raw.length > MAX_CROP_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(raw) || !raw.startsWith('/9j/')) return bad('Send the picture as a small JPEG.');
      crop = raw;
    }
    if (listingProblem({ title: finalTitle })) return ok({ saved: false });
    if (await store.countLabelFixesSince(me, daysAgo(now, 1)) >= LABEL_FIXES_PER_DAY) return ok({ saved: false });
    await store.addLabelFix({
      id: ctx.newId(), userId: me, app: body.app === 'totetrack' ? 'totetrack' : 'curbsy',
      guessLabel: str(guess.label, 80), guessTitle: str(guess.title, 60), guessSource: str(guess.source, 20),
      guessConfidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null,
      finalTitle, finalCategory: str(body.category, 30), crop, createdAt: nowIso,
    });
    return ok({ saved: true });
  }

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
    const stop = await gate();
    if (stop) return stop;
    if (await store.countItemsSince(me, daysAgo(now, 1)) >= (newAccount() ? NEW_ITEMS_PER_DAY : ITEMS_PER_DAY)) {
      return { status: 429, body: 'You\'ve posted a lot today. Try again tomorrow.' };
    }
    const read = readFields(body, me, null);
    if ('error' in read) return bad(read.error);
    const f = read.fields;
    const item: JunkItem = {
      id: ctx.newId(), ownerId: me, ownerName: myName,
      title: f.title!, description: f.description!, category: f.category!, tags: f.tags!, condition: f.condition!,
      pickup: f.pickup!, photos: f.photos!, lat: f.lat!, lng: f.lng!, aiDetected: f.aiDetected!, firstCome: f.firstCome!,
      pieces: f.pieces ?? [], spot: f.spot ?? '', handoff: f.handoff ?? 'porch',
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
      for (const open of await store.openClaimsForItems([item.id])) await endClaim(open, 'item_gone', 'The poster took the listing down.');
      await store.deleteItem(item.id);
      await photos.remove(item.photos).catch((error) => ctx.log.warn('junk: photo cleanup failed', error));
      return ok({ deleted: true });
    }
    const read = readFields(body, me, item);
    if ('error' in read) return bad(read.error);
    const next: JunkItem = { ...item, ...read.fields, ownerName: myName, updatedAt: nowIso };
    // A multi-item post is taken once everything in it is; marking something back up reopens it.
    if (next.pieces?.length && next.status !== 'hidden') {
      if (next.pieces.every((p) => p.gone)) next.status = 'gone';
      else if (item.status === 'gone' && !('status' in body)) next.status = 'available';
    }
    next.searchText = searchTextOf(next);
    await store.putItem(next);
    const dropped = item.photos.filter((p) => !next.photos.includes(p));
    if (dropped.length) await photos.remove(dropped).catch((error) => ctx.log.warn('junk: photo cleanup failed', error));
    let claims = await liveClaimsOn(item.id);
    if (claims.length && next.status === 'gone') {
      for (const c of claims) await endClaim(c, 'item_gone', 'The poster marked it taken.');
      claims = [];
    }
    // Trips for things the poster just marked taken end too.
    const gone = new Set((next.pieces ?? []).filter((p) => p.gone).map((p) => p.id));
    for (const c of claims) {
      if (c.pieceIds?.length && c.pieceIds.every((id) => gone.has(id))) await endClaim(c, 'item_gone', 'The poster marked it taken.');
    }
    if (gone.size) claims = await liveClaimsOn(item.id);
    return ok(itemOut(deps, next, me, undefined, claims));
  }

  // ---- "I'm on my way": claim an item while you drive over; the trip is tracked ----
  if (section === 'items' && a && b === 'claim' && method === 'POST') {
    if (!UUID.test(a)) return notFound;
    const stop = await gate();
    if (stop) return stop;
    const item = await store.getItem(a);
    if (!item || item.status === 'hidden') return notFound;
    if (item.ownerId === me) return bad('That\'s your own listing.');
    if (item.status === 'gone') return { status: 409, body: 'Someone already took it.' };
    if (item.status === 'pending') return { status: 409, body: 'The poster has it on hold for someone. Message them to ask.' };
    const here = readSpot(body);
    if (!here) return bad('Turn on location so the poster can see you\'re on the way.');
    const km = distanceKm(here.lat, here.lng, item.lat, item.lng);
    if (km > MAX_CLAIM_KM) return bad('That\'s too far away to claim. Get a little closer first.');
    if ((await store.blocked(item.ownerId)).includes(me) || (await store.blocked(me)).includes(item.ownerId)) {
      return { status: 403, body: 'You can\'t claim this person\'s items.' };
    }
    const latest = await store.latestClaimForUser(me);
    const mine = latest && OPEN_CLAIM.includes(latest.status) ? await liveClaim(latest) : null;
    if (mine && mine.itemId === item.id) return ok({ claim: claimOut(mine, me) });
    if (mine) return { status: 409, body: 'You\'re already on your way to something. Finish or cancel that trip first.' };
    // A multi-item post: the trip is for some of the things in it ("pieces"), or all that are still up for grabs.
    const bundle = (item.pieces ?? []).length > 0;
    let pieceIds: string[] = [];
    if (bundle) {
      const others = (await liveClaimsOn(item.id)).filter((c) => c.claimerId !== me);
      const held = item.firstCome ? new Set<string>() : heldPieces(item, others);
      const free = item.pieces.filter((p) => !p.gone && !held.has(p.id)).map((p) => p.id);
      const asked = Array.isArray(body.pieces) ? body.pieces.filter((x): x is string => typeof x === 'string') : null;
      pieceIds = asked ? free.filter((id) => asked.includes(id)) : free;
      if (!pieceIds.length) return { status: 409, body: asked ? 'Someone else is already on the way for that.' : 'Everything here is spoken for.' };
      if (asked && pieceIds.length < new Set(asked).size) return { status: 409, body: 'Someone else is already on the way for some of that. Take another look.' };
    } else if (!item.firstCome && (await liveClaimsOn(item.id)).length) {
      return { status: 409, body: 'Someone else is already on the way.' };
    }
    const last = await store.lastEndedClaim(me, item.id);
    if (last && last.status !== 'cancelled' && last.endedAt && now.getTime() - Date.parse(last.endedAt) < RECLAIM_COOLDOWN_MIN * 60_000) {
      return { status: 429, body: 'Your last claim on this was released. Give others a chance for a bit, or message the poster.' };
    }
    if (await store.countClaimsSince(me, daysAgo(now, 1)) >= (newAccount() ? NEW_CLAIMS_PER_DAY : CLAIMS_PER_DAY)) {
      return { status: 429, body: 'That\'s a lot of trips today. Try again tomorrow.' };
    }
    const claim = newClaim({ id: ctx.newId(), itemId: item.id, ownerId: item.ownerId, claimerId: me, claimerName: myName, km, now, shared: !!item.firstCome || bundle, pieceIds });
    if (!await store.insertClaim(claim)) return { status: 409, body: 'Someone else just claimed it.' };
    // Let the poster know in the item's chat.
    await store.addMessage({
      id: ctx.newId(), itemId: item.id, fromId: me, toId: item.ownerId, fromName: myName, createdAt: nowIso, readAt: null,
      body: (() => {
        const what = bundle && pieceIds.length < item.pieces.filter((p) => !p.gone).length
          ? item.pieces.filter((p) => pieceIds.includes(p.id)).map((p) => p.title).join(', ')
          : bundle ? 'all of it' : 'this';
        return claim.status === 'arrived'
          ? `I'm here to pick up ${what}! (sent by Curbsy)`
          : `I'm on my way to pick up ${what}, about ${etaMinutes(km)} min out. (sent by Curbsy)`;
      })(),
    }).catch((error) => ctx.log.warn('junk: claim message failed', error));
    return ok({ claim: claimOut(claim, me) });
  }

  if (section === 'items' && a && b === 'release' && method === 'POST') {
    if (!UUID.test(a)) return notFound;
    const item = await store.getItem(a);
    if (!item) return notFound;
    if (item.ownerId !== me) return { status: 403, body: 'Only the person who posted it can release a claim.' };
    // One person's claim (claimId), or everyone's.
    const which = str(body.claimId, 64);
    const claims = await liveClaimsOn(item.id);
    for (const c of claims) {
      if (!which || c.id === which) await endClaim(c, 'owner_released', 'The poster released your claim.');
    }
    return ok(itemOut(deps, item, me, undefined, await liveClaimsOn(item.id)));
  }

  if (section === 'claim' && !a && method === 'GET') {
    let claim = await store.latestClaimForUser(me);
    if (claim && OPEN_CLAIM.includes(claim.status)) {
      const judged = judgeClaim(claim, now);
      if (judged !== claim) await store.updateClaim(judged);
      claim = judged;
    }
    const item = claim ? await store.getItem(claim.itemId) : null;
    if (claim && OPEN_CLAIM.includes(claim.status) && (!item || item.status === 'gone' || item.status === 'hidden')) {
      claim = await endClaim(claim, 'item_gone', 'The item isn\'t available anymore.');
    }
    // Ended claims are shown for an hour so the claimer learns why.
    if (!claim || (claim.endedAt && now.getTime() - Date.parse(claim.endedAt) > 3_600_000)) return ok({ claim: null });
    return ok({ claim: claimOut(claim, me), item: item && item.status !== 'hidden' ? itemOut(deps, item, me) : null });
  }

  if (section === 'claim' && a && method === 'POST') {
    const latest = await store.latestClaimForUser(me);
    const open = latest && OPEN_CLAIM.includes(latest.status) ? latest : null;
    if (a === 'ping') {
      if (!open) return ok({ claim: latest ? claimOut(latest, me) : null, tracking: false });
      const item = await store.getItem(open.itemId);
      const piecesGone = !!open.pieceIds?.length && !!item?.pieces?.length
        && open.pieceIds.every((id) => item.pieces.find((p) => p.id === id)?.gone !== false);
      if (!item || item.status === 'gone' || item.status === 'hidden' || piecesGone) {
        const ended = await endClaim(open, 'item_gone', piecesGone ? 'Someone else got there first.' : 'The item isn\'t available anymore.');
        return ok({ claim: claimOut(ended, me), tracking: false });
      }
      const here = readSpot(body);
      if (!here) return bad('Location missing.');
      const next = pingClaim(open, distanceKm(here.lat, here.lng, item.lat, item.lng), now);
      await store.updateClaim(next);
      return ok({ claim: claimOut(next, me), tracking: OPEN_CLAIM.includes(next.status) });
    }
    if (a === 'cancel') {
      if (!open) return ok({ claim: null });
      const ended = await endClaim(open, 'cancelled', 'You cancelled the trip.');
      await store.addMessage({
        id: ctx.newId(), itemId: open.itemId, fromId: me, toId: open.ownerId, fromName: myName, createdAt: nowIso, readAt: null,
        body: 'Change of plans, I\'m not coming for this after all. (sent by Curbsy)',
      }).catch((error) => ctx.log.warn('junk: claim message failed', error));
      return ok({ claim: claimOut(ended, me) });
    }
    if (a === 'done') {
      const live = open ? await liveClaim(open) : null;
      if (!live) return { status: 409, body: 'Your claim already ended.' };
      if (live.status !== 'arrived' && live.lastKm > 0.6) return bad('Tap "Got it" once you\'re there.');
      const ended = await endClaim(live, 'picked_up', 'Picked up. Enjoy!');
      // A first come, first served pile stays up for the next person; the poster takes it down when it's empty.
      // On a multi-item post only the things this trip was for are taken; the post goes once all of it has.
      const item = await store.getItem(live.itemId);
      if (item && item.status !== 'hidden' && item.pieces?.length) {
        const took = new Set(live.pieceIds?.length ? live.pieceIds : item.pieces.map((p) => p.id));
        const pieces = item.pieces.map((p) => (took.has(p.id) ? { ...p, gone: true } : p));
        const next: JunkItem = { ...item, pieces, status: pieces.every((p) => p.gone) ? 'gone' : item.status, updatedAt: nowIso };
        next.searchText = searchTextOf(next);
        await store.putItem(next);
      } else if (item && item.status !== 'hidden' && !item.firstCome) {
        await store.putItem({ ...item, status: 'gone', updatedAt: nowIso });
      }
      return ok({ claim: claimOut(ended, me) });
    }
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
        messages: msgs.map((m) => ({ id: m.id, body: m.body, mine: m.fromId === me, createdAt: m.createdAt, ...(hasContactDetails(m.body) ? { offApp: true } : {}) })),
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
      const stop = await gate();
      if (stop) return stop;
      const rude = checkText(text, CHAT_RULES);
      if (rude) return bad(rude.reason);
      // Starting a new conversation: a few a day for brand-new accounts, so bots can't message everyone.
      const mine = await store.messagesFor(me, 500);
      if (!mine.some((m) => m.itemId === a && (m.fromId === other || m.toId === other))) {
        const started = new Set<string>();
        const since = daysAgo(now, 1);
        const firsts = new Map<string, JunkMessage>();
        for (const m of mine) firsts.set(`${m.itemId}/${m.fromId === me ? m.toId : m.fromId}`, m); // oldest wins (list is newest first)
        for (const [k, m] of firsts) if (m.fromId === me && m.createdAt >= since) started.add(k);
        if (started.size >= (newAccount() ? NEW_CHATS_PER_DAY : CHATS_PER_DAY)) {
          return { status: 429, body: 'That\'s a lot of new conversations today. Try again tomorrow.' };
        }
      }
      const msg: JunkMessage = { id: ctx.newId(), itemId: a, fromId: me, toId: other, fromName: myName, body: text, createdAt: nowIso, readAt: null };
      await store.addMessage(msg);
      return ok({ id: msg.id, body: msg.body, mine: true, createdAt: msg.createdAt, ...(hasContactDetails(text) ? { offApp: true } : {}) });
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
