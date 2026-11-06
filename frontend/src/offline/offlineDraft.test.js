// A league saved to the device answers API calls locally, with the server's own rules.
import axios from 'axios';
import { handle } from './engine.generated';
import { API_BASE_URL } from '../api';
import { createDraftConnection } from '../realtime';
import { isOfflineLeague, offlineUser, readOfflineLeague, rememberOfflineUser, writeOfflineLeague } from './storage';

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

// Builds a real league with the bundled handlers, as the server would have.
const makeLeague = async () => {
  const rows = new Map();
  const ctx = {
    leagues: {
      async get(id) { return rows.get(id) ? JSON.parse(JSON.stringify(rows.get(id))) : null; },
      async getLight() { return null; },
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
    now: () => new Date('2026-09-01T18:00:00Z'),
    newId: (() => { let n = 0; return () => `id-${++n}`; })(),
    playerPool: () => JSON.parse(JSON.stringify(players)),
    fetchJson: async () => { throw new Error('no network'); },
    userId: 'admin',
    displayName: 'Admin',
  };
  const created = await handle(ctx, 'POST', 'CreateLeague', new URLSearchParams(), { name: 'Hood', draftMode: 'manual', password: 'pw' });
  return { ...rows.get(created.body.id) };
};

beforeEach(() => window.localStorage.clear());

test('a saved league is drafted on the device with the same rules, and live updates arrive locally', async () => {
  const { league, version } = await makeLeague();
  writeOfflineLeague(league.id, { league, version, baseVersion: version, savedAt: '2026-09-01T18:00:00Z', userId: 'admin' });
  rememberOfflineUser({ userId: 'admin', userDetails: 'Admin' });
  expect(isOfflineLeague(league.id)).toBe(true);
  expect(offlineUser()).toEqual({ userId: 'admin', userDetails: 'Admin' });

  const updates = [];
  const connection = createDraftConnection({ leagueIds: [league.id], userId: 'admin' });
  connection.on('draftStateUpdate', (l) => updates.push(l));
  await connection.start();

  const state = await axios.get(`${API_BASE_URL}/leagues/${league.id}/state`);
  expect(state.data.name).toBe('Hood');
  expect(state.data.password).toBeNull();

  await axios.post(`${API_BASE_URL}/leagues/${league.id}/startDraft`, {});
  const team = state.data.teams[0];
  const awarded = await axios.post(`${API_BASE_URL}/leagues/${league.id}/manual-award`, { teamId: team.id, playerId: 'p1', amount: 25 });
  expect(awarded.data.teams[0].budget).toBe(175);
  expect(readOfflineLeague(league.id).league.draftLog).toHaveLength(1);
  expect(readOfflineLeague(league.id).baseVersion).toBe(version);

  // Rules are the server's: over budget is refused like a 400 from the site.
  await expect(axios.post(`${API_BASE_URL}/leagues/${league.id}/manual-award`, { teamId: team.id, playerId: 'p2', amount: 500 }))
    .rejects.toMatchObject({ response: { status: 400 } });

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(updates.some((l) => l.draftLog?.length === 1)).toBe(true);
  connection.stop();
});

test('the league list falls back to saved leagues with no internet', async () => {
  const { league, version } = await makeLeague();
  writeOfflineLeague(league.id, { league, version, baseVersion: version, savedAt: '2026-09-01T18:00:00Z', userId: 'admin' });
  const networkDown = Object.assign(new Error('Network Error'), { isAxiosError: true });
  const spy = jest.spyOn(axios.defaults, 'adapter').mockImplementation(() => Promise.reject(networkDown));
  try {
    const response = await axios.get(`${API_BASE_URL}/GetLeagues?userId=admin`);
    expect(response.data.map((l) => l.id)).toEqual([league.id]);
  } finally {
    spy.mockRestore();
  }
});

test('with no saved leagues, nothing is routed locally', () => {
  expect(offlineUser()).toBeNull();
  expect(isOfflineLeague('anything')).toBe(false);
});
