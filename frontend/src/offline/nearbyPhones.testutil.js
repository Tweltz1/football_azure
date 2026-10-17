// Pretend phones for nearby-draft tests: per-phone storage, a pretend radio, and one app copy per phone.

// Same behaviour as storage.js, but each phone keeps its own.
export const phoneStorage = () => {
  const store = new Map();
  const read = (k, fallback) => (store.has(k) ? JSON.parse(store.get(k)) : fallback);
  const write = (k, v) => store.set(k, JSON.stringify(v));
  const ids = () => read('index', []);
  const api = {
    LEAGUE_KEY_PREFIX: 'hl-offline:league:',
    offlineLeagueIds: ids,
    isOfflineLeague: (id) => Boolean(id) && ids().includes(id),
    readOfflineLeague: (id) => (api.isOfflineLeague(id) ? read(`league:${id}`, null) : null),
    writeOfflineLeague: (id, entry) => { write(`league:${id}`, entry); if (!ids().includes(id)) write('index', [...ids(), id]); },
    removeOfflineLeague: (id) => { store.delete(`league:${id}`); write('index', ids().filter((x) => x !== id)); },
    rememberOfflineUser: (user) => write('user', { userId: user.userId, userDetails: user.userDetails || 'Commissioner' }),
    offlineUser: () => (ids().length ? read('user', null) : null),
    rememberName: (userId, name) => write('names', { ...read('names', {}), [userId]: name }),
    nameFor: (userId) => read('names', {})[userId] || null,
    guestUser: () => read('guest', null),
  };
  return api;
};

// The radio: delivers each phone's messages to the phones it names (players only ever reach the host).
export const makeAir = () => {
  const phones = new Map(); // peerId -> { listeners, room, role }
  const emit = (peerId, event, data) => (phones.get(peerId)?.listeners[event] || []).forEach((fn) => fn(data));
  const transportFor = (peerId) => {
    const me = { listeners: {}, room: null, role: null, up: true };
    phones.set(peerId, me);
    const connect = (hostId) => {
      emit(hostId, 'peerState', { peerId, name: peerId, state: 'connected' });
      emit(peerId, 'peerState', { peerId: hostId, name: hostId, state: 'connected' });
    };
    return {
      addListener(event, fn) { (me.listeners[event] = me.listeners[event] || []).push(fn); },
      async host({ room, league }) {
        Object.assign(me, { room, league, role: 'host' });
        // Players already looking for this room connect as soon as the host appears.
        phones.forEach((p, id) => {
          if (p.role !== 'player' || p.room !== room || !p.up) return;
          emit(peerId, 'peerState', { peerId: id, state: 'connected' });
          emit(id, 'peerState', { peerId, state: 'connected' });
        });
      },
      async join({ room }) {
        Object.assign(me, { room, role: 'player' });
        const host = [...phones.entries()].find(([, p]) => p.role === 'host' && p.room === room && p.up);
        if (host) setTimeout(() => connect(host[0]), 1);
      },
      async send({ data, to }) {
        const targets = to || [...phones.keys()].filter((id) => id !== peerId && phones.get(id).room === me.room && phones.get(id).up);
        targets.forEach((id) => setTimeout(() => emit(id, 'message', { peerId, data }), 1));
        return { sent: targets.length };
      },
      async scan() {
        Object.assign(me, { room: null, role: 'scan' });
        phones.forEach((p, id) => {
          if (p.role === 'host' && p.up) setTimeout(() => emit(peerId, 'hostFound', { peerId: id, name: id, room: p.room, league: p.league }), 1);
        });
      },
      async stop() { me.role = null; },
    };
  };
  const powerOff = (peerId) => {
    const p = phones.get(peerId);
    p.up = false;
    phones.forEach((other, id) => { if (id !== peerId) emit(id, 'peerState', { peerId, state: 'disconnected' }); });
  };
  return { transportFor, powerOff, phones };
};

// One copy of the app on one phone.
export const bootPhone = (storage) => {
  let app;
  jest.isolateModules(() => {
    jest.doMock('../supabaseClient', () => ({
      SUPABASE_URL: 'https://x.supabase.co',
      supabase: {
        auth: { getSession: async () => ({ data: { session: null } }) },
        channel: () => { throw new Error('nearby drafts must not open an internet channel'); },
        removeChannel: () => {},
      },
    }));
    jest.doMock('./storage', () => storage);
    app = {
      axios: require('axios'),
      api: require('../api'),
      realtime: require('../realtime'),
      nearby: require('./nearbyDraft'),
      offlineSync: require('./offlineSync'),
      engine: require('./engine.generated'),
    };
  });
  return app;
};

