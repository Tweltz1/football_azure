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
// Messages (JSON):
//   player -> host  { t: 'hello', userId, leagueId }
//   player -> host  { t: 'req', id, leagueId, method, path, query, body }
//   host -> player  { t: 'res', id, status, body, headers }
//   host -> players { t: 'bc', leagueId, event, payload, toUserId }

import axios from 'axios';
import { API_BASE_URL } from '../api';
import { deliverLocal, forgetLeague } from '../realtime';
import { isAvailable, Nearby } from '../native/nearby';
import { setBroadcastTap, setRemoteRunner, runLocal } from './localApi';
import { offlineLeagueIds, offlineUser, readOfflineLeague, rememberOfflineUser, removeOfflineLeague, writeOfflineLeague } from './storage';

const CONNECT_WAIT_MS = 15000;
const REPLY_WAIT_MS = 20000;
const TICKET_HOURS = 24;
const SERVER_ONLY = new Set(['offline-copy', 'offline-restore']);

let transport = null; // Nearby, or a stand-in for tests
let role = null; // { kind: 'host' | 'player', leagueId, userId }
const peerUsers = new Map(); // host: peerId -> userId
let hostPeers = new Set(); // player: connected peers (the host)
const pending = new Map(); // player: request id -> { resolve, timer }
const watchers = new Set();
let nextId = 1;

const status = () => ({
  role: role?.kind || null,
  leagueId: role?.leagueId || null,
  players: role?.kind === 'host' ? peerUsers.size : 0,
  connected: role?.kind === 'host' ? true : hostPeers.size > 0,
});
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

const onHostMessage = ({ peerId, data }) => {
  let msg;
  try { msg = JSON.parse(data); } catch (error) { return; }
  if (msg.t === 'hello' && msg.leagueId === role.leagueId && typeof msg.userId === 'string') {
    peerUsers.set(peerId, msg.userId);
    notify();
  } else if (msg.t === 'req') {
    answer(peerId, msg);
  }
};

const hostTap = (leagueId, event, payload, toUserId) => {
  if (role?.kind !== 'host' || leagueId !== role.leagueId) return;
  const to = [...peerUsers.entries()].filter(([, userId]) => !toUserId || userId === toUserId).map(([peerId]) => peerId);
  if (to.length) send({ t: 'bc', leagueId, event, payload, toUserId }, to);
};

/** Commissioner: let nearby players join this league's draft (saved here with nearby: true). */
export const startHosting = async (leagueId, user) => {
  if (!transport || role?.kind === 'host') return;
  role = { kind: 'host', leagueId, userId: user?.userId };
  peerUsers.clear();
  await transport.host({ name: user?.userDetails || 'Commissioner', room: leagueId });
  notify();
};

// ---- Player ------------------------------------------------------------------------------------

const onPlayerMessage = ({ data }) => {
  let msg;
  try { msg = JSON.parse(data); } catch (error) { return; }
  if (msg.t === 'res' && pending.has(msg.id)) {
    const { resolve, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    resolve({ status: msg.status, body: msg.body, headers: msg.headers });
  } else if (msg.t === 'bc' && msg.leagueId === role?.leagueId) {
    deliverLocal(msg.leagueId, msg.event, msg.payload, msg.toUserId);
  }
};

let joining = null;
const ensureJoined = (leagueId) => {
  const entry = readOfflineLeague(leagueId);
  if (role?.kind === 'player' && role.leagueId === leagueId) return joining;
  role = { kind: 'player', leagueId, userId: entry?.userId };
  hostPeers = new Set();
  joining = transport.join({ name: entry?.userName || 'Player', room: leagueId }).catch((error) => {
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
    send({ t: 'hello', userId: role.userId, leagueId: role.leagueId }, [peerId]);
    notify();
  } else if (state === 'disconnected' && hostPeers.delete(peerId)) {
    notify();
  }
};

/** Connects the module to a transport (the native plugin by default; tests pass a stand-in). */
export const connectTransport = (next) => {
  transport = next;
  if (!next) return;
  next.addListener('peerState', onPeerState);
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
  hostPeers = new Set();
  pending.clear();
  joining = null;
};

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
    // The commissioner's phone starts hosting as soon as the app opens.
    const hostId = offlineLeagueIds().find((id) => readOfflineLeague(id)?.nearbyHost);
    if (hostId) {
      startHosting(hostId, offlineUser() || {}).catch(() => {});
    }
  }
}
