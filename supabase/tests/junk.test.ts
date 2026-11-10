// Junk App API against in-memory storage: `node --test supabase/tests/junk.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  cleanDetection, distanceKm, junkRoute, searchWords,
  type JunkDetection, type JunkDeps, type JunkItem, type JunkMessage, type JunkStore,
} from '../functions/_shared/junk.ts';
import type { JunkClaim } from '../functions/_shared/junkClaims.ts';
import type { JunkLabelFix } from '../functions/_shared/junk.ts';
import type { JunkPartner, JunkPlus, JunkSaved } from '../functions/_shared/junkPlus.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CARL = '33333333-3333-4333-8333-333333333333';
// Minneapolis, and a spot about 5 km north of it.
const HOME = { lat: 44.9778, lng: -93.265 };
const NORTH = { lat: 45.0228, lng: -93.265 };
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

function world(detection: JunkDetection | null = null) {
  const items = new Map<string, JunkItem>();
  const messages: JunkMessage[] = [];
  const reports = new Set<string>();
  const blocks = new Set<string>();
  const uploads: { userId: string; path: string; at: string }[] = [];
  const stored = new Set<string>();
  const deletedAccounts: string[] = [];
  const claims: JunkClaim[] = [];
  // Everyone in these tests agreed to the Terms already, unless a test says otherwise.
  const members = new Map<string, { termsAt: string | null; bannedAt: string | null; joinedAt?: string | null; provider?: string | null }>(
    [ALICE, BOB, CARL].map((id) => [id, { termsAt: '2026-11-01T00:00:00Z', bannedAt: null }]),
  );
  const feedback: { userId: string; body: string; createdAt: string; kind?: string; itemId?: string | null }[] = [];
  const labelFixes: JunkLabelFix[] = [];
  const devices = new Map<string, { banned: boolean; at: string }>();
  const isOpen = (c: JunkClaim) => c.status === 'active' || c.status === 'arrived';
  const plusRows: JunkPlus[] = [];
  const tips: { transactionId: string; userId: string; productId: string }[] = [];
  const saved: JunkSaved[] = [];
  const tokens: { userId: string; token: string; sandbox: boolean }[] = [];
  const partners: JunkPartner[] = [];
  const taps: { partnerId: string; userId: string | null; itemId: string | null }[] = [];
  const pushed: { tokens: string[]; title: string; body: string; path?: string }[] = [];
  let clock = Date.parse('2026-11-08T15:00:00Z');
  let seq = 0;

  const store: JunkStore = {
    async getItem(id) { const r = items.get(id); return r ? clone(r) : null; },
    async putItem(item) { items.set(item.id, clone(item)); },
    async deleteItem(id) { items.delete(id); },
    async search(q) {
      return [...items.values()]
        .filter((i) => (i.status === 'available' || i.status === 'pending') && i.updatedAt >= q.since)
        .filter((i) => !q.category || i.category === q.category)
        .filter((i) => q.words.every((w) => i.searchText.includes(w)))
        .map((i) => ({ ...clone(i), km: distanceKm(q.lat, q.lng, i.lat, i.lng) }))
        .filter((i) => i.km <= q.km)
        .sort((a, b) => Number(a.status === 'pending') - Number(b.status === 'pending')
          || (q.sort === 'new' ? b.createdAt.localeCompare(a.createdAt) : 0) || a.km - b.km)
        .slice(0, q.limit);
    },
    async byOwner(ownerId) { return [...items.values()].filter((i) => i.ownerId === ownerId).map(clone); },
    async countItemsSince(ownerId, since) { return [...items.values()].filter((i) => i.ownerId === ownerId && i.createdAt >= since).length; },
    async addReport(r) { const k = `${r.itemId}/${r.reporterId}`; if (reports.has(k)) return false; reports.add(k); return true; },
    async block(userId, blockedId) { blocks.add(`${userId}/${blockedId}`); },
    async blocked(userId) { return [...blocks].filter((k) => k.startsWith(`${userId}/`)).map((k) => k.split('/')[1]); },
    async addMessage(m) { messages.push(clone(m)); },
    async messagesFor(userId, limit) {
      return messages.filter((m) => m.fromId === userId || m.toId === userId).slice().reverse().slice(0, limit).map(clone);
    },
    async markRead(userId, itemId, otherId, at) {
      messages.forEach((m) => { if (m.toId === userId && m.itemId === itemId && m.fromId === otherId && !m.readAt) m.readAt = at; });
    },
    async countUploadsSince(userId, since) { return uploads.filter((u) => u.userId === userId && u.at >= since).length; },
    async logUpload(userId, path, at) { uploads.push({ userId, path, at }); },
    async insertClaim(c) {
      if (claims.some((x) => isOpen(x) && ((x.itemId === c.itemId && !x.shared && !c.shared) || x.claimerId === c.claimerId))) return false;
      claims.push(clone(c));
      return true;
    },
    async updateClaim(c) { const k = claims.findIndex((x) => x.id === c.id); if (k >= 0) claims[k] = clone(c); },
    async openClaimsForItems(ids) { return claims.filter((x) => ids.includes(x.itemId) && isOpen(x)).map(clone); },
    async latestClaimForUser(userId) {
      const mine = claims.filter((x) => x.claimerId === userId);
      return mine.length ? clone(mine[mine.length - 1]) : null;
    },
    async countClaimsSince(userId, since) { return claims.filter((x) => x.claimerId === userId && x.createdAt >= since).length; },
    async lastEndedClaim(userId, itemId) {
      const ended = claims.filter((x) => x.claimerId === userId && x.itemId === itemId && x.endedAt);
      return ended.length ? clone(ended[ended.length - 1]) : null;
    },
    async deleteUserData(userId) {
      for (let k = claims.length - 1; k >= 0; k--) if (claims[k].claimerId === userId || claims[k].ownerId === userId) claims.splice(k, 1);
      const paths = [...uploads.filter((u) => u.userId === userId).map((u) => u.path)];
      for (const [id, i] of items) if (i.ownerId === userId) items.delete(id);
      for (let k = messages.length - 1; k >= 0; k--) if (messages[k].fromId === userId || messages[k].toId === userId) messages.splice(k, 1);
      for (let k = labelFixes.length - 1; k >= 0; k--) if (labelFixes[k].userId === userId) labelFixes.splice(k, 1);
      return paths;
    },
    async member(userId) { const m = members.get(userId); return m ? clone(m) : null; },
    async acceptTerms(userId, at) { members.set(userId, { bannedAt: null, ...members.get(userId), termsAt: at }); },
    async seeDevice(userId, deviceId, at, since) {
      devices.set(`${deviceId}/${userId}`, { banned: devices.get(`${deviceId}/${userId}`)?.banned ?? false, at });
      const rows = [...devices].filter(([k]) => k.startsWith(`${deviceId}/`));
      return { banned: rows.some(([, v]) => v.banned), accounts: rows.filter(([, v]) => v.at >= since).length };
    },
    async pickupPartners(userId) {
      return claims.filter((c) => c.status === 'picked_up' && (c.claimerId === userId || c.ownerId === userId))
        .map((c) => (c.ownerId === userId ? c.claimerId : c.ownerId));
    },
    async touchMember(userId, joinedAt, provider) { members.set(userId, { termsAt: null, bannedAt: null, ...members.get(userId), joinedAt, provider } as never); },
    async addFeedback(f) { feedback.push({ userId: f.userId, body: f.body, createdAt: f.createdAt, kind: f.kind ?? 'contact', itemId: f.itemId ?? null }); },
    async countFeedbackSince(userId, since) { return feedback.filter((f) => f.userId === userId && f.createdAt >= since).length; },
    async addLabelFix(f) { labelFixes.push(clone(f)); },
    async countLabelFixesSince(userId, since) { return labelFixes.filter((f) => f.userId === userId && f.createdAt >= since).length; },
    async plusRows(userId) { return plusRows.filter((r) => r.userId === userId).map(clone); },
    async savePlus(row) {
      const k = plusRows.findIndex((r) => r.originalTransactionId === row.originalTransactionId);
      if (k >= 0 && plusRows[k].userId !== row.userId) return 'taken';
      if (k >= 0) plusRows[k] = clone(row); else plusRows.push(clone(row));
      return 'ok';
    },
    async addTip(t) { if (tips.some((x) => x.transactionId === t.transactionId)) return false; tips.push(clone(t)); return true; },
    async countTips(userId) { return tips.filter((t) => t.userId === userId).length; },
    async savedSearches(userId) { return saved.filter((s) => s.userId === userId).map(clone); },
    async addSavedSearch(s) { saved.push(clone(s)); },
    async deleteSavedSearch(userId, id) { const k = saved.findIndex((s) => s.userId === userId && s.id === id); if (k >= 0) saved.splice(k, 1); },
    async seeSavedSearch(userId, id, at) { saved.forEach((s) => { if (s.userId === userId && s.id === id) s.seenAt = at; }); },
    async savedSearchesNear() { return saved.map(clone); },
    async savePushToken(userId, token, sandbox) { const k = tokens.findIndex((t) => t.token === token); if (k >= 0) tokens.splice(k, 1); tokens.push({ userId, token, sandbox }); },
    async pushTokens(userIds) { return tokens.filter((t) => userIds.includes(t.userId)).map(clone); },
    async dropPushTokens(list) { for (let k = tokens.length - 1; k >= 0; k--) if (list.includes(tokens[k].token)) tokens.splice(k, 1); },
    async partnersNear(kind) { return partners.filter((p) => p.kind === kind).map(clone); },
    async getPartner(id) { const p = partners.find((x) => x.id === id); return p ? clone(p) : null; },
    async logPartnerTap(t) { taps.push({ partnerId: t.partnerId, userId: t.userId, itemId: t.itemId }); },
  };
  const deps: JunkDeps = {
    store,
    photos: {
      async put(path) { stored.add(path); },
      async remove(paths) { paths.forEach((p) => stored.delete(p)); },
      url: (path) => `https://cdn.test/${path}`,
    },
    detector: detection ? { async detect() { return detection; } } : null,
    deleteAccount: async (id) => { deletedAccounts.push(id); },
    // Stand-in for Apple's signature check: "signed.<base64 JSON>" passes, anything else is refused.
    verifyPurchase: async (jws) => {
      if (!jws.startsWith('signed.')) throw new Error('not signed by Apple');
      return JSON.parse(Buffer.from(jws.slice(7), 'base64').toString());
    },
    push: {
      async send(targets, note) {
        pushed.push({ tokens: targets.map((t) => t.token), ...note });
        return targets.filter((t) => t.token.startsWith('dead')).map((t) => t.token);
      },
    },
  };
  const joined = new Map<string, string>();
  let phone: string | null = null;
  const providers = new Map<string, string>();
  const call = (who: string | null, method: string, path: string, body?: unknown, query: Record<string, unknown> = {}) => {
    clock += 60_000;
    const ctx = {
      userCreatedAt: who ? joined.get(who) ?? '2026-01-01T00:00:00Z' : null,
      userProvider: who ? providers.get(who) ?? 'apple' : null,
      deviceId: phone,
      userId: who, displayName: who === ALICE ? 'Alice' : who === BOB ? 'Bob' : 'Carl',
      now: () => new Date(clock), newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
      log: { info() {}, warn() {}, error() {} },
    } as unknown as Ctx;
    const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    return junkRoute(ctx, deps, method, path.split('/'), body ?? null, params);
  };
  const post = async (who: string, fields: Record<string, unknown> = {}) => {
    const up = await call(who, 'POST', 'junk/photos', { image: JPEG });
    const res = await call(who, 'POST', 'junk/items', {
      title: 'Oak dresser', description: 'Six drawers, one sticks.', category: 'furniture', tags: ['chest of drawers', 'bedroom'],
      condition: 'good', pickup: 'On the curb', photos: [(up?.body as { path: string }).path], ...HOME, ...fields,
    });
    assert.equal(res?.status, 200, String(res?.body));
    const out = res!.body as { id: string; photos: string[] };
    // Posted a while ago (past Plus members' early look), so everyone can find it.
    const saved = items.get(out.id);
    if (saved && !fields.fresh) saved.createdAt = new Date(Date.parse(saved.createdAt) - 20 * 60_000).toISOString();
    return out;
  };
  return { plusRows, tips, saved, tokens, partners, taps, pushed, call, post, items, stored, messages, deletedAccounts, claims, members, feedback, labelFixes, joined, devices, providers, usePhone: (id: string | null) => { phone = id; }, now: () => new Date(clock).toISOString(), tick: (ms: number) => { clock += ms; } };
}

test('ignores routes that are not the Junk App', async () => {
  const { call } = world();
  assert.equal(await call(null, 'GET', 'cards/games'), null);
});

test('posts an item and finds it nearby by search word, but not far away', async () => {
  const w = world();
  const item = await w.post(ALICE);
  assert.match(item.photos[0], /^https:\/\/cdn\.test\/11111111-.*\.jpg$/);

  // Guests can browse.
  let res = await w.call(null, 'GET', 'junk/items', undefined, { ...NORTH, km: 10, q: 'dressers' });
  const list = res?.body as { id: string; km: number; mine: boolean; lat?: number }[];
  assert.equal(list.length, 1);
  assert.ok(list[0].km > 4 && list[0].km < 6, `km ${list[0].km}`);
  assert.equal(list[0].mine, false);
  assert.equal(list[0].lat, undefined, 'location is not shown to others');

  res = await w.call(null, 'GET', 'junk/items', undefined, { ...NORTH, km: 2 });
  assert.equal((res?.body as unknown[]).length, 0);
  res = await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10, q: 'couch' });
  assert.equal((res?.body as unknown[]).length, 0);
  res = await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10, q: 'chest drawers' });
  assert.equal((res?.body as unknown[]).length, 1, 'tags are searchable');
  res = await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10, category: 'tools' });
  assert.equal((res?.body as unknown[]).length, 0);
});

test('rounds the saved location to about 100 m', async () => {
  const w = world();
  const item = await w.post(ALICE, { lat: 44.977812345, lng: -93.265098765 });
  const saved = w.items.get(item.id)!;
  assert.equal(saved.lat, 44.978);
  assert.equal(saved.lng, -93.265);
});

test('posting, photos and messages need a sign-in', async () => {
  const { call } = world();
  assert.equal((await call(null, 'POST', 'junk/photos', { image: JPEG }))?.status, 401);
  assert.equal((await call(null, 'POST', 'junk/items', { title: 'x' }))?.status, 401);
  assert.equal((await call(null, 'GET', 'junk/inbox'))?.status, 401);
});

test('Gemini fills in the item from the first photo, and refuses photos it should', async () => {
  const detection = cleanDetection({ allowed: true, title: 'Wood dresser', category: 'furniture', description: 'A dresser.', tags: ['Dresser', 'bureau'], condition: 'fair' });
  let w = world(detection);
  const res = await w.call(ALICE, 'POST', 'junk/photos', { image: JPEG, detect: true });
  const body = res?.body as { detected: JunkDetection; path: string };
  assert.equal(body.detected.title, 'Wood dresser');
  assert.deepEqual(body.detected.tags, ['dresser', 'bureau']);
  assert.ok(w.stored.has(body.path));

  w = world(cleanDetection({ allowed: false, reason: 'Only items can be posted.', title: '', category: 'other', description: '', tags: [], condition: 'good' }));
  const refused = await w.call(ALICE, 'POST', 'junk/photos', { image: JPEG, detect: true });
  assert.equal(refused?.status, 422);
  assert.equal(refused?.body, 'Only items can be posted.');
  assert.equal(w.stored.size, 0, 'refused photos are not saved');
});

test('rejects photos that are not JPEGs and photos from other people', async () => {
  const w = world();
  assert.equal((await w.call(ALICE, 'POST', 'junk/photos', { image: 'data:image/png;base64,iVBORw0KGgo=' }))?.status, 400);
  const res = await w.call(BOB, 'POST', 'junk/items', { title: 'Chair', photos: [`${ALICE}/00000000-0000-4000-8000-000000000001.jpg`], ...HOME });
  assert.equal(res?.status, 400);
});

test('only the owner can edit, mark taken, or delete; deleting removes photos', async () => {
  const w = world();
  const item = await w.post(ALICE);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}`, { status: 'gone' }))?.status, 403);
  let res = await w.call(ALICE, 'POST', `junk/items/${item.id}`, { status: 'gone', title: 'Oak dresser (taken)' });
  assert.equal((res?.body as { status: string }).status, 'gone');
  res = await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10 });
  assert.equal((res?.body as unknown[]).length, 0, 'taken items leave the feed');

  assert.equal(w.stored.size, 1);
  assert.equal((await w.call(ALICE, 'DELETE', `junk/items/${item.id}`))?.status, 200);
  assert.equal(w.stored.size, 0);
  assert.equal((await w.call(null, 'GET', `junk/items/${item.id}`))?.status, 404);
});

test('three reports hide a listing', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/report`, { reason: 'spam' });
  await w.call(BOB, 'POST', `junk/items/${item.id}/report`, { reason: 'spam again' });
  assert.equal(w.items.get(item.id)!.status, 'available', 'one person counts once');
  await w.call(CARL, 'POST', `junk/items/${item.id}/report`, { reason: 'spam' });
  const dave = '44444444-4444-4444-8444-444444444444';
  await w.call(dave, 'POST', `junk/items/${item.id}/report`, { reason: 'spam' });
  assert.equal(w.items.get(item.id)!.status, 'hidden');
  assert.equal((await w.call(BOB, 'GET', `junk/items/${item.id}`))?.status, 404);
});

test('messages: ask the owner, owner answers, inbox counts unread, blocking hides', async () => {
  const w = world();
  const item = await w.post(ALICE);
  // The owner can't start a conversation with a stranger.
  assert.equal((await w.call(ALICE, 'POST', `junk/chat/${item.id}/${BOB}`, { body: 'hi' }))?.status, 403);
  // Bob can't message Carl about Alice's item.
  assert.equal((await w.call(BOB, 'POST', `junk/chat/${item.id}/${CARL}`, { body: 'hi' }))?.status, 403);

  assert.equal((await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Still there?' }))?.status, 200);
  let inbox = (await w.call(ALICE, 'GET', 'junk/inbox'))?.body as { otherId: string; otherName: string; unread: number; item: { title: string } }[];
  assert.equal(inbox.length, 1);
  assert.deepEqual([inbox[0].otherId, inbox[0].otherName, inbox[0].unread, inbox[0].item.title], [BOB, 'Bob', 1, 'Oak dresser']);

  const chat = (await w.call(ALICE, 'GET', `junk/chat/${item.id}/${BOB}`))?.body as { messages: { body: string; mine: boolean }[] };
  assert.deepEqual(chat.messages.map((m) => [m.body, m.mine]), [['Still there?', false]]);
  inbox = (await w.call(ALICE, 'GET', 'junk/inbox'))?.body as typeof inbox;
  assert.equal(inbox[0].unread, 0, 'opening the chat marks it read');

  assert.equal((await w.call(ALICE, 'POST', `junk/chat/${item.id}/${BOB}`, { body: 'Yes! Grab it anytime.' }))?.status, 200);

  await w.call(ALICE, 'POST', 'junk/block', { userId: BOB });
  inbox = (await w.call(ALICE, 'GET', 'junk/inbox'))?.body as typeof inbox;
  assert.equal(inbox.length, 0);
  assert.equal((await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'hello?' }))?.status, 403);
  const feed = (await w.call(ALICE, 'GET', 'junk/items', undefined, { ...HOME, km: 10 }))?.body as unknown[];
  assert.equal(feed.length, 1, 'your own items still show');
});

test('blocked people\'s listings drop out of your feed', async () => {
  const w = world();
  await w.post(ALICE);
  await w.call(BOB, 'POST', 'junk/block', { userId: ALICE });
  const feed = (await w.call(BOB, 'GET', 'junk/items', undefined, { ...HOME, km: 10 }))?.body as unknown[];
  assert.equal(feed.length, 0);
});

test('old listings fall out of the feed', async () => {
  const w = world();
  await w.post(ALICE);
  w.tick(46 * 86_400_000);
  const feed = (await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10 }))?.body as unknown[];
  assert.equal(feed.length, 0);
});

test('deleting the account removes listings, photos and messages', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'hi' });
  assert.equal((await w.call(ALICE, 'DELETE', 'junk/account'))?.status, 200);
  assert.equal(w.items.size, 0);
  assert.equal(w.stored.size, 0);
  assert.equal(w.messages.length, 0);
  assert.deepEqual(w.deletedAccounts, [ALICE]);
});

test('search words drop wildcards and plurals', () => {
  assert.deepEqual(searchWords('Dressers %_ and  TABLES!'), ['dresser', 'table']);
  assert.deepEqual(searchWords('glass'), ['glass']);
  assert.deepEqual(searchWords('I want to find a free dresser'), ['dresser']);
});

// ---- "I'm on my way" claims ----

// Points due north of HOME, `km` away (1 degree of latitude is about 111.2 km).
const north = (km: number) => ({ lat: HOME.lat + km / 111.2, lng: HOME.lng });
type ClaimOut = { state: string; open: boolean; etaMin: number; mine: boolean; reason?: string; km?: number; claimerName?: string; trend?: string };
const MIN = 60_000;

test('claiming: the item shows as on the way, the poster gets a message, others cannot claim it', async () => {
  const w = world();
  const item = await w.post(ALICE);
  assert.equal((await w.call(null, 'POST', `junk/items/${item.id}/claim`, north(5)))?.status, 401);
  assert.equal((await w.call(ALICE, 'POST', `junk/items/${item.id}/claim`, north(5)))?.status, 400, 'not your own');
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, {}))?.status, 400, 'needs a location');

  const res = await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(5));
  assert.equal(res?.status, 200, String(res?.body));
  const claim = (res?.body as { claim: ClaimOut }).claim;
  assert.deepEqual([claim.state, claim.mine, claim.etaMin], ['active', true, 8]);

  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(1)))?.status, 409);
  const seen = (await w.call(CARL, 'GET', `junk/items/${item.id}`))?.body as { claim: ClaimOut & { claimerName?: string } };
  assert.equal(seen.claim.state, 'active');
  assert.equal(seen.claim.claimerName, undefined, 'strangers do not see who');
  assert.equal(seen.claim.km, undefined);

  const owner = (await w.call(ALICE, 'GET', `junk/items/${item.id}`))?.body as { claim: ClaimOut };
  assert.equal(owner.claim.claimerName, 'Bob');
  assert.equal(owner.claim.km, 5);
  assert.match(w.messages[0].body, /on my way/);
  assert.equal(w.messages[0].toId, ALICE);

  // Items someone is driving to go after the rest of the feed.
  const other = await w.post(CARL, { title: 'Bike' , lat: north(3).lat });
  const feed = (await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10 }))?.body as { id: string; claim: ClaimOut | null }[];
  assert.deepEqual(feed.map((f) => f.id), [other.id, item.id]);
  assert.equal(feed[1].claim?.state, 'active');
});

test('claiming: one trip at a time', async () => {
  const w = world();
  const a = await w.post(ALICE);
  const b = await w.post(CARL);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${a.id}/claim`, north(5)))?.status, 200);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${b.id}/claim`, north(5)))?.status, 409);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${a.id}/claim`, north(5)))?.status, 200, 'claiming again is a no-op');
  assert.equal(w.claims.length, 1);
});

test('driving toward it: closer and closer, then arrive and tap Got it', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(8));
  for (const km of [7, 5.5, 4, 2.5, 1]) {
    w.tick(2 * MIN);
    const r = (await w.call(BOB, 'POST', 'junk/claim/ping', north(km)))?.body as { claim: ClaimOut; tracking: boolean };
    assert.equal(r.tracking, true, `still tracking at ${km} km`);
    assert.equal(r.claim.trend, 'closer');
  }
  assert.equal((await w.call(BOB, 'POST', 'junk/claim/done'))?.status, 400, 'not there yet');
  w.tick(2 * MIN);
  const r = (await w.call(BOB, 'POST', 'junk/claim/ping', north(0.1)))?.body as { claim: ClaimOut };
  assert.equal(r.claim.state, 'arrived');
  const done = (await w.call(BOB, 'POST', 'junk/claim/done'))?.body as { claim: ClaimOut };
  assert.equal(done.claim.state, 'picked_up');
  assert.equal(w.items.get(item.id)!.status, 'gone');
});

test('heading the other way releases the claim', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(4));
  w.tick(MIN);
  await w.call(BOB, 'POST', 'junk/claim/ping', north(4.5));
  w.tick(MIN);
  let r = (await w.call(BOB, 'POST', 'junk/claim/ping', north(5.5)))?.body as { claim: ClaimOut; tracking: boolean };
  assert.equal(r.tracking, true, 'no judging in the first few minutes');
  w.tick(3 * MIN);
  r = (await w.call(BOB, 'POST', 'junk/claim/ping', north(6.5)))?.body as typeof r;
  assert.equal(r.tracking, false);
  assert.equal(r.claim.state, 'released');
  assert.match(r.claim.reason!, /heading away/);
  const seen = (await w.call(CARL, 'GET', `junk/items/${item.id}`))?.body as { claim: unknown };
  assert.equal(seen.claim, null, 'up for grabs again');
  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(1)))?.status, 200);
});

test('not getting closer releases the claim', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(5));
  for (let k = 0; k < 6; k++) {
    w.tick(2 * MIN);
    await w.call(BOB, 'POST', 'junk/claim/ping', north(5.1));
  }
  w.tick(2 * MIN);
  const r = (await w.call(BOB, 'POST', 'junk/claim/ping', north(5)))?.body as { claim: ClaimOut; tracking: boolean };
  assert.equal(r.claim.state, 'released');
  assert.match(r.claim.reason!, /closer/);
});

test('no location from the phone releases the claim, even if nobody pings', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(5));
  w.tick(13 * MIN);
  const seen = (await w.call(CARL, 'GET', `junk/items/${item.id}`))?.body as { claim: unknown };
  assert.equal(seen.claim, null);
  const mine = (await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'released');
  assert.match(mine.claim.reason!, /location/);
  // A released claimer waits before claiming the same item again.
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(1)))?.status, 429);
  w.tick(31 * MIN);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(1)))?.status, 200);
});

test('a slow trip is released at the deadline, an arrival without pickup after the window', async () => {
  let w = world();
  let item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(2)); // 21 minutes allowed
  for (const km of [1.7, 1.4, 1.1, 0.8, 0.55, 0.32]) {
    w.tick(4 * MIN);
    await w.call(BOB, 'POST', 'junk/claim/ping', north(km));
  }
  let mine = (await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'released');
  assert.match(mine.claim.reason!, /too long/);

  w = world();
  item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(0.1));
  mine = (await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'arrived');
  w.tick(46 * MIN);
  mine = (await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'released');
});

test('the poster can release a claim; cancelling tells the poster; marking taken ends it', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(5));
  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/release`))?.status, 403);
  await w.call(ALICE, 'POST', `junk/items/${item.id}/release`);
  let mine = (await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'owner_released');

  await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(3));
  await w.call(CARL, 'POST', 'junk/claim/cancel');
  assert.match(w.messages[w.messages.length - 1].body, /not coming/);
  mine = (await w.call(CARL, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'cancelled');
  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(3)))?.status, 200, 'no wait after cancelling yourself');

  await w.call(ALICE, 'POST', `junk/items/${item.id}`, { status: 'gone' });
  mine = (await w.call(CARL, 'GET', 'junk/claim'))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.state, 'item_gone');
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(3)))?.status, 409, 'taken items cannot be claimed');
});

test('ended claims stop showing to the claimer after an hour', async () => {
  const w = world();
  const item = await w.post(ALICE);
  await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(5));
  await w.call(BOB, 'POST', 'junk/claim/cancel');
  w.tick(61 * MIN);
  assert.equal(((await w.call(BOB, 'GET', 'junk/claim'))?.body as { claim: unknown }).claim, null);
});

test('first come, first served: several people can be on the way, the listing stays up', async () => {
  const w = world();
  const item = await w.post(ALICE, { firstCome: true });
  assert.equal(w.items.get(item.id)!.firstCome, true);
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, north(3)))?.status, 200);
  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(2)))?.status, 200);

  const dave = '44444444-4444-4444-8444-444444444444';
  const seen = (await w.call(dave, 'GET', `junk/items/${item.id}`))?.body as { claim: unknown; onTheWay: number; firstCome: boolean };
  assert.deepEqual([seen.claim, seen.onTheWay, seen.firstCome], [null, 2, true]);
  const mine = (await w.call(BOB, 'GET', `junk/items/${item.id}`))?.body as { claim: ClaimOut };
  assert.equal(mine.claim.mine, true);
  const owner = (await w.call(ALICE, 'GET', `junk/items/${item.id}`))?.body as { claimers: (ClaimOut & { id: string; claimerName: string })[] };
  assert.deepEqual(owner.claimers.map((c) => c.claimerName), ['Bob', 'Carl']);

  // Shown in place in the feed, not pushed to the end.
  const other = await w.post(CARL, { title: 'Bike', lat: north(3).lat });
  const feed = (await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10 }))?.body as { id: string }[];
  assert.deepEqual(feed.map((f) => f.id), [item.id, other.id]);

  // Picking some up doesn't take the pile down.
  w.tick(2 * MIN);
  await w.call(BOB, 'POST', 'junk/claim/ping', north(0.1));
  assert.equal(((await w.call(BOB, 'POST', 'junk/claim/done'))?.body as { claim: ClaimOut }).claim.state, 'picked_up');
  assert.equal(w.items.get(item.id)!.status, 'available');

  // The poster can cancel one person's claim.
  await w.call(ALICE, 'POST', `junk/items/${item.id}/release`, { claimId: owner.claimers[1].id });
  assert.equal(((await w.call(CARL, 'GET', 'junk/claim'))?.body as { claim: ClaimOut }).claim.state, 'owner_released');
});

test('multi-item post: claim some things or take it all, each is taken on its own, the post goes when all are', async () => {
  const w = world();
  const item = await w.post(ALICE, {
    title: '', category: undefined,
    pieces: [{ title: 'Chair', category: 'furniture', box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }, { title: 'Lamp', category: 'home' }, { title: 'Box fan', category: 'appliances' }, { title: 'x' }],
  });
  type Piece = { id: string; title: string; gone: boolean; held: boolean; mine: boolean; box: unknown };
  type Out = { title: string; category: string; status: string; pieces: Piece[]; claim: ClaimOut | null; onTheWay: number };
  const saved = w.items.get(item.id)!;
  assert.equal(saved.title, 'Chair, lamp and box fan');
  assert.equal(saved.category, 'furniture');
  assert.deepEqual(saved.pieces.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(saved.pieces[0].box, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assert.match(saved.searchText, /box fan/);
  // Found by a word from any thing in it.
  const found = (await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 10, q: 'lamp' }))?.body as { id: string }[];
  assert.deepEqual(found.map((f) => f.id), [item.id]);

  // Bob heads over for the lamp only; Carl can still come for the rest, but not the lamp.
  assert.equal((await w.call(BOB, 'POST', `junk/items/${item.id}/claim`, { ...north(3), pieces: ['p2'] }))?.status, 200);
  assert.match(w.messages.at(-1)!.body, /pick up Lamp,/);
  assert.equal((await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, { ...north(2), pieces: ['p2'] }))?.status, 409);
  const carl = await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, north(2)); // "Take it all" = everything left
  assert.equal(carl?.status, 200);
  assert.deepEqual((carl?.body as { claim: ClaimOut & { pieceIds: string[] } }).claim.pieceIds, ['p1', 'p3']);
  const dave = '44444444-4444-4444-8444-444444444444';
  w.members.set(dave, { termsAt: '2026-11-01T00:00:00Z', bannedAt: null });
  assert.equal((await w.call(dave, 'POST', `junk/items/${item.id}/claim`, north(2)))?.status, 409);
  const seen = (await w.call(BOB, 'GET', `junk/items/${item.id}`))?.body as Out;
  assert.deepEqual(seen.pieces.map((p) => [p.held, p.mine]), [[true, false], [true, true], [true, false]]);
  assert.equal(seen.onTheWay, 2);
  assert.equal(seen.claim?.mine, true);

  // Bob picks up the lamp: just the lamp is taken.
  w.tick(2 * MIN);
  await w.call(BOB, 'POST', 'junk/claim/ping', north(0.1));
  await w.call(BOB, 'POST', 'junk/claim/done');
  let now = w.items.get(item.id)!;
  assert.deepEqual([now.status, now.pieces.map((p) => p.gone)], ['available', [false, true, false]]);

  // The poster marks the fan taken by hand; Carl's trip for chair and fan keeps going.
  const edit = await w.call(ALICE, 'POST', `junk/items/${item.id}`, { pieces: now.pieces.map((p) => (p.id === 'p3' ? { ...p, gone: true } : p)) });
  assert.equal(edit?.status, 200);
  assert.equal(((await w.call(CARL, 'GET', 'junk/claim'))?.body as { claim: ClaimOut }).claim.state, 'active');

  // Carl gets the chair: everything is gone, so the post is.
  await w.call(CARL, 'POST', 'junk/claim/ping', north(0.1));
  await w.call(CARL, 'POST', 'junk/claim/done');
  now = w.items.get(item.id)!;
  assert.deepEqual([now.status, now.pieces.every((p) => p.gone)], ['gone', true]);
});

test('refuses listings for things that can\'t be given away, and lets lookalikes through', async () => {
  const w = world();
  const refused = async (fields: Record<string, unknown>, why: RegExp) => {
    const up = await w.call(ALICE, 'POST', 'junk/photos', { image: JPEG });
    const res = await w.call(ALICE, 'POST', 'junk/items', {
      title: 'Thing', description: '', category: 'other', tags: [], pickup: '', photos: [(up?.body as { path: string }).path], ...HOME, ...fields,
    });
    assert.equal(res?.status, 400, JSON.stringify(fields));
    assert.match(String(res?.body), why);
  };
  await refused({ title: 'Hunting rifle' }, /Weapons/);
  await refused({ title: 'Old dresser', description: 'Also have some w33d edibles' }, /Drugs/);
  await refused({ title: 'Free puppies' }, /Live animals/);
  await refused({ title: 'Kitchen stuff', tags: ['vape'] }, /Tobacco/);
  await refused({ title: 'Box of stuff', pieces: [{ title: 'Lamp' }, { title: 'Case of beer' }] }, /Alcohol/);
  await refused({ title: 'Drop side crib' }, /Recalled/);
  await refused({ title: 'Couch', labels: [{ label: 'handgun', confidence: 0.9 }] }, /Weapons/);

  for (const title of ['Hot glue gun', 'Dog crate', 'Wine rack', 'Weed eater', 'Medicine cabinet', 'Nerf gun blaster', 'Fish tank', 'Cat5 cable', 'Drain snake']) {
    await w.post(ALICE, { title });
  }
  // A dog in the description, or a low-confidence photo label, is fine.
  await w.post(ALICE, { title: 'Recliner', description: 'My dog chewed one corner.', labels: [{ label: 'gun', confidence: 0.1 }] });

  // Editing a listing is checked too.
  const item = await w.post(ALICE);
  const res = await w.call(ALICE, 'POST', `junk/items/${item.id}`, { title: 'Pistol' });
  assert.equal(res?.status, 400);
});

test('posting and messaging need the Terms agreed to, and banned people can\'t do either', async () => {
  const w = world();
  w.members.delete(BOB);
  let res = await w.call(BOB, 'GET', 'junk/member');
  assert.deepEqual(res?.body, { terms: false, banned: false, strikes: 0 });
  res = await w.call(BOB, 'POST', 'junk/items', { title: 'Lamp', photos: [], ...HOME });
  assert.equal(res?.status, 428);
  const item = await w.post(ALICE);
  res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Still there?' });
  assert.equal(res?.status, 428);

  res = await w.call(BOB, 'POST', 'junk/terms', { agree: true });
  assert.equal(res?.status, 200);
  res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Still there?' });
  assert.equal(res?.status, 200);
  // Slurs don't go through in chat.
  res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'you r3tard' });
  assert.equal(res?.status, 400);

  w.members.set(BOB, { termsAt: '2026-11-01T00:00:00Z', bannedAt: '2026-11-08T00:00:00Z' });
  res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Hello?' });
  assert.equal(res?.status, 403);
  res = await w.call(BOB, 'GET', 'junk/member');
  assert.deepEqual(res?.body, { terms: true, banned: true, strikes: 0 });
});

test('Contact Curbsy saves the message, a few a day', async () => {
  const w = world();
  for (let k = 0; k < 5; k++) assert.equal((await w.call(BOB, 'POST', 'junk/contact', { body: `Problem ${k}` }))?.status, 200);
  assert.equal((await w.call(BOB, 'POST', 'junk/contact', { body: 'One more' }))?.status, 429);
  assert.equal(w.feedback.length, 5);
  assert.equal((await w.call(null, 'POST', 'junk/contact', { body: 'Hi' }))?.status, 401);
});

test('name fixes are saved for retraining, the item picture only when sent, and go with the account', async () => {
  const w = world();
  const guess = { label: 'suitcase', title: 'Suitcase', source: 'detector', confidence: 0.62 };
  assert.equal((await w.call(null, 'POST', 'junk/labels', { guess, title: 'Tape measure' }))?.status, 401);
  assert.equal((await w.call(BOB, 'POST', 'junk/labels', { guess, title: '' }))?.status, 400);
  assert.equal((await w.call(BOB, 'POST', 'junk/labels', { guess, title: 'Tape measure', crop: 'not a jpeg' }))?.status, 400);
  let res = await w.call(BOB, 'POST', 'junk/labels', { guess, title: 'Tape measure', category: 'tools' });
  assert.deepEqual(res?.body, { saved: true });
  res = await w.call(BOB, 'POST', 'junk/labels', { app: 'totetrack', guess, title: 'Box fan', crop: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
  assert.deepEqual(res?.body, { saved: true });
  assert.equal(w.labelFixes.length, 2);
  assert.equal(w.labelFixes[0].crop, null);
  assert.equal(w.labelFixes[0].guessLabel, 'suitcase');
  assert.equal(w.labelFixes[0].finalCategory, 'tools');
  assert.equal(w.labelFixes[1].app, 'totetrack');
  assert.equal(w.labelFixes[1].crop, '/9j/4AAQSkZJRg==');
  await w.call(BOB, 'DELETE', 'junk/account');
  assert.equal(w.labelFixes.length, 0);
});

test('the pickup address stays private until someone is coming, and addresses can\'t go in the public text', async () => {
  const w = world();
  let res = await w.call(ALICE, 'POST', 'junk/items', { title: 'Lamp', pickup: 'At 1234 Maple St, side door', photos: [], ...HOME });
  assert.equal(res?.status, 400);
  assert.match(String(res?.body), /Exact spot/);
  res = await w.call(ALICE, 'POST', 'junk/items', { title: 'Lamp', description: 'Text me 612-555-1234', photos: [], ...HOME });
  assert.equal(res?.status, 400);

  const item = await w.post(ALICE, { spot: '1234 Maple St, side door', handoff: 'porch' });
  const look = async (who: string | null) => (await w.call(who, 'GET', `junk/items/${item.id}`))?.body as Record<string, unknown>;
  assert.equal((await look(ALICE)).spot, '1234 Maple St, side door');
  let bob = await look(BOB);
  assert.equal(bob.spot, undefined);
  assert.equal(bob.lat, undefined);
  assert.equal(bob.hasSpot, true);
  assert.equal(bob.handoff, 'porch');
  assert.equal(JSON.stringify(await w.call(null, 'GET', 'junk/items', undefined, { ...HOME, km: 5 })).includes('Maple'), false);

  // Bob asks; still private until Alice writes back.
  await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Still there?' });
  assert.equal((await look(BOB)).spot, undefined);
  await w.call(ALICE, 'POST', `junk/chat/${item.id}/${BOB}`, { body: 'Yes, come by' });
  bob = await look(BOB);
  assert.equal(bob.spot, '1234 Maple St, side door');
  assert.equal(typeof bob.lat, 'number');

  // Carl sees it once he's on his way.
  assert.equal((await look(CARL)).spot, undefined);
  await w.call(ALICE, 'POST', `junk/items/${item.id}`, { firstCome: true });
  res = await w.call(CARL, 'POST', `junk/items/${item.id}/claim`, NORTH);
  assert.equal(res?.status, 200, String(res?.body));
  assert.equal((await look(CARL)).spot, '1234 Maple St, side door');
});

test('brand-new accounts get tighter limits, and listings show a member card', async () => {
  const w = world();
  w.joined.set(BOB, w.now());
  for (let k = 0; k < 3; k++) await w.post(BOB, { title: `Chair ${k}` });
  const up = await w.call(BOB, 'POST', 'junk/photos', { image: JPEG });
  const res = await w.call(BOB, 'POST', 'junk/items', { title: 'Chair 4', photos: [(up?.body as { path: string }).path], ...HOME });
  assert.equal(res?.status, 429);
  const item = await w.post(ALICE);
  const card = ((await w.call(CARL, 'GET', `junk/items/${item.id}`))?.body as { owner: { provider: string; isNew: boolean; given: number } }).owner;
  assert.equal(card.provider, 'apple');
  assert.equal(card.isNew, false);
  assert.equal(card.given, 0);
  assert.equal((card as { verified?: boolean }).verified, false);
  const bobs = (await w.call(CARL, 'GET', 'junk/mine'))?.body;
  assert.ok(bobs);
});

test('chat refuses money asks and flags phone numbers', async () => {
  const w = world();
  const item = await w.post(ALICE);
  let res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Can I venmo you for it?' });
  assert.equal(res?.status, 400);
  res = await w.call(BOB, 'POST', `junk/chat/${item.id}/${ALICE}`, { body: 'Text me at 612-555-1234' });
  assert.equal(res?.status, 200);
  assert.equal((res?.body as { offApp?: boolean }).offApp, true);
});

test('a banned phone stays banned for new accounts, and a crowded phone gets new-account limits', async () => {
  const w = world();
  const PHONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  w.usePhone(PHONE);
  await w.post(BOB);
  w.devices.set(`${PHONE}/${BOB}`, { banned: true, at: w.now() });
  // Carl (another account) on the same phone can't post.
  const res = await w.call(CARL, 'POST', 'junk/items', { title: 'Lamp', photos: [], ...HOME });
  assert.equal(res?.status, 403);

  const w2 = world();
  w2.usePhone(PHONE);
  for (const id of ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443']) {
    w2.members.set(id, { termsAt: '2026-11-01T00:00:00Z', bannedAt: null });
    await w2.call(id, 'POST', 'junk/items', { title: 'x', photos: [], ...HOME });
  }
  w2.members.set(ALICE, { termsAt: '2026-11-01T00:00:00Z', bannedAt: null });
  for (let k = 0; k < 3; k++) await w2.post(ALICE, { title: `Chair ${k}` });
  const up = await w2.call(ALICE, 'POST', 'junk/photos', { image: JPEG });
  const fourth = await w2.call(ALICE, 'POST', 'junk/items', { title: 'Chair 4', photos: [(up?.body as { path: string }).path], ...HOME });
  assert.equal(fourth?.status, 429);
});

test('banned or warned people can appeal, and see where they stand', async () => {
  const w = world();
  const item = await w.post(BOB);
  w.members.set(BOB, { termsAt: '2026-11-01T00:00:00Z', bannedAt: '2026-11-08T00:00:00Z', strikes: 2, banReason: 'second strike' } as never);
  let res = await w.call(BOB, 'GET', 'junk/member');
  assert.deepEqual(res?.body, { terms: true, banned: true, strikes: 2, reason: 'second strike' });
  // Still allowed while banned.
  res = await w.call(BOB, 'POST', 'junk/appeal', { body: 'That was a toy gun, not a real one.', itemId: item.id });
  assert.equal(res?.status, 200);
  assert.equal(w.feedback[0].kind, 'appeal');
  assert.equal(w.feedback[0].itemId, item.id);
  // Only about your own listing.
  const alices = await w.post(ALICE);
  res = await w.call(BOB, 'POST', 'junk/appeal', { body: 'Please look', itemId: alices.id });
  assert.equal(res?.status, 404);
});

// ---- Curbsy Plus, tips, saved searches, haulers and sponsors (junkPlus.ts) ----

const signed = (t: Record<string, unknown>) => `signed.${Buffer.from(JSON.stringify(t)).toString('base64')}`;
const plusFor = (who: string, extra: Record<string, unknown> = {}) => signed({
  bundleId: 'com.hoodleague.junk', productId: 'com.hoodleague.junk.plus.monthly', transactionId: `t-${who}`, originalTransactionId: `o-${who}`,
  expiresDate: Date.parse('2026-12-08T15:00:00Z'), environment: 'Sandbox', appAccountToken: who, ...extra,
});

test('Curbsy Plus: an Apple-signed subscription for this account unlocks it; fakes and other accounts do not', async () => {
  const w = world();
  let res = await w.call(BOB, 'GET', 'junk/plus');
  assert.deepEqual([(res?.body as { plus: boolean }).plus, (res?.body as { maxMiles: number }).maxMiles], [false, 25]);
  assert.equal((await w.call(null, 'POST', 'junk/purchases', { transactions: [plusFor(BOB)] }))?.status, 401);

  res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: ['forged', plusFor(BOB, { bundleId: 'com.other.app' }), plusFor(ALICE)] });
  assert.equal((res?.body as { plus: boolean }).plus, false, 'forged, wrong app, or bought by another account');
  assert.match((res?.body as { note: string }).note, /different Curbsy account/);

  res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB)] });
  assert.deepEqual([(res?.body as { plus: boolean }).plus, (res?.body as { maxMiles: number }).maxMiles, (res?.body as { savedSearches: number }).savedSearches], [true, 100, 10]);
  // The same Apple subscription can't also unlock a second account.
  res = await w.call(CARL, 'POST', 'junk/purchases', { transactions: [plusFor(CARL, { originalTransactionId: `o-${BOB}` })] });
  assert.equal((res?.body as { plus: boolean }).plus, false);
  // Refunded, or run out.
  w.plusRows.length = 0;
  res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB, { revocationDate: 1 })] });
  assert.equal((res?.body as { plus: boolean }).plus, false);
  res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB, { expiresDate: Date.parse('2026-11-01T00:00:00Z') })] });
  assert.equal((res?.body as { plus: boolean }).plus, false);
});

test('tips are recorded once each', async () => {
  const w = world();
  const tip = signed({ bundleId: 'com.hoodleague.junk', productId: 'com.hoodleague.junk.tip.small', transactionId: 'tip1', appAccountToken: BOB });
  let res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: [tip] });
  assert.deepEqual([(res?.body as { thanks: boolean }).thanks, (res?.body as { tips: number }).tips], [true, 1]);
  res = await w.call(BOB, 'POST', 'junk/purchases', { transactions: [tip] });
  assert.deepEqual([(res?.body as { thanks: boolean }).thanks, (res?.body as { tips: number }).tips], [false, 1]);
});

test('Plus searches up to 100 miles and sees new listings first; everyone else gets 25 miles after 10 minutes', async () => {
  const w = world();
  // About 60 miles north.
  const far = await w.post(ALICE, { title: 'Far table', lat: HOME.lat + 0.87 });
  const fresh = await w.post(ALICE, { title: 'Fresh lamp', fresh: true });
  const ids = async (who: string | null, km: number) => ((await w.call(who, 'GET', 'junk/items', undefined, { ...HOME, km }))?.body as { id: string; early?: boolean }[]);

  assert.deepEqual((await ids(BOB, 160)).map((i) => i.id), [], 'free: 25 miles, and the new lamp is still Plus-only');
  assert.deepEqual((await ids(ALICE, 10)).map((i) => i.id), [fresh.id], 'your own listing always shows');
  await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB)] });
  const plus = await ids(BOB, 160);
  assert.deepEqual(plus.map((i) => i.id), [fresh.id, far.id]);
  assert.equal(plus[0].early, true);
  w.tick(11 * MIN);
  assert.deepEqual((await ids(CARL, 30)).map((i) => i.id), [fresh.id], 'everyone sees it after 10 minutes');
});

test('saved searches: 1 free, 10 with Plus; new matches are counted, and Plus members get an alert', async () => {
  const w = world();
  assert.equal((await w.call(BOB, 'POST', 'junk/searches', { q: '', ...HOME }))?.status, 400);
  assert.equal((await w.call(BOB, 'POST', 'junk/searches', { q: 'dresser', ...HOME, miles: 10 }))?.status, 200);
  assert.equal((await w.call(BOB, 'POST', 'junk/searches', { q: 'dresser', ...HOME }))?.status, 200, 'same search again is fine');
  assert.equal((await w.call(BOB, 'POST', 'junk/searches', { q: 'bike', ...HOME }))?.status, 402, 'free accounts get one');
  await w.call(BOB, 'POST', 'junk/push', { token: 'c'.repeat(64) });
  await w.call(CARL, 'POST', 'junk/searches', { category: 'furniture', ...HOME });
  await w.call(CARL, 'POST', 'junk/push', { token: 'dead'.padEnd(64, 'e') });

  // Bob isn't Plus: no alert, but the match shows as new in the app (after Plus members' early look).
  await w.post(ALICE, { fresh: true });
  assert.equal(w.pushed.length, 0);
  assert.equal(((await w.call(BOB, 'GET', 'junk/searches'))?.body as { newCount: number }[])[0].newCount, 0);
  w.tick(11 * MIN);
  let list = (await w.call(BOB, 'GET', 'junk/searches'))?.body as { id: string; newCount: number; miles: number }[];
  assert.deepEqual([list.length, list[0].newCount, list[0].miles], [1, 1, 10]);
  await w.call(BOB, 'POST', `junk/searches/${list[0].id}/seen`);
  list = (await w.call(BOB, 'GET', 'junk/searches'))?.body as { id: string; newCount: number }[];
  assert.equal(list[0].newCount, 0);

  // With Plus: an alert right away, only for matching listings; tokens Apple refuses are dropped.
  await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB)] });
  await w.call(CARL, 'POST', 'junk/purchases', { transactions: [plusFor(CARL)] });
  assert.equal((await w.call(BOB, 'POST', 'junk/searches', { q: 'bike', ...HOME }))?.status, 200);
  const item = await w.post(ALICE, { title: 'Pine dresser', fresh: true });
  assert.equal(w.pushed.length, 2);
  assert.deepEqual(w.pushed.find((p) => p.tokens[0] === 'c'.repeat(64)), {
    tokens: ['c'.repeat(64)], title: 'Free: Pine dresser', body: 'Right nearby · matches your “dresser” search', path: `/junk/item/${item.id}`,
  });
  assert.equal(w.tokens.some((t) => t.token.startsWith('dead')), false);
  await w.post(ALICE, { title: 'Garden hose', category: 'outdoor', tags: [] });
  assert.equal(w.pushed.length, 2, 'no match, no alert');
  // Not your own listings, and not from someone you blocked.
  await w.call(BOB, 'POST', 'junk/block', { userId: ALICE });
  await w.post(ALICE, { title: 'Bike' });
  assert.equal(w.pushed.length, 2);

  await w.call(BOB, 'DELETE', `junk/searches/${list[0].id}`);
  assert.equal(((await w.call(BOB, 'GET', 'junk/searches'))?.body as unknown[]).length, 1);
});

test('haulers and sponsors: shown by area, taps are logged, and Plus members skip sponsor cards', async () => {
  const w = world();
  const base = { blurb: '', phone: '612-555-0100', url: 'https://example.com', active: true };
  w.partners.push(
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'hauler', name: 'Near Hauling', lat: HOME.lat, lng: HOME.lng, km: 30, ...base },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'hauler', name: 'Far Hauling', lat: 40, lng: -100, km: 30, ...base },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'sponsor', name: 'Thrift Co', lat: HOME.lat, lng: HOME.lng, km: 30, ...base },
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', kind: 'hauler', name: 'Paused', lat: HOME.lat, lng: HOME.lng, km: 30, ...base, active: false },
  );
  const haulers = (await w.call(null, 'GET', 'junk/partners', undefined, { kind: 'hauler', ...NORTH }))?.body as { name: string; km: number }[];
  assert.deepEqual(haulers.map((h) => h.name), ['Near Hauling']);
  assert.equal((await w.call(null, 'GET', 'junk/partners', undefined, { kind: 'nope', ...HOME }))?.status, 400);
  let sponsors = (await w.call(BOB, 'GET', 'junk/partners', undefined, { kind: 'sponsor', ...HOME }))?.body as { name: string }[];
  assert.deepEqual(sponsors.map((s) => s.name), ['Thrift Co']);
  await w.call(BOB, 'POST', 'junk/purchases', { transactions: [plusFor(BOB)] });
  sponsors = (await w.call(BOB, 'GET', 'junk/partners', undefined, { kind: 'sponsor', ...HOME }))?.body as { name: string }[];
  assert.deepEqual(sponsors, []);

  const item = await w.post(ALICE);
  await w.call(ALICE, 'POST', 'junk/partners/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/tap', { itemId: item.id });
  await w.call(null, 'POST', 'junk/partners/cccccccc-cccc-4ccc-8ccc-cccccccccccc/tap');
  assert.deepEqual(w.taps, [
    { partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: ALICE, itemId: item.id },
    { partnerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userId: null, itemId: null },
  ]);
});

test('GitHub sign-ins keep new-account limits (Curbsy is Apple or Google only)', async () => {
  const w = world();
  w.providers.set(CARL, 'github');
  for (let k = 0; k < 3; k++) await w.post(CARL, { title: `Chair ${k}` });
  const up = await w.call(CARL, 'POST', 'junk/photos', { image: JPEG });
  const res = await w.call(CARL, 'POST', 'junk/items', { title: 'Chair 4', photos: [(up?.body as { path: string }).path], ...HOME });
  assert.equal(res?.status, 429);
});
