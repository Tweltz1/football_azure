// Runs the API handlers against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Ctx } from '../functions/_shared/handlers.ts';
import { applyOps, diffObjects } from '../functions/_shared/diff.ts';
import { getInitialPlayerPool } from '../functions/_shared/playerData.ts';
import { buildDefenseTable, clearStartSitCache } from '../functions/_shared/startSit.ts';
import { clearSleeperCache } from '../functions/_shared/sleeperImport.ts';
import type { DraftHistoryEntry, League, UserProfile } from '../functions/_shared/models.ts';
import type { HistoryStore, LeagueStore, ProfileStore, StoredLeague } from '../functions/_shared/ports.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function memoryWorld() {
  const leagueRows = new Map<string, StoredLeague>();
  const profileRows = new Map<string, UserProfile>();
  const historyRows = new Map<string, DraftHistoryEntry>();
  const fetched: string[] = [];
  let fetchResponses: (url: string) => unknown = () => { throw new Error('offline'); };
  const sent: { leagueId: string; event: string; payload: any; toUserId?: string }[] = [];
  let clock = Date.parse('2026-09-01T18:00:00Z');
  let ids = 0;

  const leagues: LeagueStore = {
    async get(id) { const r = leagueRows.get(id); return r ? clone(r) : null; },
    async getLight(id) {
      const r = leagueRows.get(id);
      return r ? clone({ status: r.league.status, auctionTimer: r.league.auctionTimer, version: r.version }) : null;
    },
    async create(league) { leagueRows.set(league.id, { league: clone(league), version: 1 }); return 1; },
    async replace(league, expected) {
      const r = leagueRows.get(league.id);
      if (!r || r.version !== expected) return null;
      leagueRows.set(league.id, { league: clone(league), version: expected + 1 });
      return expected + 1;
    },
    async delete(id) { leagueRows.delete(id); },
    async findByName(name) { for (const r of leagueRows.values()) if (r.league.name === name) return clone(r); return null; },
    async listForMember(userId) { return [...leagueRows.values()].filter((r) => r.league.members.includes(userId)).map(clone); },
  };
  const profiles: ProfileStore = {
    async find(id) { const p = profileRows.get(id); return p ? clone(p) : null; },
    async upsert(p) { profileRows.set(p.userId, clone(p)); },
  };

  const history: HistoryStore = {
    async save(entry) { historyRows.set(entry.id, clone(entry)); },
    async get(id) { const e = historyRows.get(id); return e ? clone(e) : null; },
    async listForMember(userId) { return [...historyRows.values()].filter((e) => e.members.includes(userId)).map(clone); },
  };

  const ctxFor = (userId: string | null): Ctx => ({
    leagues,
    profiles,
    history,
    broadcaster: { async send(leagueId, event, payload, toUserId) { sent.push({ leagueId, event, payload: clone(payload), toUserId }); } },
    log: { info() {}, warn() {}, error() {} },
    now: () => new Date(clock),
    newId: () => `id-${++ids}`,
    playerPool: getInitialPlayerPool,
    async fetchJson(url) { fetched.push(url); return clone(fetchResponses(url)); },
    userId,
    displayName: userId ? `${userId}-name` : null,
  });

  const call = (userId: string | null, method: string, path: string, body?: unknown, query = '') =>
    handle(ctxFor(userId), method, path, new URLSearchParams(query), body);

  return {
    call, sent, leagueRows, historyRows, fetched,
    respondWith: (fn: (url: string) => unknown) => { fetchResponses = fn; },
    advance: (seconds: number) => { clock += seconds * 1000; },
    league: (id: string) => leagueRows.get(id)!.league as League,
  };
}

async function setupAuctionLeague(world: ReturnType<typeof memoryWorld>, members = ['admin', 'bob', 'cara']) {
  const created = await world.call(members[0], 'POST', 'CreateLeague', { name: 'Hood', password: 'pw' });
  assert.equal(created.status, 200);
  const leagueId = (created.body as any).id;
  for (const member of members.slice(1)) {
    const joined = await world.call(member, 'POST', 'JoinLeague', { leagueName: 'Hood', password: 'pw' });
    assert.equal(joined.status, 200, String(joined.body));
    assert.equal((await world.call(member, 'POST', `leagues/${leagueId}/ready`, { isReady: true })).status, 200);
  }
  return leagueId as string;
}

test('requires sign-in except for health and CSV', async () => {
  const world = memoryWorld();
  assert.equal((await world.call(null, 'GET', 'health')).status, 200);
  assert.equal((await world.call(null, 'GET', 'GetLeagues')).status, 401);
  assert.equal((await world.call(null, 'POST', 'CreateLeague', { name: 'x' })).status, 401);
});

test('create, join, list, and never leak the password', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);

  const wrongPassword = await world.call('dan', 'POST', 'JoinLeague', { leagueName: 'Hood', password: 'nope' });
  assert.equal(wrongPassword.status, 401);
  const again = await world.call('bob', 'POST', 'JoinLeague', { leagueName: 'Hood', password: 'pw' });
  assert.equal(again.status, 409);
  const invite = await world.call('dan', 'POST', 'JoinLeague', { leagueId });
  assert.equal(invite.status, 200);

  const list = await world.call('bob', 'GET', 'GetLeagues');
  const leagues = list.body as any[];
  assert.equal(leagues.length, 1);
  assert.equal(leagues[0].password, null);
  assert.equal(leagues[0].teams.length, 4);
  assert.equal(typeof leagues[0]._version, 'number');

  const state = await world.call('bob', 'GET', `leagues/${leagueId}/state`);
  assert.equal((state.body as any).password, null);
  assert.ok((state.body as any).initialPlayerPool.length > 300);

  const unique = await world.call('bob', 'GET', 'CheckLeagueName', undefined, 'leagueName=Hood');
  assert.deepEqual(unique.body, { isUnique: false });
});

test('the acting user comes from the token, not the request body', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  // bob pretends to be the admin
  const start = await world.call('bob', 'POST', `leagues/${leagueId}/startDraft`, { adminId: 'admin' });
  assert.equal(start.status, 401);

  assert.equal((await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {})).status, 200);
  // bob bids "as cara"; the bid is recorded for bob
  assert.equal((await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { userId: 'cara', amount: 5 })).status, 200);
  assert.deepEqual(Object.keys(world.league(leagueId).activeBids), ['bob']);
});

test('full auction round: bids, max bid rule, award, intermission, next player', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});

  let league = world.league(leagueId);
  assert.equal(league.status, 'drafting');
  const playerId = league.currentPlayerId!;
  assert.ok(playerId);

  // 17 roster spots: max bid is 200 - 16 = 184
  const tooHigh = await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { amount: 185 });
  assert.equal(tooHigh.status, 400);
  assert.match(String(tooHigh.body), /max bid of \$184/);

  await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { amount: 10 });
  await world.call('cara', 'POST', `leagues/${leagueId}/bid`, { amount: 12 });

  const early = await world.call('bob', 'POST', `leagues/${leagueId}/endBidding`);
  assert.equal(early.body, 'Auction timer is still active.');

  world.advance(21);
  const closed = await world.call('bob', 'POST', `leagues/${leagueId}/endBidding`);
  assert.equal(closed.body, 'Auction closed.');
  const duplicate = await world.call('cara', 'POST', `leagues/${leagueId}/endBidding`);
  assert.equal(duplicate.body, 'No active auction to close.');

  league = world.league(leagueId);
  assert.equal(league.status, 'intermission');
  const cara = league.teams.find((t) => t.ownerId === 'cara')!;
  assert.equal(cara.budget, 188);
  assert.equal(cara.roster.length, 1);
  assert.equal(league.draftLog.length, 1);
  assert.deepEqual(Object.keys(league.draftLog[0].allBids).sort(), ['bob', 'cara']);
  assert.equal(league.initialPlayerPool.find((p) => p.id === playerId)!.isDrafted, true);

  world.advance(31);
  const next = await world.call('admin', 'POST', `leagues/${leagueId}/nextRound`);
  assert.equal(next.body, 'Next round started.');
  league = world.league(leagueId);
  assert.equal(league.status, 'drafting');
  assert.notEqual(league.currentPlayerId, playerId);

  // undo is only allowed in intermission; a round with no bids skips the player, so undo reverts cara's pick
  assert.equal((await world.call('admin', 'POST', `leagues/${leagueId}/undo-pick`)).status, 400);
  world.advance(21);
  await world.call('admin', 'POST', `leagues/${leagueId}/endBidding`);
  assert.equal(world.league(leagueId).status, 'intermission');
  const undo = await world.call('admin', 'POST', `leagues/${leagueId}/undo-pick`);
  assert.equal(undo.status, 200);
  const caraAfterUndo = world.league(leagueId).teams.find((t) => t.ownerId === 'cara')!;
  assert.equal(caraAfterUndo.budget, 200);
  assert.equal(caraAfterUndo.roster.length, 0);
  assert.equal(world.league(leagueId).initialPlayerPool.find((p) => p.id === playerId)!.isDrafted, false);
});

test('ties: rebid round, default +1 bids, then admin resolution', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { amount: 7 });
  await world.call('cara', 'POST', `leagues/${leagueId}/bid`, { amount: 7 });
  world.advance(21);
  await world.call('bob', 'POST', `leagues/${leagueId}/endBidding`);

  let league = world.league(leagueId);
  assert.equal(league.status, 'tiebreaker');
  assert.deepEqual(league.tieBreaker, { tiedTeamIds: ['bob', 'cara'], tieAmount: 7, round: 1 });

  const lowRebid = await world.call('bob', 'POST', `leagues/${leagueId}/tiebreaker-bid`, { amount: 7 });
  assert.equal(lowRebid.status, 400);
  const outsider = await world.call('admin', 'POST', `leagues/${leagueId}/tiebreaker-bid`, { amount: 9 });
  assert.equal(outsider.status, 401);

  // Nobody rebids: both get default bids of 8, still tied, so it goes to the admin.
  world.advance(16);
  await world.call('cara', 'POST', `leagues/${leagueId}/endBidding`);
  league = world.league(leagueId);
  assert.equal(league.tieBreaker!.round, 2);
  assert.equal(league.tieBreaker!.tieAmount, 8);
  assert.equal(league.auctionTimer!.isPaused, true);

  const bobTeam = league.teams.find((t) => t.ownerId === 'bob')!;
  assert.equal((await world.call('bob', 'POST', `leagues/${leagueId}/resolve-tie`, { winningTeamId: bobTeam.id })).status, 401);
  const resolved = await world.call('admin', 'POST', `leagues/${leagueId}/resolve-tie`, { winningTeamId: bobTeam.id });
  assert.equal(resolved.status, 200);
  league = world.league(leagueId);
  assert.equal(league.teams.find((t) => t.ownerId === 'bob')!.budget, 192);
  assert.equal(league.status, 'intermission');
});

test('pause, nominate, skip, kick and budget tools', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  world.advance(5);

  const paused = await world.call('admin', 'POST', `leagues/${leagueId}/pause`);
  assert.equal((paused.body as any).isPaused, true);
  assert.equal((paused.body as any).timeRemainingOnPause, 15);

  const target = world.league(leagueId).initialPlayerPool.find((p) => p.id !== world.league(leagueId).currentPlayerId)!;
  const nominated = await world.call('admin', 'POST', `leagues/${leagueId}/nominate`, { playerId: target.id });
  assert.equal(nominated.status, 200);
  assert.equal(world.league(leagueId).currentPlayerId, target.id);

  const skipped = await world.call('admin', 'POST', `leagues/${leagueId}/skip`);
  assert.equal(skipped.status, 200);
  assert.notEqual(world.league(leagueId).currentPlayerId, target.id);

  const caraTeam = world.league(leagueId).teams.find((t) => t.ownerId === 'cara')!;
  const adjusted = await world.call('admin', 'POST', `leagues/${leagueId}/adjust-budget`, { teamId: caraTeam.id, newBudget: 150 });
  assert.equal(adjusted.status, 200);
  assert.ok(world.sent.some((m) => m.event === 'budgetAdjustmentNotice' && m.payload.newBudget === 150));

  const adminTeam = world.league(leagueId).teams.find((t) => t.ownerId === 'admin')!;
  assert.equal((await world.call('admin', 'POST', `leagues/${leagueId}/kick`, { teamIdToKick: adminTeam.id })).status, 400);
  assert.equal((await world.call('admin', 'POST', `leagues/${leagueId}/kick`, { teamIdToKick: caraTeam.id })).status, 200);
  assert.ok(!world.league(leagueId).members.includes('cara'));
});

test('manual draft: teams, assignment, awards, undo, CSV', async () => {
  const world = memoryWorld();
  const created = await world.call('admin', 'POST', 'CreateLeague', { name: 'Manual', draftMode: 'manual', password: '' });
  const leagueId = (created.body as any).id;
  await world.call('bob', 'POST', 'JoinLeague', { leagueId });
  assert.equal(world.league(leagueId).teams.length, 1, 'joining a manual league adds no team');

  await world.call('admin', 'POST', `leagues/${leagueId}/manual-teams`, { teamName: 'Couch', budget: 150 });
  const couch = world.league(leagueId).teams.find((t) => t.name === 'Couch')!;
  assert.match(couch.ownerId, /^manual-/);
  await world.call('admin', 'POST', `leagues/${leagueId}/manual-teams/assign`, { teamId: couch.id, userId: 'bob' });
  assert.equal(world.league(leagueId).teams.find((t) => t.id === couch.id)!.ownerId, 'bob');

  const notStarted = await world.call('admin', 'POST', `leagues/${leagueId}/manual-award`, { teamId: couch.id, playerId: 'sleeper-4984', amount: 30 });
  assert.equal(notStarted.status, 400);
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  assert.equal(world.league(leagueId).status, 'manual');

  const awarded = await world.call('admin', 'POST', `leagues/${leagueId}/manual-award`, { teamId: couch.id, playerId: 'sleeper-4984', amount: 30 });
  assert.equal(awarded.status, 200);
  assert.equal((awarded.body as any).teams.find((t: any) => t.id === couch.id).budget, 120);
  assert.equal((awarded.body as any).status, 'manual');

  const csv = await world.call(null, 'GET', `leagues/${leagueId}/results.csv`);
  assert.equal(csv.status, 200);
  assert.match(String(csv.body), /1,"Josh Allen",QB,BUF,30,"Couch"/);
  assert.match(csv.headers!['Content-Disposition'], /Manual-DraftResults\.csv/);

  await world.call('admin', 'POST', `leagues/${leagueId}/undo-pick`);
  assert.equal(world.league(leagueId).teams.find((t) => t.id === couch.id)!.budget, 150);
});

test('profiles: create, update own only, favorites sync to league teams', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  const profile = await world.call('bob', 'POST', 'user-profile', { userId: 'someone-else', displayName: 'Bobby' });
  assert.equal((profile.body as any).userId, 'bob');

  assert.equal((await world.call('bob', 'POST', 'user-profile/cara', { displayName: 'x' })).status, 403);
  const updated = await world.call('bob', 'POST', 'user-profile/bob', {
    defaultTeamName: 'Bob Squad', favoritePlayerIds: ['a', 'A', ' b '], playerTiers: { a: 9, b: 2 }, budgetPlan: { qb: 500 },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual((updated.body as any).favoritePlayerIds, ['a', 'b']);
  assert.deepEqual((updated.body as any).playerTiers, { b: 2 });
  assert.deepEqual((updated.body as any).budgetPlan, { QB: 200 });
  assert.deepEqual(world.league(leagueId).teams.find((t) => t.ownerId === 'bob')!.favoritePlayerIds, ['a', 'b']);

  const fav = await world.call('bob', 'POST', `leagues/${leagueId}/favorites`, { playerIds: ['z'] });
  assert.equal((fav.body as any).leagueTeamSynced, true);
});

test('live updates are small diffs that rebuild the full league', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  const state = (await world.call('bob', 'GET', `leagues/${leagueId}/state`)).body as any;
  let mirror = { ...state };
  delete mirror._version;
  let version = state._version;

  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { amount: 3 });
  world.advance(21);
  await world.call('bob', 'POST', `leagues/${leagueId}/endBidding`);

  const diffs = world.sent.filter((m) => m.event === 'draftStateDiff' && m.payload.baseVersion >= version);
  for (const message of diffs) {
    assert.equal(message.payload.baseVersion, version);
    mirror = applyOps(mirror, message.payload.ops);
    version = message.payload.version;
  }
  const fresh = (await world.call('bob', 'GET', `leagues/${leagueId}/state`)).body as any;
  delete fresh._version;
  assert.deepEqual(mirror, fresh);

  const bidDiff = diffs[1];
  assert.ok(JSON.stringify(bidDiff.payload).length < 1000, 'a bid broadcast is tiny');
});

test('diff handles appends, item edits, deletes and replacements', () => {
  const a = { list: [1, 2], items: [{ id: 1 }, { id: 2 }, { id: 3 }], gone: 1, obj: { x: 1 } };
  const b = { list: [1, 2, 3], items: [{ id: 1 }, { id: 9 }, { id: 3 }], obj: { x: 2 }, added: true };
  assert.deepEqual(applyOps(a, diffObjects(a, b)), b);
});

test('invite links: preview, join without a password, already a member, finished drafts', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world, ['admin', 'bob']);

  const preview = await world.call('dan', 'GET', `invite/${leagueId}`);
  assert.equal(preview.status, 200);
  assert.equal((preview.body as any).name, 'Hood');
  assert.equal((preview.body as any).memberCount, 2);
  assert.equal((preview.body as any).isMember, false);
  assert.equal((preview.body as any).password, undefined);
  assert.equal((await world.call('bob', 'GET', `invite/${leagueId}`)).body.isMember, true);
  assert.equal((await world.call('dan', 'GET', 'invite/nope')).status, 404);
  assert.equal((await world.call(null, 'GET', `invite/${leagueId}`)).status, 401);

  const joined = await world.call('dan', 'POST', 'JoinLeague', { leagueId });
  assert.equal(joined.status, 200);
  assert.ok(world.league(leagueId).members.includes('dan'));
  assert.equal((await world.call('dan', 'POST', 'JoinLeague', { leagueId })).status, 409);

  await world.call('admin', 'POST', `leagues/${leagueId}/complete`);
  const late = await world.call('erin', 'POST', 'JoinLeague', { leagueId });
  assert.equal(late.status, 400);
  assert.match(String(late.body), /already finished/);
});

async function draftOnePick(world: ReturnType<typeof memoryWorld>, leagueId: string, bidder: string, amount: number) {
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  await world.call(bidder, 'POST', `leagues/${leagueId}/bid`, { amount });
  world.advance(21);
  await world.call(bidder, 'POST', `leagues/${leagueId}/endBidding`);
  return world.league(leagueId).draftLog[0].player;
}

test('draft history: saved on completion, private to members, survives a new season', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world, ['admin', 'bob']);
  const player = await draftOnePick(world, leagueId, 'bob', 25);
  assert.equal(world.historyRows.size, 0, 'nothing is saved until the draft is finished');

  assert.equal((await world.call('bob', 'POST', `leagues/${leagueId}/new-season`)).status, 401);
  assert.equal((await world.call('admin', 'POST', `leagues/${leagueId}/new-season`)).status, 400);

  await world.call('admin', 'POST', `leagues/${leagueId}/complete`);
  assert.equal(world.historyRows.size, 1);
  const firstId = `${leagueId}-draft-1`;
  const saved = world.historyRows.get(firstId)!;
  assert.equal(saved.season, 2026);
  assert.equal(saved.draftLog[0].player.id, player.id);
  assert.equal(saved.draftLog[0].winningBid, 25);
  assert.equal((saved as any).initialPlayerPool, undefined, 'the player pool is not copied');

  const list = await world.call('bob', 'GET', 'history');
  assert.equal(list.status, 200);
  assert.equal((list.body as any[]).length, 1);
  assert.equal((list.body as any[])[0].myTeamName, world.league(leagueId).teams.find((t) => t.ownerId === 'bob')!.name);
  assert.deepEqual((list.body as any[])[0].topPick, { name: player.name, position: player.position, price: 25 });
  assert.equal(((await world.call('stranger', 'GET', 'history')).body as any[]).length, 0);
  assert.equal((await world.call('stranger', 'GET', `history/${firstId}`)).status, 404);
  assert.equal((await world.call('bob', 'GET', `history/${firstId}`)).status, 200);

  world.advance(3600);
  const reset = await world.call('admin', 'POST', `leagues/${leagueId}/new-season`);
  assert.equal(reset.status, 200, String(reset.body));
  const league = world.league(leagueId);
  assert.equal(league.status, 'created');
  assert.equal(league.draftNumber, 2);
  assert.equal(league.draftLog.length, 0);
  assert.deepEqual(league.readyMembers, []);
  assert.ok(league.teams.every((t) => t.budget === 200 && t.roster.length === 0));
  assert.equal(league.initialPlayerPool.find((p) => p.id === player.id)!.isDrafted, false);
  assert.equal(world.historyRows.get(firstId)!.completedAt, saved.completedAt, 'new season keeps the original finish time');

  // Second draft is saved separately.
  await world.call('bob', 'POST', `leagues/${leagueId}/ready`, { isReady: true });
  await draftOnePick(world, leagueId, 'admin', 40);
  await world.call('admin', 'POST', `leagues/${leagueId}/complete`);
  assert.equal(world.historyRows.size, 2);
  assert.equal(world.historyRows.get(`${leagueId}-draft-2`)!.draftLog[0].winningBid, 40);
});

test('draft history: drafts finished before history existed show up', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world, ['admin', 'bob']);
  await draftOnePick(world, leagueId, 'bob', 7);
  await world.call('admin', 'POST', `leagues/${leagueId}/complete`);
  world.historyRows.clear();

  const list = await world.call('admin', 'GET', 'history');
  assert.equal((list.body as any[]).length, 1);
  assert.equal(world.historyRows.size, 1);
  assert.equal(((await world.call('admin', 'GET', 'history')).body as any[]).length, 1, 'not duplicated');
});

test('start/sit: weekly projections from Sleeper, cached, with ids that match the draft pool', async () => {
  clearStartSitCache();
  const world = memoryWorld();
  world.respondWith((url) => {
    if (url.includes('/state/nfl')) return { season: '2026', week: 6, display_week: 6, season_type: 'regular' };
    return [
      { player_id: '4984', team: 'BUF', opponent: 'KC', stats: { pts_ppr: 24.31, pts_half_ppr: 24.31, pts_std: 24.31 },
        player: { first_name: 'Josh', last_name: 'Allen', position: 'QB', injury_status: null } },
      { player_id: '9509', team: 'ATL', opponent: 'TB', stats: { pts_std: 14, rec: 4 },
        player: { first_name: 'Bijan', last_name: 'Robinson', position: 'RB', injury_status: 'Questionable' } },
      { player_id: 'BUF', team: 'BUF', opponent: 'KC', stats: { pts_std: 7, pts_ppr: 7, pts_half_ppr: 7 },
        player: { first_name: 'Buffalo', last_name: 'Bills', position: 'DEF' } },
      { player_id: '1', team: 'NYJ', stats: { pts_ppr: 0, pts_std: 0 }, player: { first_name: 'No', last_name: 'Points', position: 'WR' } },
      { player_id: '2', team: 'NYJ', stats: { pts_ppr: 9 }, player: { first_name: 'Some', last_name: 'Lineman', position: 'OL' } },
    ];
  });

  assert.equal((await world.call(null, 'GET', 'startsit')).status, 401);
  const res = await world.call('bob', 'GET', 'startsit');
  assert.equal(res.status, 200, String(res.body));
  const body = res.body as any;
  assert.equal(body.season, 2026);
  assert.equal(body.week, 6);
  assert.deepEqual(body.players.map((p: any) => p.id), ['sleeper-4984', 'sleeper-9509', 'sleeper-BUF']);
  assert.deepEqual(body.players[1].points, { ppr: 18, half: 16, std: 14 });
  assert.equal(body.players[1].injury, 'Questionable');
  assert.equal(body.players[2].position, 'DST');
  assert.equal(body.players[0].opponent, 'KC');
  assert.ok(getInitialPlayerPool().some((p) => p.id === 'sleeper-4984'));
  assert.ok(getInitialPlayerPool().some((p) => p.id === 'sleeper-BUF'));

  const before = world.fetched.length;
  await world.call('cara', 'GET', 'startsit');
  assert.equal(world.fetched.length, before, 'second request is served from cache');

  await world.call('cara', 'GET', 'startsit', undefined, 'week=7');
  assert.match(world.fetched.at(-1)!, /\/2026\/7\?season_type=regular/);

  clearStartSitCache();
  world.respondWith(() => { throw new Error('down'); });
  assert.equal((await world.call('bob', 'GET', 'startsit')).status, 502);
});

test('start/sit: recent games, season average, injured teammates, and past matchups', async () => {
  clearStartSitCache();
  const world = memoryWorld();
  const row = (id: string, team: string, opponent: string, pts: number, position = 'WR', injury: string | null = null) => ({
    player_id: id, team, opponent, stats: { pts_ppr: pts, pts_half_ppr: pts - 1, pts_std: pts - 2, gp: 1 },
    player: { first_name: `P${id}`, last_name: 'Test', position, injury_status: injury },
  });
  world.respondWith((url) => {
    if (url.includes('/state/nfl')) return { season: '2026', week: 6, display_week: 6, season_type: 'regular' };
    if (url.includes('/projections/')) return [row('10', 'LAR', 'SF', 15), row('11', 'LAR', 'SF', 0, 'WR', 'Out')];
    if (url.includes('/stats/nfl/player/10')) {
      const season = Number(url.match(/season=(\d+)/)![1]);
      if (season === 2023) throw new Error('not found');
      return {
        1: { week: 1, team: 'LAR', opponent: 'SF', stats: { pts_ppr: season - 2000, gp: 1 } },
        2: null,
        3: { week: 3, team: 'LAR', opponent: 'SEA', stats: { pts_ppr: 5, gp: 1 } },
        9: { week: 9, team: 'LAR', opponent: 'SF', stats: { gp: 0 } },
      };
    }
    const week = Number(url.match(/\/stats\/nfl\/2026\/(\d+)/)![1]);
    if (week === 3) throw new Error('missing week');
    // Player 12 got hurt after week 2 and has no projection now.
    const rows: unknown[] = [row('10', 'LAR', 'SEA', week * 2), row('11', 'LAR', 'SEA', 20, 'WR', 'Out')];
    if (week <= 2) rows.push(row('12', 'LAR', 'SEA', 9, 'RB', 'IR'));
    rows.push({ player_id: '13', team: 'LAR', stats: {}, player: { first_name: 'Bench', last_name: 'Guy', position: 'WR' } });
    return rows;
  });

  const res = await world.call('bob', 'GET', 'startsit');
  assert.equal(res.status, 200, String(res.body));
  const players = new Map((res.body as any).players.map((p: any) => [p.id, p]));
  const p10 = players.get('sleeper-10') as any;
  assert.deepEqual(p10.recent.map((g: any) => g.week), [1, 2, 4, 5], 'week 3 failed to load and is skipped');
  assert.deepEqual(p10.recent.map((g: any) => g.points.ppr), [2, 4, 8, 10]);
  assert.equal(p10.seasonAvg.ppr, 6);
  assert.equal(p10.gamesPlayed, 4);
  assert.equal((players.get('sleeper-11') as any).injury, 'Out', 'injured players stay in the list');
  assert.equal((players.get('sleeper-11') as any).seasonAvg.ppr, 20);
  const p12 = players.get('sleeper-12') as any;
  assert.equal(p12.injury, 'IR', 'long-term injured players come from their last game');
  assert.equal(p12.points.ppr, 0);
  assert.equal(players.has('sleeper-13'), false, 'rows without a game played are ignored');

  const matchup = await world.call('bob', 'GET', 'startsit/matchup/sleeper-10', undefined, 'opponent=sf');
  assert.equal(matchup.status, 200, String(matchup.body));
  const body = matchup.body as any;
  assert.equal(body.opponent, 'SF');
  assert.deepEqual(body.games.map((g: any) => [g.season, g.week, g.points.ppr]), [[2026, 1, 26], [2025, 1, 25], [2024, 1, 24]]);
  assert.equal(body.average.ppr, 25);
  assert.equal(body.games[0].box.rec, 0);
  assert.equal((res.body as any).defense.SEA.WR.games, 4, 'SEA faced the LAR receivers in weeks 1, 2, 4 and 5');
  assert.equal((await world.call('bob', 'GET', 'startsit/matchup/sleeper-10', undefined, 'opponent=x')).status, 400);
  assert.equal((await world.call('bob', 'GET', 'startsit/matchup/../x', undefined, 'opponent=SF')).status, 404);
});

test('start/sit: defense table sums each game per week and ranks the easiest matchups first', () => {
  const box = (rec: number, recYd: number, recTd: number, rushAtt = 0, rushYd = 0) =>
    ({ passYd: 0, passTd: 0, int: 0, rushAtt, rushYd, rushTd: 0, tgt: rec + 2, rec, recYd, recTd });
  const line = (week: number, opponent: string, position: string, ppr: number, b: any) =>
    ({ week, opponent, position, points: { ppr, half: ppr, std: ppr }, box: b, injury: null, name: 'x', team: 'T' });
  const week1 = new Map<string, any>([
    ['a', line(1, 'KC', 'WR', 20, box(6, 90, 1))],
    ['b', line(1, 'KC', 'WR', 10, box(4, 50, 0))],
    ['c', line(1, 'DAL', 'WR', 8, box(3, 40, 0))],
    ['d', line(1, 'KC', 'RB', 12, box(2, 10, 0, 15, 60))],
    ['k', line(1, 'KC', 'K', 9, box(0, 0, 0))],
  ]);
  const week2 = new Map<string, any>([['a', line(2, 'KC', 'WR', 6, box(2, 30, 0))]]);
  const table = buildDefenseTable([week1, week2] as any);
  assert.deepEqual(table.KC.WR.games, 2);
  assert.equal(table.KC.WR.points.ppr, 18, '(20 + 10 + 6) over 2 games');
  assert.equal(table.KC.WR.box.rec, 6);
  assert.equal(table.KC.WR.box.recTd, 0.5);
  assert.equal(table.KC.WR.rank, 1);
  assert.equal(table.DAL.WR.rank, 2);
  assert.equal(table.KC.WR.teams, 2);
  assert.equal(table.KC.RB.box.rushYd, 60);
  assert.equal(table.KC.K, undefined, 'kickers are not tracked');
});

test('start/sit: import a Sleeper team with its lineup slots, scoring and current starters', async () => {
  clearStartSitCache();
  clearSleeperCache();
  const world = memoryWorld();
  world.respondWith((url) => {
    if (url.includes('/state/nfl')) return { season: '2026', week: 6, season_type: 'regular' };
    if (url.endsWith('/user/nobody')) return null;
    if (url.endsWith('/user/tyler_w')) return { user_id: 'u1', display_name: 'TylerW' };
    if (url.endsWith('/user/u1/leagues/nfl/2026')) {
      return [
        { league_id: 'L1', name: 'Hood Sleeper', scoring_settings: { rec: 0.5 },
          roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'K', 'DEF', 'BN', 'BN', 'IR', 'DL'] },
        { league_id: 'L2', name: 'Not my roster', scoring_settings: { rec: 1 }, roster_positions: ['QB'] },
      ];
    }
    if (url.endsWith('/league/L1/rosters')) {
      return [
        { owner_id: 'u9', players: ['1'], starters: ['1'] },
        { owner_id: 'u1', players: ['4984', '9509', 'BUF', '999999'], starters: ['4984', '0', 'BUF'], metadata: { team_name: 'Tyler Squad' } },
      ];
    }
    if (url.endsWith('/league/L2/rosters')) return [{ owner_id: 'u9', co_owners: ['u8'], players: [] }];
    if (url.endsWith('/league/L1/users')) return [{ user_id: 'u9', display_name: 'Rival', metadata: {} }];
    throw new Error(`unexpected ${url}`);
  });

  assert.equal((await world.call('bob', 'GET', 'startsit/sleeper', undefined, 'username=a b')).status, 400);
  assert.equal((await world.call('bob', 'GET', 'startsit/sleeper', undefined, 'username=nobody')).status, 404);
  const res = await world.call('bob', 'GET', 'startsit/sleeper', undefined, 'username=tyler_w');
  assert.equal(res.status, 200, String(res.body));
  const body = res.body as any;
  assert.equal(body.season, 2026);
  assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)), 'the import says when it was read from Sleeper');
  assert.equal(body.teams.length, 1, 'leagues without a roster for this user are skipped');
  const team = body.teams[0];
  assert.equal(team.teamName, 'Tyler Squad');
  assert.equal(team.scoring, 'half');
  assert.deepEqual(team.slots.map((s: any) => s.label), ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'W/T', 'K', 'DST']);
  assert.deepEqual(team.slots[8].positions, ['WR', 'TE']);
  assert.deepEqual(team.players.map((p: any) => p.id), ['sleeper-4984', 'sleeper-9509', 'sleeper-BUF', 'sleeper-999999']);
  assert.equal(team.players[0].name, 'Josh Allen');
  assert.equal(team.players[2].position, 'DST');
  assert.deepEqual(team.startersBySlot.slice(0, 3), ['sleeper-4984', null, 'sleeper-BUF'], 'starters line up with the slots they fill');
  assert.equal(team.startersBySlot.length, team.slots.length);
  assert.equal(team.players[3].name, 'Player 999999');
  assert.deepEqual(team.starters, ['sleeper-4984', 'sleeper-BUF']);
  assert.deepEqual(team.opponents.map((o: any) => [o.teamName, o.players.length]), [['Rival', 1]]);
});

test('start/sit: dynasty Sleeper leagues bring player ages and who owns which draft picks', async () => {
  clearStartSitCache();
  clearSleeperCache();
  const world = memoryWorld();
  world.respondWith((url) => {
    if (url.includes('/state/nfl')) return { season: '2026', week: 6, season_type: 'regular' };
    if (url.endsWith('/user/dyn')) return { user_id: 'u1', display_name: 'Dyn' };
    if (url.endsWith('/user/u1/leagues/nfl/2026')) {
      return [{ league_id: 'D1', name: 'Dynasty', status: 'in_season', settings: { type: 2, draft_rounds: 2 }, roster_positions: ['QB'] }];
    }
    if (url.endsWith('/league/D1/rosters')) {
      return [
        { roster_id: 1, owner_id: 'u1', players: ['4984'], metadata: { team_name: 'Mine' } },
        { roster_id: 2, owner_id: 'u2', players: ['9509'] },
      ];
    }
    if (url.endsWith('/league/D1/users')) return [{ user_id: 'u2', display_name: 'Other' }];
    if (url.endsWith('/league/D1/traded_picks')) {
      // Our 2027 1st went to team 2; we got their 2028 2nd.
      return [
        { season: '2027', round: 1, roster_id: 1, owner_id: 2, previous_owner_id: 1 },
        { season: '2028', round: 2, roster_id: 2, owner_id: 1, previous_owner_id: 2 },
      ];
    }
    if (url.endsWith('/players/nfl')) {
      return { 4984: { birth_date: '1996-05-21', age: 30 }, 9509: { age: 24 }, 1: null };
    }
    throw new Error(`unexpected ${url}`);
  });

  const res = await world.call('bob', 'GET', 'startsit/sleeper', undefined, 'username=dyn');
  assert.equal(res.status, 200, String(res.body));
  const team = (res.body as any).teams[0];
  assert.equal(team.dynasty, true);
  assert.equal(team.players[0].age, 30.3);
  assert.equal(team.opponents[0].players[0].age, 24);
  const label = (p: any) => `${p.season}-${p.round}-${p.originalTeam}`;
  assert.deepEqual(team.picks.map(label), ['2027-2-Mine', '2028-1-Mine', '2028-2-Mine', '2028-2-Other', '2029-1-Mine', '2029-2-Mine']);
  assert.deepEqual(team.opponents[0].picks.map(label), ['2027-1-Mine', '2027-1-Other', '2027-2-Other', '2028-1-Other', '2029-1-Other', '2029-2-Other']);
});

test('blind auction: nobody sees other teams\' bids until the round closes', async () => {
  const world = memoryWorld();
  const leagueId = await setupAuctionLeague(world);
  await world.call('admin', 'POST', `leagues/${leagueId}/startDraft`, {});
  const sentBefore = world.sent.length;

  const bobBid = (await world.call('bob', 'POST', `leagues/${leagueId}/bid`, { amount: 10 })).body as any;
  assert.deepEqual(Object.keys(bobBid.activeBids), ['bob'], 'the bidder gets back only their own bid');
  await world.call('cara', 'POST', `leagues/${leagueId}/bid`, { amount: 12 });

  const asBob = (await world.call('bob', 'GET', `leagues/${leagueId}/state`)).body as any;
  assert.deepEqual(asBob.activeBids, { bob: asBob.activeBids.bob });
  assert.equal(asBob.activeBids.bob.amount, 10);
  const asAdmin = (await world.call('admin', 'GET', `leagues/${leagueId}/state`)).body as any;
  assert.deepEqual(asAdmin.activeBids, {}, 'even the commissioner cannot peek');
  const list = (await world.call('admin', 'GET', 'GetLeagues')).body as any[];
  assert.deepEqual(list[0].activeBids, {});

  const live = world.sent.slice(sentBefore).filter((m) => m.event === 'draftStateDiff');
  assert.equal(live.length, 2, 'each sealed bid still advances the version');
  assert.ok(live.every((m) => !JSON.stringify(m.payload).includes('activeBids')), 'live updates never carry bids');

  world.advance(21);
  await world.call('bob', 'POST', `leagues/${leagueId}/endBidding`);
  const after = (await world.call('admin', 'GET', `leagues/${leagueId}/state`)).body as any;
  const pick = after.draftLog[after.draftLog.length - 1];
  assert.equal(pick.winningBid, 12);
  assert.deepEqual(Object.keys(pick.allBids).sort(), ['bob', 'cara'], 'all bids are revealed once the clock is done');
});
