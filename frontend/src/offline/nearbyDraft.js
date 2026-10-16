// Nearby-phones draft, only in the iPhone app: everyone bids from their own phone with no internet.
//
// The commissioner saves the league to their phone (offlineSync.saveLeagueToDevice with nearby: true) and
// their phone runs the draft with the server's own rules (localApi.js). Each player saves a "ticket" while
// online, which keeps a read-only copy of the league on their phone so the app opens to it; with the
// ticket, every API call for that league goes to the commissioner's phone instead of the internet
// (native/nearby.js, Apple's Multipeer Connectivity), and live updates come back the same way.
//
// The auction stays blind: a bid's reply (which shows that bidder's own bid) goes back to the bidder
// only, and the live updates sent to everyone never carry bids.
//
// Players who never set up (or are guests with no account, or rejoin from another phone) type the
// commissioner's 4-digit room code instead: the host answers with the league's teams ('lobby'), the player
// picks a new team or an existing team that isn't connected ('pick'), and gets a ticket back ('welcome').
//
// Messages (JSON):
//   player -> host  { t: 'hello', userId, leagueId }
//   player -> host  { t: 'guest-hello', userId, name }
//   host -> player  { t: 'lobby', leagueId, leagueName, status, mine, teams: [{ id, name, open }], canAdd }
//   player -> host  { t: 'pick', choice: 'new' | 'mine' | teamId }
//   host -> player  { t: 'welcome', leagueId, league } or { t: 'welcome', error }
//   player -> host  { t: 'req', id, leagueId, method, path, query, body }
//   host -> player  { t: 'res', id, status, body, headers }
//   host -> players { t: 'bc', leagueId, event, payload, toUserId }
//   host -> co-host { t: 'mirror', leagueId, league, meta }   the co-host's copy, to take over from
//   back -> acting  { t: 'reclaim', leagueId, userId }        the commissioner's phone is back
//   acting -> back  { t: 'handback', leagueId, league, version }
//
// Co-host: when the league has one (league.cohostId), the commissioner's phone keeps a copy of the draft on
// the co-host's phone (as the co-host may see it, so never anyone else's sealed bid). If the commissioner's
// phone is gone for TAKEOVER_AFTER_MS, the co-host's phone starts hosting the same room from that copy (a
// player up for bid starts over, since the sealed bids were only on the commissioner's phone) and everyone
// reconnects to it. When the commissioner's phone comes back it finds the room already hosted, asks for the
// draft back, and the co-host's phone becomes a player again.

import axios from 'axios';
import { API_BASE_URL } from '../api';
import { deliverLocal, forgetLeague } from '../realtime';
import { isAvailable, Nearby } from '../native/nearby';
import { setBroadcastTap, setRemoteRunner, runLocal } from './localApi';
import {
  offlineLeagueIds, offlineUser, readOfflineLeague, rememberName, rememberOfflineUser, removeOfflineLeague, writeOfflineLeague,
} from './storage';

const CONNECT_WAIT_MS = 15000;
const REPLY_WAIT_MS = 20000;
const TICKET_HOURS = 24;
const SERVER_ONLY = new Set(['offline-copy', 'offline-restore']);
const MIRROR_EVERY_MS = 2000;
const TAKEOVER_AFTER_MS = 20000;
const HOST_CHECK_MS = 4000;
const RECLAIM_WAIT_MS = 20000;

let transport = null; // Nearby, or a stand-in for tests
let role = null; // { kind: 'host' | 'player', leagueId, userId }
const peerUsers = new Map(); // host: peerId -> userId
let hostPeers = new Set(); // player: connected peers (the host)
const pending = new Map(); // player: request id -> { resolve, timer }
const watchers = new Set();
let nextId = 1;
let radioLog = []; // the last few things the radio reported, shown while connecting

const logRadio = (text) => {
  radioLog = [...radioLog, String(text)].slice(-6);
  notify();
};

const status = () => ({
  role: role?.kind || null,
  leagueId: role?.leagueId || null,
  players: role?.kind === 'host' ? peerUsers.size : 0,
  connectedUserIds: role?.kind === 'host' ? [...new Set(peerUsers.values())] : [],
  connected: role?.kind === 'host' ? true : hostPeers.size > 0,
  acting: role?.kind === 'host' && !!readOfflineLeague(role.leagueId)?.actingHost,
  checking: !!role?.checking || !!role?.reclaim,
  log: radioLog,
});

/** The 4-digit code players type to find this league's draft nearby (the same on every phone). */
export const roomFor = (leagueId) => {
  let hash = 0;
  for (const ch of String(leagueId || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return String(1000 + (hash % 9000));
};
const notify = () => watchers.forEach((fn) => fn(status()));

/** Calls fn with { role, leagueId, players, connected } whenever it changes. Returns an unsubscribe. */
export const watchNearby = (fn) => {
  watchers.add(fn);
  fn(status());
  return () => watchers.delete(fn);
};

const send = (message, to) => transport.send({ data: JSON.stringify(message), ...(to ? { to } : {}) }).catch(() => {});

// ---- Host (commissioner's phone) ---------------------------------------------------------------

const leagueIdOf = (path) => {
  const match = /^leagues\/([^/?]+)(?:\/([^?]*))?/.exec(path || '');
  return match ? { leagueId: decodeURIComponent(match[1]), action: match[2] || '' } : null;
};

const answer = async (peerId, msg) => {
  const userId = peerUsers.get(peerId);
  const target = leagueIdOf(msg.path);
  let result;
  if (!userId) {
    result = { status: 401, body: 'Say hello first.' };
  } else if (!target || target.leagueId !== role.leagueId || SERVER_ONLY.has(target.action)) {
    result = { status: 403, body: 'Only this draft is available from the commissioner\'s phone.' };
  } else {
    try {
      result = await runLocal(msg.method, msg.path, new URLSearchParams(msg.query || ''), msg.body, userId);
    } catch (error) {
      result = { status: 500, body: error?.message || 'Something went wrong on the commissioner\'s phone.' };
    }
  }
  // Only the asker gets the reply: it can show their own sealed bid.
  send({ t: 'res', id: msg.id, status: result.status, body: result.body, headers: result.headers }, [peerId]);
};

const guests = new Map(); // host: peerId -> { userId, name } still picking a team

const hostLeague = () => readOfflineLeague(role.leagueId)?.league || null;
const hostUserId = () => readOfflineLeague(role.leagueId)?.userId || role.userId;

const lobbyFor = (userId) => {
  const league = hostLeague();
  if (!league) return null;
  const connected = new Set([...peerUsers.values(), league.adminId]);
  const teams = (league.teams || []).filter(Boolean);
  const mine = teams.find((team) => team.ownerId === userId);
  return {
    t: 'lobby',
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    mine: mine ? { id: mine.id, name: mine.name } : null,
    teams: teams.map((team) => ({ id: team.id, name: team.name, open: !mine && !connected.has(team.ownerId) })),
    canAdd: !mine && String(league.status || '').toLowerCase() !== 'completed' && league.draftMode !== 'manual',
  };
};

const welcome = async (peerId, guest, choice) => {
  const leagueId = role.leagueId;
  let error = null;
  if (choice === 'new') {
    const joined = await runLocal('POST', 'JoinLeague', new URLSearchParams(), { leagueId }, guest.userId);
    if (joined.status !== 200 && joined.status !== 409) error = joined.body || 'Could not add your team.';
  } else if (choice !== 'mine') {
    // Rejoining as a team whose phone dropped out: the commissioner's phone hands that team to this phone.
    const lobby = lobbyFor(guest.userId);
    if (!lobby?.teams.some((team) => team.id === choice && team.open)) {
      error = 'That team is connected on another phone right now.';
    } else {
      const moved = await runLocal('POST', `leagues/${leagueId}/reassign-team`, new URLSearchParams(), { teamId: choice, userId: guest.userId }, hostUserId());
      if (moved.status !== 200) error = moved.body || 'Could not move that team to this phone.';
    }
  }
  if (error) {
    send({ t: 'welcome', error: String(error) }, [peerId]);
    return;
  }
  guests.delete(peerId);
  peerUsers.set(peerId, guest.userId);
  notify();
  const state = await runLocal('GET', `leagues/${leagueId}/state`, new URLSearchParams(), undefined, guest.userId);
  send({ t: 'welcome', leagueId, league: state.body }, [peerId]);
};

const onHostMessage = ({ peerId, data }) => {
  let msg;
  try { msg = JSON.parse(data); } catch (error) { return; }
  if (msg.t === 'hello' && msg.leagueId === role.leagueId && typeof msg.userId === 'string') {
    peerUsers.set(peerId, msg.userId);
    hostHadPlayers = true;
    notify();
    mirrorToCohost();
  } else if (msg.t === 'reclaim' && msg.leagueId === role.leagueId) {
    handBack(peerId, msg).catch(() => {});
  } else if (msg.t === 'guest-hello' && typeof msg.userId === 'string') {
    const guest = { userId: msg.userId, name: String(msg.name || 'Player').slice(0, 40) };
    rememberName(guest.userId, guest.name);
    guests.set(peerId, guest);
    const lobby = lobbyFor(guest.userId);
    if (lobby) send(lobby, [peerId]);
  } else if (msg.t === 'pick' && guests.has(peerId)) {
    welcome(peerId, guests.get(peerId), String(msg.choice || '')).catch((error) => {
      send({ t: 'welcome', error: error?.message || 'Something went wrong on the commissioner\'s phone.' }, [peerId]);
    });
  } else if (msg.t === 'req') {
    answer(peerId, msg);
  }
};

/**
 * Commissioner: bid for a team whose phone died or dropped out (the player tells the commissioner their bid).
 * Works in the auction and in a tie-breaker.
 */
export const bidForTeam = async (leagueId, ownerId, amount) => {
  const league = readOfflineLeague(leagueId)?.league;
  const action = String(league?.status || '').toLowerCase() === 'tiebreaker' ? 'tiebreaker-bid' : 'bid';
  const result = await runLocal('POST', `leagues/${leagueId}/${action}`, new URLSearchParams(), { amount: Number(amount) }, ownerId);
  if (result.status !== 200) throw new Error(typeof result.body === 'string' && result.body ? result.body : 'That bid did not go through.');
};

const hostTap = (leagueId, event, payload, toUserId) => {
  if (role?.kind !== 'host' || leagueId !== role.leagueId) return;
  const to = [...peerUsers.entries()].filter(([, userId]) => !toUserId || userId === toUserId).map(([peerId]) => peerId);
  if (to.length) send({ t: 'bc', leagueId, event, payload, toUserId }, to);
  mirrorToCohost();
};

/** Commissioner: let nearby players join this league's draft (saved here with nearby: true). */
export const startHosting = async (leagueId, user, { checkFirst = true } = {}) => {
  if (!transport || role?.kind === 'host' || role?.checking || role?.reclaim) return;
  const entry = readOfflineLeague(leagueId);
  // With a co-host, the co-host's phone may be running this draft while this phone was away: look first.
  if (checkFirst && transport.scan && entry?.league?.cohostId && !entry.actingHost) {
    role = { kind: 'checking', checking: true, leagueId };
    notify();
    const busy = await findHostOfRoom(roomFor(leagueId), user, HOST_CHECK_MS);
    role = null;
    if (busy) {
      reclaim(leagueId, user);
      return;
    }
  }
  hostHadPlayers = false;
  role = { kind: 'host', leagueId, userId: user?.userId };
  peerUsers.clear();
  guests.clear();
  await transport.host({
    name: user?.userDetails || 'Commissioner',
    room: roomFor(leagueId),
    league: readOfflineLeague(leagueId)?.league?.name || '',
  });
  notify();
};

// ---- Player ------------------------------------------------------------------------------------

const onPlayerMessage = ({ data }) => {
  let msg;
  try { msg = JSON.parse(data); } catch (error) { return; }
  if (msg.t === 'lobby' && role?.guest) {
    role.guest.lobby = msg;
    role.guest.onLobby?.(msg);
  } else if (msg.t === 'welcome' && role?.guest?.onWelcome) {
    role.guest.onWelcome(msg);
  } else if (msg.t === 'res' && pending.has(msg.id)) {
    const { resolve, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    resolve({ status: msg.status, body: msg.body, headers: msg.headers });
  } else if (msg.t === 'bc' && msg.leagueId === role?.leagueId) {
    deliverLocal(msg.leagueId, msg.event, msg.payload, msg.toUserId);
  } else if (msg.t === 'mirror' && msg.leagueId === role?.leagueId && !role.reclaim && msg.league) {
    const entry = readOfflineLeague(msg.leagueId);
    if (entry?.remote) writeOfflineLeague(msg.leagueId, { ...entry, mirror: { league: msg.league, meta: msg.meta || {} } });
  } else if (msg.t === 'handback' && role?.reclaim && msg.leagueId === role.leagueId && msg.league) {
    role.reclaim.onHandback(msg);
  }
};

let joining = null;
const ensureJoined = (leagueId) => {
  const entry = readOfflineLeague(leagueId);
  if (role?.kind === 'player' && role.leagueId === leagueId) return joining;
  role = { kind: 'player', leagueId, userId: entry?.userId };
  hostPeers = new Set();
  joining = transport.join({ name: entry?.userName || 'Player', room: roomFor(leagueId) }).catch((error) => {
    role = null; // try again on the next call
    throw error;
  });
  notify();
  return joining;
};

const waitForHost = () => new Promise((resolve) => {
  if (hostPeers.size) return resolve(true);
  const timer = setTimeout(() => { stop(); resolve(false); }, CONNECT_WAIT_MS);
  const stop = watchNearby((s) => {
    if (s.connected) { clearTimeout(timer); setTimeout(() => stop(), 0); resolve(true); }
  });
});

const relayToHost = async (leagueId, method, path, query, body) => {
  if (!transport) return { status: 503, body: 'Nearby drafts work in the Hood League iPhone app.' };
  await ensureJoined(leagueId);
  if (!(await waitForHost())) {
    return { status: 503, body: 'Can\'t find the commissioner\'s phone. Make sure it has this draft open and is nearby.' };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ status: 504, body: 'The commissioner\'s phone didn\'t answer. Try again.' });
    }, REPLY_WAIT_MS);
    pending.set(id, { resolve, timer });
    send({ t: 'req', id, leagueId, method: String(method || 'get').toUpperCase(), path, query: String(query || ''), body });
  });
};

/**
 * Player, while online: keep a copy of the league on this phone so the app opens to it with no internet,
 * and send its calls to the commissioner's phone. Removed with leaveNearbyDraft, or after a day.
 */
export const saveNearbyTicket = async (leagueId, user) => {
  // With no internet this is the last copy of the league this phone saw (api.js), which is all a ticket needs.
  let data;
  try {
    ({ data } = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`));
  } catch (error) {
    if (error?.response) throw error;
    throw new Error("This phone doesn't have a copy of this league yet. Open the app once with internet, then try again.");
  }
  writeOfflineLeague(leagueId, {
    league: data,
    version: data?._version || 0,
    savedAt: new Date().toISOString(),
    userId: user.userId,
    userName: user.userDetails || 'Player',
    remote: true,
  });
  rememberOfflineUser(user);
};

const GUEST_WAIT_MS = 20000;

/**
 * Player with no setup: find the draft with this room code. Resolves with the lobby
 * ({ leagueName, status, mine, teams, canAdd }) once the commissioner's phone answers.
 */
export const findDraftByCode = async (code, user) => {
  onScanChange = null;
  if (!transport) throw new Error('Nearby drafts work in the Hood League iPhone app.');
  const room = String(code || '').replace(/\D/g, '');
  if (room.length !== 4) throw new Error('Enter the 4-digit code from the commissioner\'s phone.');
  await transport.stop().catch(() => {});
  return lookForRoom(room, user);
};

const lookForRoom = (room, user) => new Promise((resolve, reject) => {
  hostPeers = new Set();
  radioLog = [];
  const timer = setTimeout(() => {
    const last = radioLog[radioLog.length - 1];
    reject(new Error(`No draft found with that code. Keep both phones unlocked with the app open, close together, with Wi-Fi and Bluetooth on.${last ? ` Last thing the phone saw: ${last}` : ''}`));
  }, GUEST_WAIT_MS);
  role = {
    kind: 'player',
    leagueId: null,
    userId: user.userId,
    guest: { name: user.userDetails || 'Player', onLobby: (lobby) => { clearTimeout(timer); resolve(lobby); } },
  };
  joining = transport.join({ name: user.userDetails || 'Player', room }).catch((error) => {
    clearTimeout(timer);
    role = null;
    reject(error);
  });
  notify();
});

// Nearby hosted drafts seen while scanning, by peerId: { peerId, name, room, league }.
let scanHosts = new Map();
let onScanChange = null;
const scanChanged = () => onScanChange?.([...scanHosts.values()].filter((h) => /^\d{4}$/.test(h.room)));

/**
 * Player: list drafts hosted on nearby phones, like AirDrop. Calls onChange with the list whenever it changes;
 * tap one to join with findDraftByCode(host.room). Returns a function that stops looking.
 * Not while players are connected to a room this phone hosts (scanning stops the room; the draft page
 * starts hosting again when it opens).
 */
export const scanForDrafts = (user, onChange) => {
  if (!transport?.scan || (role?.kind === 'host' && (peerUsers.size || guests.size))) return () => {};
  scanHosts = new Map();
  onScanChange = onChange;
  role = null;
  transport.scan({ name: user?.userDetails || 'Player' }).catch((error) => logRadio(`Problem: ${error?.message || 'unknown'}`));
  scanChanged();
  return () => {
    if (onScanChange !== onChange) return;
    onScanChange = null;
    if (!role) transport.stop().catch(() => {});
  };
};

/** Player: after findDraftByCode, take a team ('new', 'mine', or an open team's id). Resolves with the league ID. */
export const pickDraftTeam = (choice, user) => new Promise((resolve, reject) => {
  if (!role?.guest?.lobby) { reject(new Error('Find the draft first.')); return; }
  const timer = setTimeout(() => reject(new Error('The commissioner\'s phone didn\'t answer. Try again.')), REPLY_WAIT_MS);
  role.guest.onWelcome = (msg) => {
    clearTimeout(timer);
    role.guest.onWelcome = null;
    if (msg.error || !msg.leagueId) { reject(new Error(msg.error || 'Could not join the draft.')); return; }
    writeOfflineLeague(msg.leagueId, {
      league: msg.league,
      version: msg.league?._version || 0,
      savedAt: new Date().toISOString(),
      userId: user.userId,
      userName: user.userDetails || 'Player',
      remote: true,
    });
    rememberOfflineUser(user);
    role = { kind: 'player', leagueId: msg.leagueId, userId: user.userId };
    joining = Promise.resolve();
    notify();
    resolve(msg.leagueId);
  };
  send({ t: 'pick', choice }, [...hostPeers]);
});

export const leaveNearbyDraft = (leagueId) => {
  if (role?.leagueId === leagueId) {
    transport?.stop().catch(() => {});
    role = null;
    peerUsers.clear();
    hostPeers = new Set();
    notify();
  }
  removeOfflineLeague(leagueId);
  forgetLeague(leagueId);
};

/** Player: start looking for the commissioner's phone now (calls also do this on their own). */
export const joinNearby = (leagueId) => (transport && isNearbyTicket(leagueId) ? ensureJoined(leagueId).catch(() => {}) : null);

export const isNearbyTicket = (leagueId) => !!readOfflineLeague(leagueId)?.remote;
export const isNearbyHostCopy = (leagueId) => !!readOfflineLeague(leagueId)?.nearbyHost;
export const nearbySupported = () => !!transport;

// ---- Wiring -------------------------------------------------------------------------------------

const onPeerState = ({ peerId, state }) => {
  if (role?.kind === 'host') {
    if (state === 'disconnected' && peerUsers.delete(peerId)) notify();
    return;
  }
  if (role?.kind !== 'player') return;
  if (state === 'connected') {
    hostPeers.add(peerId);
    if (role.reclaim) send({ t: 'reclaim', leagueId: role.leagueId, userId: role.userId }, [peerId]);
    else if (role.guest) send({ t: 'guest-hello', userId: role.userId, name: role.guest.name }, [peerId]);
    else {
      send({ t: 'hello', userId: role.userId, leagueId: role.leagueId }, [peerId]);
      refreshFromHost(role.leagueId);
    }
    notify();
  } else if (state === 'disconnected' && hostPeers.delete(peerId)) {
    notify();
  }
};

// ---- Co-host takeover --------------------------------------------------------------------------

let mirrorTimer = null;
let hostHadPlayers = false;

// Host: send the co-host's phone its copy of the draft, at most every MIRROR_EVERY_MS.
const mirrorToCohost = () => {
  if (role?.kind !== 'host' || mirrorTimer) return;
  mirrorTimer = setTimeout(async () => {
    mirrorTimer = null;
    if (role?.kind !== 'host') return;
    const leagueId = role.leagueId;
    const entry = readOfflineLeague(leagueId);
    const cohostId = entry?.league?.cohostId;
    const to = [...peerUsers.entries()].filter(([, userId]) => cohostId && userId === cohostId).map(([peerId]) => peerId);
    if (!to.length) return;
    const state = await runLocal('GET', `leagues/${leagueId}/state`, new URLSearchParams(), undefined, cohostId).catch(() => null);
    if (state?.status !== 200 || role?.kind !== 'host') return;
    const meta = {
      version: entry.version || 0,
      baseVersion: entry.baseVersion ?? null,
      createdOffline: !!entry.createdOffline,
      hostUserId: entry.originalHostId || entry.userId,
    };
    send({ t: 'mirror', leagueId, league: state.body, meta }, to);
  }, MIRROR_EVERY_MS);
};

const freshTimer = (seconds) => ({
  endTime: new Date(Date.now() + (Number(seconds) || 30) * 1000).toISOString(),
  isPaused: false,
  timeRemainingOnPause: 0,
});

const showOwnState = async (leagueId, userId) => {
  const res = await runLocal('GET', `leagues/${leagueId}/state`, new URLSearchParams(), undefined, userId).catch(() => null);
  if (res?.status === 200 && res.body) deliverLocal(leagueId, 'draftStateUpdate', res.body);
};

/** Co-host: the commissioner's phone is gone, so run the draft from this phone's copy. */
export const takeOver = async (leagueId) => {
  const entry = readOfflineLeague(leagueId);
  const { league, meta = {} } = entry?.mirror || {};
  if (!league) throw new Error('This phone has no copy of the draft to take over.');
  const next = JSON.parse(JSON.stringify(league));
  const status = String(next.status || '').toLowerCase();
  if (status === 'drafting' || status === 'tiebreaker') {
    // The sealed bids were only on the commissioner's phone: this player starts over.
    next.activeBids = {};
    next.auctionTimer = freshTimer(status === 'tiebreaker' ? next.draftTimers?.rebidTimer : next.draftTimers?.bidTimer);
  }
  writeOfflineLeague(leagueId, {
    league: next,
    version: meta.version || 0,
    ...(meta.baseVersion != null ? { baseVersion: meta.baseVersion } : {}),
    ...(meta.createdOffline ? { createdOffline: true } : {}),
    savedAt: new Date().toISOString(),
    userId: entry.userId,
    userName: entry.userName,
    nearbyHost: true,
    actingHost: true,
    originalHostId: meta.hostUserId || next.adminId,
  });
  pending.forEach(({ resolve, timer }) => { clearTimeout(timer); resolve({ status: 503, body: 'The commissioner\'s phone dropped. Try again.' }); });
  pending.clear();
  role = null;
  hostPeers = new Set();
  joining = null;
  await transport.stop().catch(() => {});
  await startHosting(leagueId, { userId: entry.userId, userDetails: entry.userName }, { checkFirst: false });
  logRadio('The commissioner\'s phone dropped, so this phone is running the draft until it comes back.');
  showOwnState(leagueId, entry.userId);
};

// Acting host: the commissioner's phone is back. Give it the draft and become a player again.
const handBack = async (peerId, msg) => {
  const leagueId = role.leagueId;
  const entry = readOfflineLeague(leagueId);
  if (!entry?.actingHost || msg.userId !== entry.originalHostId) return;
  const mine = await runLocal('GET', `leagues/${leagueId}/state`, new URLSearchParams(), undefined, entry.userId).catch(() => null);
  send({ t: 'handback', leagueId, league: entry.league, version: entry.version || 0 }, [peerId]);
  const meta = { version: entry.version || 0, baseVersion: entry.baseVersion ?? null, createdOffline: !!entry.createdOffline, hostUserId: entry.originalHostId };
  const view = mine?.status === 200 ? mine.body : entry.league;
  writeOfflineLeague(leagueId, {
    league: view,
    version: entry.version || 0,
    savedAt: new Date().toISOString(),
    userId: entry.userId,
    userName: entry.userName,
    remote: true,
    mirror: { league: view, meta },
  });
  setTimeout(async () => {
    role = null;
    peerUsers.clear();
    guests.clear();
    await transport.stop().catch(() => {});
    logRadio('The commissioner\'s phone is back and running the draft again.');
    setTimeout(() => { ensureJoined(leagueId).catch(() => {}); }, 1500);
  }, 500);
};

// Is some other phone hosting this room right now?
const findHostOfRoom = (room, user, waitMs) => new Promise((resolve) => {
  let finished = false;
  const finish = (found) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (onScanChange === check) onScanChange = null;
    transport.stop().catch(() => {}).then(() => resolve(found));
  };
  const check = (hosts) => { if (hosts.some((h) => h.room === room)) finish(true); };
  const timer = setTimeout(() => finish(false), waitMs);
  scanHosts = new Map();
  onScanChange = check;
  transport.scan({ name: user?.userDetails || 'Commissioner' }).catch(() => finish(false));
});

// Commissioner's phone back after a takeover: join the acting host and ask for the draft back.
const reclaim = (leagueId, user) => {
  const entry = readOfflineLeague(leagueId);
  const done = async (msg) => {
    clearTimeout(timer);
    role = null;
    hostPeers = new Set();
    if (msg) {
      writeOfflineLeague(leagueId, { ...readOfflineLeague(leagueId), league: msg.league, version: msg.version || 0, savedAt: new Date().toISOString() });
    }
    await transport.stop().catch(() => {});
    await startHosting(leagueId, user, { checkFirst: false });
    if (msg) logRadio('Got the draft back from the co-host\'s phone.');
    showOwnState(leagueId, entry?.userId || user?.userId);
  };
  const timer = setTimeout(() => done(null), RECLAIM_WAIT_MS);
  role = { kind: 'player', leagueId, userId: entry?.userId || user?.userId, reclaim: { onHandback: done } };
  hostPeers = new Set();
  notify();
  transport.join({ name: user?.userDetails || 'Commissioner', room: roomFor(leagueId) }).catch(() => done(null));
};

// Every few seconds: a co-host whose commissioner's phone is gone takes over; a commissioner's phone whose
// players all vanished checks whether the co-host took over meanwhile.
let hostLostAt = null;
let playersLostAt = null;
const watchHost = () => {
  if (!transport) return;
  if (role?.kind === 'player' && role.leagueId && !role.reclaim && !role.guest) {
    const entry = readOfflineLeague(role.leagueId);
    // Only the current co-host takes over (a copy from before the commissioner picked someone else doesn't count).
    if (!entry?.mirror || entry.mirror.league?.cohostId !== entry.userId || hostPeers.size) {
      hostLostAt = null;
    } else {
      hostLostAt = hostLostAt || Date.now();
      if (Date.now() - hostLostAt >= TAKEOVER_AFTER_MS) {
        hostLostAt = null;
        takeOver(role.leagueId).catch(() => {});
      }
    }
  } else {
    hostLostAt = null;
  }
  if (role?.kind === 'host' && hostHadPlayers && !peerUsers.size && !guests.size) {
    const entry = readOfflineLeague(role.leagueId);
    if (!entry?.league?.cohostId || entry.actingHost) { playersLostAt = null; return; }
    playersLostAt = playersLostAt || Date.now();
    if (Date.now() - playersLostAt >= TAKEOVER_AFTER_MS + 5000) {
      playersLostAt = null;
      const { leagueId, userId } = role;
      role = null;
      transport.stop().catch(() => {}).then(() => startHosting(leagueId, { userId, userDetails: entry.userName || offlineUser()?.userDetails }));
    }
  } else {
    playersLostAt = null;
  }
};

// Player: once connected (or reconnected), show the commissioner's latest copy of the draft.
const refreshFromHost = (leagueId) => {
  setTimeout(async () => {
    if (role?.kind !== 'player' || role.leagueId !== leagueId) return;
    const res = await runLocal('GET', `leagues/${leagueId}/state`, new URLSearchParams(), undefined, role.userId).catch(() => null);
    if (res?.status === 200 && res.body) deliverLocal(leagueId, 'draftStateUpdate', res.body);
  }, 0);
};

/** Connects the module to a transport (the native plugin by default; tests pass a stand-in). */
export const connectTransport = (next) => {
  transport = next;
  if (!next) return;
  next.addListener('peerState', onPeerState);
  next.addListener('hostFound', (event) => { if (event?.peerId) { scanHosts.set(event.peerId, event); scanChanged(); } });
  next.addListener('hostLost', (event) => { if (scanHosts.delete(event?.peerId)) scanChanged(); });
  next.addListener('status', (event) => logRadio(event?.text || ''));
  next.addListener('error', (event) => logRadio(`Problem: ${event?.message || 'unknown'}`));
  next.addListener('message', (event) => {
    if (role?.kind === 'host') onHostMessage(event);
    else if (role?.kind === 'player') onPlayerMessage(event);
  });
  setRemoteRunner(relayToHost);
  setBroadcastTap(hostTap);
};

/** For tests: forget the current room. */
export const resetNearby = () => {
  role = null;
  peerUsers.clear();
  guests.clear();
  hostPeers = new Set();
  pending.clear();
  joining = null;
  hostLostAt = null;
  playersLostAt = null;
  hostHadPlayers = false;
};

/** For tests: run the co-host checks now. */
export const checkHostNow = () => watchHost();

// Tickets are for one draft night; drop old ones so the league list shows the live league again.
const dropOldTickets = () => {
  const cutoff = Date.now() - TICKET_HOURS * 3600 * 1000;
  offlineLeagueIds().forEach((id) => {
    const entry = readOfflineLeague(id);
    if (entry?.remote && !(new Date(entry.savedAt).getTime() > cutoff)) removeOfflineLeague(id);
  });
};

if (typeof window !== 'undefined') {
  try { dropOldTickets(); } catch (error) { /* storage unavailable */ }
  if (isAvailable()) {
    connectTransport(Nearby);
    setInterval(watchHost, 3000);
    // The commissioner's phone starts hosting as soon as the app opens.
    const hostId = offlineLeagueIds().find((id) => readOfflineLeague(id)?.nearbyHost);
    if (hostId) {
      startHosting(hostId, offlineUser() || {}).catch(() => {});
    }
  }
}
