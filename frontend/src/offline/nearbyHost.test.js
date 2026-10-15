// The commissioner's phone runs the draft for nearby players and keeps every bid sealed.
import axios from 'axios';
import { handle } from './engine.generated';
import { API_BASE_URL } from '../api';
import { writeOfflineLeague } from './storage';
import { connectTransport, startHosting, watchNearby } from './nearbyDraft';
import { fakeTransport, tick } from './nearbyFake.testutil';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    channel: () => { throw new Error('offline leagues must not open a live channel'); },
    removeChannel: () => {},
  },
}));

const players = [
  { id: 'p1', name: 'Josh Allen', position: 'QB', team: 'BUF', rank: 1, bye: 7, isDrafted: false, price: 0 },
  { id: 'p2', name: 'Bijan Robinson', position: 'RB', team: 'ATL', rank: 2, bye: 5, isDrafted: false, price: 0 },
];

// A bidding league with the commissioner and one ready player, built by the server's own handlers.
const makeLeague = async () => {
  const rows = new Map();
  let n = 0;
  const ctxFor = (userId) => ({
    leagues: {
      async get(id) { return rows.get(id) ? JSON.parse(JSON.stringify(rows.get(id))) : null; },
      async getLight(id) { return rows.get(id) ? { ...rows.get(id).league, version: rows.get(id).version } : null; },
      async create(league) { rows.set(league.id, { league, version: 1 }); return 1; },
      async replace(league, expected) { rows.set(league.id, { league, version: expected + 1 }); return expected + 1; },
      async delete() {},
      async findByName() { return null; },
      async listForMember() { return []; },
    },
    profiles: { async find() { return null; }, async upsert() {} },
    history: { async save() {}, async get() { return null; }, async listForMember() { return []; } },
    broadcaster: { async send() {} },
    log: { info() {}, warn() {}, error() {} },
    now: () => new Date(),
    newId: () => `id-${++n}`,
    playerPool: () => JSON.parse(JSON.stringify(players)),
    fetchJson: async () => { throw new Error('no network'); },
    userId,
    displayName: userId,
  });
  const created = await handle(ctxFor('admin'), 'POST', 'CreateLeague', new URLSearchParams(), { name: 'Hood', password: 'pw' });
  const id = created.body.id;
  await handle(ctxFor('u2'), 'POST', 'JoinLeague', new URLSearchParams(), { leagueId: id });
  await handle(ctxFor('u2'), 'POST', `leagues/${id}/ready`, new URLSearchParams(), { isReady: true, ready: true });
  return { ...rows.get(id) };
};

beforeEach(() => window.localStorage.clear());

test('players bid through the commissioner\'s phone and only see their own bid', async () => {
  const { league, version } = await makeLeague();
  expect(league.members).toEqual(['admin', 'u2']);
  writeOfflineLeague(league.id, { league, version, baseVersion: version, savedAt: new Date().toISOString(), userId: 'admin', nearbyHost: true });

  const air = fakeTransport();
  connectTransport(air);
  const states = [];
  watchNearby((s) => states.push(s));
  await startHosting(league.id, { userId: 'admin', userDetails: 'Tyler' });
  expect(air.hosted).toEqual({ name: 'Tyler', room: league.id });

  // A player's phone connects and says who it is.
  air.emit('peerState', { peerId: 'P2', name: 'Sam', state: 'connected' });
  air.emit('message', { peerId: 'P2', data: JSON.stringify({ t: 'hello', userId: 'u2', leagueId: league.id }) });
  expect(states[states.length - 1]).toMatchObject({ role: 'host', players: 1 });

  // Before hello, a stranger is refused.
  air.emit('message', { peerId: 'P9', data: JSON.stringify({ t: 'req', id: 1, method: 'POST', path: `leagues/${league.id}/bid`, body: { amount: 3 } }) });
  await tick();
  expect(air.sent.find((s) => s.msg.id === 1)).toMatchObject({ to: ['P9'], msg: { status: 401 } });

  const started = await axios.post(`${API_BASE_URL}/leagues/${league.id}/startDraft`, {});
  if (started.data && started.data.status) expect(String(started.data.status).toLowerCase()).toBe('drafting');
  await tick();
  air.sent.length = 0;

  // The player bids $7 from their phone.
  air.emit('message', {
    peerId: 'P2',
    data: JSON.stringify({ t: 'req', id: 2, leagueId: league.id, method: 'POST', path: `leagues/${league.id}/bid`, query: '', body: { amount: 7 } }),
  });
  await tick(30);
  const reply = air.sent.find((s) => s.msg.t === 'res' && s.msg.id === 2);
  expect(reply.to).toEqual(['P2']);
  expect(reply.msg.status).toBe(200);
  expect(reply.msg.body.activeBids.u2.amount).toBe(7);

  // Live updates sent on to players never carry the bid.
  const broadcasts = air.sent.filter((s) => s.msg.t === 'bc');
  broadcasts.forEach((b) => expect(JSON.stringify(b.msg)).not.toMatch(/"amount":7/));

  // The commissioner's own view of the league doesn't show the player's bid either.
  const adminView = await axios.get(`${API_BASE_URL}/leagues/${league.id}/state`);
  expect(adminView.data.activeBids?.u2).toBeUndefined();

  // Calls for other leagues or that need the server are refused.
  air.emit('message', { peerId: 'P2', data: JSON.stringify({ t: 'req', id: 3, method: 'POST', path: `leagues/${league.id}/offline-restore`, body: {} }) });
  await tick();
  expect(air.sent.find((s) => s.msg.id === 3).msg.status).toBe(403);

  // A dropped phone is no longer counted.
  air.emit('peerState', { peerId: 'P2', name: 'Sam', state: 'disconnected' });
  expect(states[states.length - 1]).toMatchObject({ players: 0 });
});
