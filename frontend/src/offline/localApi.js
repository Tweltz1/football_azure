// Runs API calls for a league saved to this device against the device copy, using the same handlers the
// server runs (bundled into engine.generated.js). api.js sends a request here instead of the network when
// its league is saved offline, so the draft room works unchanged with no internet.

import { nameFor, offlineLeagueIds, readOfflineLeague, writeOfflineLeague } from './storage';
import { deliverLocal } from '../realtime';

// Loaded on first use so everyone else's pages don't download it.
let enginePromise = null;
const loadEngine = () => {
  if (!enginePromise) enginePromise = import('./engine.generated');
  return enginePromise;
};

// Nearby-phone drafts (offline/nearbyDraft.js) hook in here: a player's calls go to the commissioner's
// phone, and the commissioner's phone passes its live updates on to the players.
let remoteRunner = null;
let broadcastTap = null;
export const setRemoteRunner = (fn) => { remoteRunner = fn; };
export const setBroadcastTap = (fn) => { broadcastTap = fn; };

const needsInternet = () => {
  throw new Error('That needs an internet connection.');
};

const leagues = {
  async get(id) {
    const entry = readOfflineLeague(id);
    return entry ? { league: entry.league, version: entry.version } : null;
  },
  async getLight(id) {
    const entry = readOfflineLeague(id);
    return entry ? { status: entry.league.status, auctionTimer: entry.league.auctionTimer, version: entry.version } : null;
  },
  // A league made on this phone with no internet (guest drafts); it goes online when it's uploaded.
  async create(league) {
    writeOfflineLeague(league.id, {
      league, version: 1, baseVersion: null, savedAt: new Date().toISOString(), userId: league.adminId, createdOffline: true,
    });
    return 1;
  },
  async replace(league, expectedVersion) {
    const entry = readOfflineLeague(league.id);
    if (!entry || entry.version !== expectedVersion) return null;
    const version = expectedVersion + 1;
    writeOfflineLeague(league.id, { ...entry, league, version });
    return version;
  },
  delete: needsInternet,
  async findByName() {
    return null;
  },
  async listForMember(userId) {
    return offlineLeagueIds()
      .map((id) => readOfflineLeague(id))
      .filter((entry) => entry && (entry.league.members || []).includes(userId))
      .map(({ league, version }) => ({ league, version }));
  },
};

// Profiles and history live on the server; the finished draft reaches History when it is uploaded.
// Players in a nearby draft have no profile here; their name is what they typed when they joined.
const profiles = {
  async find(userId) {
    const displayName = nameFor(userId);
    return displayName ? { id: userId, userId, displayName } : null;
  },
  async upsert() {},
};

// The player list the site ships with, for leagues made on this phone. Loaded on first use.
let poolPromise = null;
const loadPool = () => {
  if (!poolPromise) {
    poolPromise = import('../data/playerData').then(({ initialPlayerList }) => initialPlayerList.map((player) => ({
      id: player.id, rank: player.rank, name: player.name, team: player.team, position: player.position,
      bye: player.bye, isDrafted: false, price: 0,
    })));
  }
  return poolPromise;
};
const history = { async save() {}, async get() { return null; }, async listForMember() { return []; } };

const newId = () => (window.crypto?.randomUUID
  ? window.crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const ctxFor = (userId, pool = []) => ({
  leagues,
  profiles,
  history,
  broadcaster: {
    async send(leagueId, event, payload, toUserId) {
      // After the caller gets its response, like a live update from the server would.
      window.setTimeout(() => deliverLocal(leagueId, event, payload, toUserId), 0);
      if (broadcastTap) broadcastTap(leagueId, event, payload, toUserId);
    },
  },
  log: console,
  now: () => new Date(),
  newId,
  playerPool: () => pool.map((player) => ({ ...player })),
  fetchJson: () => Promise.reject(new Error('No internet on an offline draft.')),
  userId,
  displayName: null,
});

/** Runs one API call (`path` like `leagues/abc/manual-award`) on this device. Returns { status, body }. */
export const runLocal = async (method, path, query, body, userId) => {
  const leagueId = /^leagues\/([^/]+)/.exec(path || '')?.[1];
  const entry = leagueId ? readOfflineLeague(decodeURIComponent(leagueId)) : null;
  if (entry?.remote) {
    if (!remoteRunner) return { status: 503, body: "Not connected to the commissioner's phone." };
    return remoteRunner(entry.league.id, method, path, query, body);
  }
  const { handle } = await loadEngine();
  const pool = /^createleague$/i.test(path || '') ? await loadPool() : [];
  return handle(ctxFor(userId, pool), method, path, query, body);
};

/** The user a league's device copy was saved by; offline calls act as them. */
export const offlineUserIdFor = (leagueId) => readOfflineLeague(leagueId)?.userId || null;

/** The saved leagues for this user, shaped like GetLeagues. */
export const localLeagueList = async (userId) => {
  const response = await runLocal('GET', 'GetLeagues', new URLSearchParams(), undefined, userId);
  return Array.isArray(response.body) ? response.body : [];
};
