// Runs the API handlers against in-memory storage: `node --test supabase/tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Ctx } from '../functions/_shared/handlers.ts';
import { applyOps, diffObjects } from '../functions/_shared/diff.ts';
import { getInitialPlayerPool } from '../functions/_shared/playerData.ts';
import type { League, UserProfile } from '../functions/_shared/models.ts';
import type { LeagueStore, ProfileStore, StoredLeague } from '../functions/_shared/ports.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function memoryWorld() {
  const leagueRows = new Map<string, StoredLeague>();
  const profileRows = new Map<string, UserProfile>();
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

  const ctxFor = (userId: string | null): Ctx => ({
    leagues,
    profiles,
    broadcaster: { async send(leagueId, event, payload, toUserId) { sent.push({ leagueId, event, payload: clone(payload), toUserId }); } },
    log: { info() {}, warn() {}, error() {} },
    now: () => new Date(clock),
    newId: () => `id-${++ids}`,
    playerPool: getInitialPlayerPool,
    userId,
    displayName: userId ? `${userId}-name` : null,
  });

  const call = (userId: string | null, method: string, path: string, body?: unknown, query = '') =>
    handle(ctxFor(userId), method, path, new URLSearchParams(query), body);

  return {
    call, sent, leagueRows,
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
