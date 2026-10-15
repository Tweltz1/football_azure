// Live draft updates over Supabase Realtime, shaped like the old SignalR connection:
//   const connection = createDraftConnection({ leagueIds: [leagueId], userId });
//   connection.on('draftStateUpdate', handler); await connection.start(); connection.stop();
//
// The server broadcasts 'draftStateDiff' messages (small changes against a version number) on the
// channel `league:<id>`. This module keeps the last full league per id, applies each diff, and hands
// components the full league through 'draftStateUpdate', exactly as before. When a diff doesn't line up
// with what we have (a missed message, a reconnect), it refetches the league instead.

import { supabase } from './supabaseClient';
// api.js imports this module too; the cycle is safe because fetchLeagueState is only called later.
import { fetchLeagueState } from './api';
import { isOfflineLeague, LEAGUE_KEY_PREFIX } from './offline/storage';

const leagueCache = new Map(); // leagueId -> league (with _version)
const channels = new Map(); // leagueId -> { channel, connections: Set, subscribedOnce, readyPromise }
const refetches = new Map(); // leagueId -> Promise

const isLeague = (value) => value && typeof value === 'object' && typeof value.id === 'string' && Number.isFinite(value._version);

/** Remembers leagues returned by API calls so later diffs can be applied to them. Returns the ones it kept. */
export const rememberLeagues = (data) => {
  const list = Array.isArray(data) ? data : [data];
  const kept = [];
  for (const league of list) {
    if (!isLeague(league)) continue;
    const cached = leagueCache.get(league.id);
    if (!cached || cached._version <= league._version) {
      leagueCache.set(league.id, league);
      kept.push(league);
    }
  }
  return kept;
};

/**
 * Like rememberLeagues, and also passes each kept league to the screens watching it. Bids are sealed
 * from the live updates, so this is how a bidder's own bid (returned by the bid call) reaches the page.
 */
export const acceptLeagues = (data) => {
  rememberLeagues(data).forEach((league) => emit(league.id, 'draftStateUpdate', league));
};

/** Drops what we know about a league, so the next copy of it is taken whatever its version. */
export const forgetLeague = (leagueId) => {
  leagueCache.delete(leagueId);
};

// Keys whose change means a bidding round started, ended or went to a tie-breaker.
const ROUND_KEYS = new Set(['status', 'currentPlayer', 'currentPlayerId', 'tieBreaker']);

// Mirror of supabase/functions/_shared/diff.ts applyOps; keep the two in sync.
const applyOps = (target, ops) => {
  const next = { ...target };
  for (const op of ops || []) {
    if (op.del) {
      delete next[op.k];
    } else if ('set' in op) {
      next[op.k] = op.set;
    } else if (op.append) {
      next[op.k] = [...(next[op.k] || []), ...op.append];
    } else if (op.items) {
      const list = [...(next[op.k] || [])];
      Object.entries(op.items).forEach(([index, value]) => {
        list[Number(index)] = value;
      });
      next[op.k] = list;
    }
  }
  return next;
};

const emit = (leagueId, event, payload) => {
  const entry = channels.get(leagueId);
  if (!entry) return;
  entry.connections.forEach((connection) => connection.emit(event, payload));
};

const refetchLeague = (leagueId) => {
  if (refetches.has(leagueId)) return refetches.get(leagueId);
  const promise = (async () => {
    try {
      const response = await fetchLeagueState(leagueId);
      rememberLeagues(response.data);
      const latest = leagueCache.get(leagueId);
      if (latest) emit(leagueId, 'draftStateUpdate', latest);
    } catch (error) {
      console.warn(`Unable to refresh league ${leagueId}:`, error);
    } finally {
      refetches.delete(leagueId);
    }
  })();
  refetches.set(leagueId, promise);
  return promise;
};

const handleDiff = (message) => {
  const { leagueId, baseVersion, version, ops } = message || {};
  if (!leagueId) return;
  const cached = leagueCache.get(leagueId);

  if (cached && cached._version >= version) return; // already have it
  if (cached && cached._version === baseVersion) {
    const next = applyOps(cached, ops);
    next._version = version;
    const newRound = (ops || []).some((op) => ROUND_KEYS.has(op.k));
    // Live updates never carry bids, so a new round clears ours here and the refetch below
    // brings back any bid the server placed for us (a tie-breaker carries tied bids over).
    if (newRound) next.activeBids = {};
    leagueCache.set(leagueId, next);
    emit(leagueId, 'draftStateUpdate', next);
    if (newRound) refetchLeague(leagueId);
    return;
  }
  refetchLeague(leagueId);
};

/** Updates from a league drafted on this device (see offline/localApi.js), handled like the server's. */
export const deliverLocal = (leagueId, event, payload, toUserId) => {
  if (event === 'draftStateDiff') {
    handleDiff(payload);
    return;
  }
  const entry = channels.get(leagueId);
  if (!entry) return;
  entry.connections.forEach((connection) => {
    if (toUserId && connection.userId && toUserId !== connection.userId) return;
    connection.emit(event, payload);
  });
};

// Another tab on this device (a TV board, say) changed a saved league: catch up.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith(LEAGUE_KEY_PREFIX)) return;
    const leagueId = event.key.slice(LEAGUE_KEY_PREFIX.length);
    if (channels.has(leagueId)) refetchLeague(leagueId);
  });
}

const ensureChannel = (leagueId) => {
  if (channels.has(leagueId)) return channels.get(leagueId);

  const entry = { connections: new Set(), subscribedOnce: false, channel: null, readyPromise: null };
  if (isOfflineLeague(leagueId)) {
    // Drafted on this device: updates come from deliverLocal, nothing to subscribe to.
    entry.readyPromise = Promise.resolve();
    channels.set(leagueId, entry);
    return entry;
  }
  const channel = supabase.channel(`league:${leagueId}`, { config: { broadcast: { self: false } } });

  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    const body = payload || {};
    if (event === 'draftStateDiff') {
      handleDiff(body.payload);
      return;
    }
    entry.connections.forEach((connection) => {
      if (body.toUserId && connection.userId && body.toUserId !== connection.userId) return;
      connection.emit(event, body.payload);
    });
  });

  entry.readyPromise = new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        // After a dropped connection we may have missed updates, so catch up.
        if (entry.subscribedOnce) refetchLeague(leagueId);
        entry.subscribedOnce = true;
        resolve();
      }
    });
  });

  entry.channel = channel;
  channels.set(leagueId, entry);
  return entry;
};

const releaseChannel = (leagueId, connection) => {
  const entry = channels.get(leagueId);
  if (!entry) return;
  entry.connections.delete(connection);
  if (entry.connections.size === 0) {
    if (entry.channel) supabase.removeChannel(entry.channel);
    channels.delete(leagueId);
  }
};

export const createDraftConnection = ({ leagueIds = [], userId = null } = {}) => {
  const handlers = new Map();
  const ids = [...new Set(leagueIds.filter(Boolean))];
  let started = false;

  const connection = {
    userId,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return connection;
    },
    emit(event, payload) {
      (handlers.get(event) || []).forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Live update handler for ${event} failed:`, error);
        }
      });
    },
    async start() {
      if (started) return;
      started = true;
      const entries = ids.map((id) => {
        const entry = ensureChannel(id);
        entry.connections.add(connection);
        return entry;
      });
      await Promise.all(entries.map((entry) => entry.readyPromise));
    },
    stop() {
      if (!started) return;
      started = false;
      ids.forEach((id) => releaseChannel(id, connection));
      handlers.clear();
    },
  };

  return connection;
};
