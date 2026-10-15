// A whole nearby-phones draft: the commissioner's phone and three player phones, each with its own copy of
// the app (modules) and its own storage, talking only through a pretend radio. Uses the real draft rules.

const players = ['Josh Allen', 'Bijan Robinson', 'Ja\'Marr Chase', 'Justin Jefferson', 'CeeDee Lamb', 'Breece Hall']
  .map((name, i) => ({ id: `p${i + 1}`, name, position: i ? 'WR' : 'QB', team: 'BUF', rank: i + 1, bye: 7, isDrafted: false, price: 0 }));
const USERS = ['admin', 'u2', 'u3', 'u4'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same behaviour as storage.js, but each phone keeps its own.
const phoneStorage = () => {
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
  };
  return api;
};

// The radio: delivers each phone's messages to the phones it names (players only ever reach the host).
const makeAir = () => {
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
      async host({ room }) {
        Object.assign(me, { room, role: 'host' });
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
      async stop() { me.role = null; },
    };
  };
  const powerOff = (peerId) => {
    const p = phones.get(peerId);
    p.up = false;
    phones.forEach((other, id) => { if (id !== peerId) emit(id, 'peerState', { peerId, state: 'disconnected' }); });
  };
  return { transportFor, powerOff };
};

// One copy of the app on one phone.
const bootPhone = (storage) => {
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
      engine: require('./engine.generated'),
    };
  });
  return app;
};

// Builds the league as the server would: commissioner plus three ready players, 1-second clocks.
const makeLeague = async (engine) => {
  const rows = new Map();
  let n = 0;
  const ctx = (userId) => ({
    leagues: {
      async get(id) { return rows.get(id) ? JSON.parse(JSON.stringify(rows.get(id))) : null; },
      async getLight(id) { return rows.get(id) ? { ...rows.get(id).league, version: rows.get(id).version } : null; },
      async create(league) { rows.set(league.id, { league, version: 1 }); return 1; },
      async replace(league, expected) { rows.set(league.id, { league, version: expected + 1 }); return expected + 1; },
      async delete() {}, async findByName() { return null; }, async listForMember() { return []; },
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
  const q = new URLSearchParams();
  const created = await engine.handle(ctx('admin'), 'POST', 'CreateLeague', q, {
    name: 'Hood', password: 'pw', draftTimers: { bidTimer: 1, intermissionTimer: 1, rebidTimer: 1 },
  });
  const id = created.body.id;
  for (const u of USERS.slice(1)) {
    await engine.handle(ctx(u), 'POST', 'JoinLeague', q, { leagueId: id });
    await engine.handle(ctx(u), 'POST', `leagues/${id}/ready`, q, { isReady: true, ready: true });
  }
  return rows.get(id);
};

jest.setTimeout(60000);

test('a full nearby draft: blind bids, ties, late bids, a dropped phone, a restart, and results to upload', async () => {
  const air = makeAir();
  const storages = Object.fromEntries(USERS.map((u) => [u, phoneStorage()]));
  const phones = Object.fromEntries(USERS.map((u) => [u, bootPhone(storages[u])]));
  const { league, version } = await makeLeague(phones.admin.engine);
  const id = league.id;
  const url = (path) => `${phones.admin.api.API_BASE_URL}/leagues/${id}/${path}`;

  // Before the draft (online): the commissioner saves the league; each player saves a ticket.
  storages.admin.writeOfflineLeague(id, { league, version, baseVersion: version, savedAt: new Date().toISOString(), userId: 'admin', nearbyHost: true });
  storages.admin.rememberOfflineUser({ userId: 'admin', userDetails: 'Tyler' });
  for (const u of USERS.slice(1)) {
    storages[u].writeOfflineLeague(id, { league: { ...league, activeBids: {}, _version: version }, version, savedAt: new Date().toISOString(), userId: u, userName: u, remote: true });
    storages[u].rememberOfflineUser({ userId: u, userDetails: u });
  }

  // Draft night, no internet. The commissioner opens the app and hosts; players open the draft room.
  phones.admin.nearby.connectTransport(air.transportFor('H'));
  await phones.admin.nearby.startHosting(id, { userId: 'admin', userDetails: 'Tyler' });
  const views = {};
  for (const u of USERS.slice(1)) {
    phones[u].nearby.connectTransport(air.transportFor(`P-${u}`));
    views[u] = { updates: [] };
    const conn = phones[u].realtime.createDraftConnection({ leagueIds: [id], userId: u });
    conn.on('draftStateUpdate', (l) => views[u].updates.push(l));
    await conn.start();
    const state = await phones[u].axios.get(url('state'));
    expect(state.data.name).toBe('Hood');
    expect(state.data.password ?? null).toBeNull();
  }
  let hostStatus;
  phones.admin.nearby.watchNearby((s) => { hostStatus = s; });
  expect(hostStatus).toMatchObject({ role: 'host', players: 3 });

  const ax = (u) => phones[u].axios;
  const post = (u, path, body = {}) => ax(u).post(url(path), body, { suppressBidLimitAlert: true });
  const leagueOn = async (u) => (await ax(u).get(url('state'))).data;
  const othersBids = (l, u) => Object.keys(l.activeBids || {}).filter((k) => k !== u);
  const waitClock = () => sleep(1150);

  // ---- Round 1: three different bids; only the highest wins, and nobody sees anyone else's bid.
  await post('admin', 'startDraft');
  const p1 = (await leagueOn('u2')).currentPlayerId;
  expect(p1).toBeTruthy();
  const r = await Promise.all([post('u2', 'bid', { amount: 10 }), post('u3', 'bid', { amount: 15 }), post('u4', 'bid', { amount: 12 })]);
  expect(r.map((x) => x.data.activeBids)).toEqual([{ u2: expect.objectContaining({ amount: 10 }) }, { u3: expect.objectContaining({ amount: 15 }) }, { u4: expect.objectContaining({ amount: 12 }) }]);
  for (const u of USERS.slice(1)) expect(othersBids(await leagueOn(u), u)).toEqual([]);
  expect(othersBids(await leagueOn('admin'), 'admin')).toEqual([]); // not even the commissioner
  await waitClock();
  await expect(post('u2', 'bid', { amount: 50 })).rejects.toMatchObject({ response: { status: 400 } }); // too late
  await post('u4', 'endBidding'); // a player's clock hits zero first
  let l = await leagueOn('u2');
  expect(l.status).toBe('intermission');
  const u3Team = l.teams.find((t) => t.ownerId === 'u3');
  expect(u3Team.roster.map((p) => p.player.id)).toEqual([p1]);
  expect(u3Team.budget).toBe(185);
  expect(l.draftLog).toHaveLength(1);
  expect(l.draftLog[0]).toMatchObject({ winningBid: 15 });

  // ---- Round 2: a tie goes to a rebid round; only the tied players can rebid, higher than the tie.
  await waitClock();
  await post('admin', 'nextRound'); // the commissioner's clock this time
  const p2 = (await leagueOn('u3')).currentPlayerId;
  await Promise.all([post('u2', 'bid', { amount: 20 }), post('u4', 'bid', { amount: 20 })]);
  await waitClock();
  await post('u3', 'endBidding');
  l = await leagueOn('u2');
  expect(l.status).toBe('tiebreaker');
  expect(l.tieBreaker.tiedTeamIds.sort()).toEqual(['u2', 'u4']);
  await expect(post('u3', 'tiebreaker-bid', { amount: 25 })).rejects.toMatchObject({ response: { status: 401 } });
  await post('u4', 'tiebreaker-bid', { amount: 24 });
  expect(othersBids(await leagueOn('u2'), 'u2')).toEqual([]);
  await waitClock();
  await post('u2', 'endBidding');
  l = await leagueOn('u3');
  expect(l.teams.find((t) => t.ownerId === 'u4').roster.map((p) => p.player.id)).toEqual([p2]);
  expect(l.draftLog).toHaveLength(2);

  // ---- A player's phone drops out (dead battery): the host notices and the draft carries on.
  air.powerOff('P-u4');
  expect(hostStatus.players).toBe(2);

  // ---- The commissioner's app closes and reopens: the draft is still on the phone and hosting resumes.
  const before = storages.admin.readOfflineLeague(id).league.draftLog.length;
  phones.admin = bootPhone(storages.admin);
  phones.admin.nearby.connectTransport(air.transportFor('H'));
  await phones.admin.nearby.startHosting(id, { userId: 'admin', userDetails: 'Tyler' });
  await sleep(20);
  expect(storages.admin.readOfflineLeague(id).league.draftLog).toHaveLength(before);

  // ---- Round 3 after the restart: players still bid through the host.
  await waitClock();
  await post('admin', 'nextRound');
  const bid = await post('u3', 'bid', { amount: 5 });
  expect(bid.data.activeBids.u3.amount).toBe(5);
  await waitClock();
  await post('admin', 'endBidding');
  l = await leagueOn('u2');
  expect(l.draftLog).toHaveLength(3);
  expect(l.teams.find((t) => t.ownerId === 'u3').budget).toBe(180);

  // Live updates reached the players' draft rooms, and none ever showed someone else's bid.
  for (const u of ['u2', 'u3']) {
    expect(views[u].updates.length).toBeGreaterThan(3);
    views[u].updates.forEach((update) => expect(othersBids(update, u)).toEqual([]));
  }

  // Players' phones only hold their ticket; the commissioner's phone holds the draft to upload.
  const saved = storages.admin.readOfflineLeague(id);
  expect(saved.baseVersion).toBe(version);
  expect(saved.league.draftLog.map((p) => p.winningBid)).toEqual([15, 24, 5]);
  expect(storages.u2.readOfflineLeague(id).league.draftLog || []).toHaveLength(0);
});
