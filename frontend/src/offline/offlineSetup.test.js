// Setting up an offline or nearby draft with no internet, from the last league copy the phone saw.
import axios from 'axios';
import { saveLeagueToDevice } from './offlineSync';
import { saveNearbyTicket } from './nearbyDraft';
import { readOfflineLeague } from './storage';
import { readKey, saveRead } from './readCache';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({}), removeChannel: () => {} },
}));

const league = {
  id: 'L1', name: 'Hood', adminId: 'admin', members: ['admin', 'p2'], status: 'created', draftMode: 'auction',
  biddingMode: 'standard', teams: [{ id: 't1', ownerId: 'admin', roster: [] }], initialPlayerPool: [{ id: 'x' }],
  activeBids: {}, _version: 7,
};

const goOffline = () => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
  axios.defaults.adapter = (config) => Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true, config }));
};

beforeEach(() => {
  window.localStorage.clear();
  goOffline();
});

test('commissioner can save for a nearby draft offline from the saved league page', async () => {
  saveRead(readKey('get', 'leagues/L1/state', ''), league);
  await saveLeagueToDevice('L1', { userId: 'admin', userDetails: 'Tyler' }, { nearby: true });
  const entry = readOfflineLeague('L1');
  expect(entry.nearbyHost).toBe(true);
  expect(entry.version).toBe(7);
  expect(entry.baseVersion).toBe(7);
  expect(entry.league._version).toBeUndefined();
  expect(entry.league.draftMode).toBe('auction');
});

test('a player can get ready offline from the saved league page', async () => {
  saveRead(readKey('get', 'leagues/L1/state', ''), league);
  await saveNearbyTicket('L1', { userId: 'p2', userDetails: 'Sam' });
  expect(readOfflineLeague('L1').remote).toBe(true);
});

test('offline setup explains when the phone has no copy, and refuses non-commissioners', async () => {
  await expect(saveLeagueToDevice('L1', { userId: 'admin' })).rejects.toThrow("doesn't have a copy");
  saveRead(readKey('get', 'leagues/L1/state', ''), league);
  await expect(saveLeagueToDevice('L1', { userId: 'p2' })).rejects.toThrow('Only the commissioner');
  expect(readOfflineLeague('L1')).toBeNull();
});
