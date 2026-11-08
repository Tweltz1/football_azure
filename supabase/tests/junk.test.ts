// Junk App API against in-memory storage: `node --test supabase/tests/junk.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ctx } from '../functions/_shared/handlers.ts';
import {
  cleanDetection, distanceKm, junkRoute, searchWords,
  type JunkDetection, type JunkDeps, type JunkItem, type JunkMessage, type JunkStore,
} from '../functions/_shared/junk.ts';

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
    async deleteUserData(userId) {
      const paths = [...uploads.filter((u) => u.userId === userId).map((u) => u.path)];
      for (const [id, i] of items) if (i.ownerId === userId) items.delete(id);
      for (let k = messages.length - 1; k >= 0; k--) if (messages[k].fromId === userId || messages[k].toId === userId) messages.splice(k, 1);
      return paths;
    },
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
  };
  const call = (who: string | null, method: string, path: string, body?: unknown, query: Record<string, unknown> = {}) => {
    clock += 60_000;
    const ctx = {
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
    return res!.body as { id: string; photos: string[] };
  };
  return { call, post, items, stored, messages, deletedAccounts, tick: (ms: number) => { clock += ms; } };
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
