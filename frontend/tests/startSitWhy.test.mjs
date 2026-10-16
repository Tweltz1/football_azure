// Reasons behind Start/Sit calls: `node --test frontend/tests/startSitWhy.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainBench, explainPair, explainStarter, explainTrade, spreadFor, winChance } from '../src/data/startSitWhy.js';
import { analyzeTrade, buildLineup } from '../src/data/startSitUtils.js';

const games = (...values) => values.map((v, i) => ({ week: i + 1, opponent: 'NYJ', points: { ppr: v, half: v, std: v } }));
const avg = (v) => ({ ppr: v, half: v, std: v });
const player = (id, position, points, extra = {}) => ({
  id, name: id, position, team: 'KC', opponent: 'BUF', injury: null, onBye: false, points,
  recent: games(points, points, points, points), seasonAvg: avg(points), gamesPlayed: 4, ...extra,
});

// Two defenses: LV gives up the most to WRs, BUF the fewest.
const defenseRow = (rank) => ({ games: 4, points: avg(30 - rank), box: { passYd: 0, passTd: 0, int: 0, rushAtt: 0, rushYd: 0, rushTd: 0, tgt: 20, rec: 12, recYd: 150, recTd: 1 }, rank, teams: 32 });
const defense = {};
for (let r = 1; r <= 32; r += 1) defense[`T${r}`] = { WR: defenseRow(r), RB: defenseRow(r) };
defense.LV = { WR: defenseRow(1) };
defense.BUF = { WR: defenseRow(32) };
const ctx = (allPlayers = []) => ({ defense, allPlayers, scoring: 'ppr' });

test('a big projection gap with support from form and matchup is a clear call', () => {
  const a = player('Ace', 'WR', 18, { opponent: 'LV', recent: games(15, 20, 21, 22) });
  const b = player('Bo', 'WR', 11, { opponent: 'BUF', recent: games(12, 10, 9, 8), seasonAvg: avg(11) });
  const why = explainPair(a, b, ctx());
  assert.equal(why.call.key, 'clear');
  assert.match(why.summary, /Ace projects 7\.0 more points/);
  assert.match(why.summary, /easier matchup against LV/);
  const matchup = why.factors.find((f) => f.key === 'matchup');
  assert.equal(matchup.edge, 'start');
  assert.equal(why.factors.find((f) => f.key === 'projection').edge, 'start');
});

test('a tiny gap is a coin flip, with a tiebreaker and a reason the other side is fine', () => {
  const a = player('Ace', 'WR', 12.4, { opponent: 'LV' });
  const b = player('Bo', 'WR', 12, { recent: games(8, 16, 17, 18) });
  const why = explainPair(a, b, ctx());
  assert.equal(why.call.key, 'tossup');
  assert.match(why.summary, /within 0\.4 points/);
  assert.match(why.summary, /tiebreaker: Ace has the easier matchup/);
  assert.match(why.summary, /Bo has been better lately|Bo is heating up/);
  assert.ok(why.watch);
});

test('a benched player who is out is explained by the injury, not the numbers', () => {
  const a = player('Ace', 'WR', 9);
  const b = player('Bo', 'WR', 15, { injury: 'Out' });
  const why = explainPair(a, b, ctx());
  assert.equal(why.call.label, 'Easy call');
  assert.match(why.summary, /Bo is listed Out, so Ace gets the spot/);
});

test('a questionable starter comes with a backup plan', () => {
  const a = player('Ace', 'WR', 16, { injury: 'Questionable' });
  const b = player('Bo', 'WR', 11);
  const why = explainPair(a, b, ctx());
  assert.match(why.watch, /If Ace is ruled out before kickoff, start Bo instead/);
  assert.equal(why.factors.find((f) => f.key === 'health').edge, 'sit');
});

test('injured teammates count as extra work', () => {
  const a = player('Ace', 'WR', 14);
  const b = player('Bo', 'WR', 13, { team: 'NYG' });
  const hurt = { id: 'Cee', name: 'Cee Lamb', position: 'WR', team: 'KC', injury: 'Out', seasonAvg: avg(15) };
  const why = explainPair(a, b, ctx([a, b, hurt]));
  const opportunity = why.factors.find((f) => f.key === 'opportunity');
  assert.equal(opportunity.edge, 'start');
  assert.match(opportunity.start, /\+15\.0/);
});

test('starters are compared with the best bench player who could take their slot, bench players with the weakest starter', () => {
  const roster = [
    player('QB1', 'QB', 20), player('QB2', 'QB', 15),
    player('WRa', 'WR', 17), player('WRb', 'WR', 14), player('WRc', 'WR', 9), player('WRd', 'WR', 8), player('WRe', 'WR', 3),
  ];
  const lineup = buildLineup(roster, { slots: [{ label: 'QB', positions: ['QB'] }, { label: 'WR', positions: ['WR'] }, { label: 'WR', positions: ['WR'] }, { label: 'FLEX', positions: ['RB', 'WR', 'TE'] }] });
  const qbWhy = explainStarter(lineup, lineup.starters[0].slot.key, ctx());
  assert.equal(qbWhy.headline, 'Start QB1 over QB2');
  const benchWhy = explainBench(lineup, 'WRd', ctx());
  assert.equal(benchWhy.headline, 'Sit WRd, start WRc');
});

test('a starter with nobody behind them gets a short explanation', () => {
  const roster = [player('K1', 'K', 8), player('WRa', 'WR', 10)];
  const lineup = buildLineup(roster, { slots: [{ label: 'K', positions: ['K'] }, { label: 'WR', positions: ['WR'] }] });
  const why = explainStarter(lineup, lineup.starters[0].slot.key, ctx());
  assert.match(why.summary, /Nobody on your bench can play K, so K1 starts/);
});

// ---- Trades ----
const slots = { slots: [{ label: 'RB', positions: ['RB'] }, { label: 'WR', positions: ['WR'] }, { label: 'WR', positions: ['WR'] }] };
const pool = (n, pos, top) => Array.from({ length: n }, (_, i) => player(`${pos}${i}`, pos, top - i));
const allPlayers = [...pool(30, 'RB', 20), ...pool(40, 'WR', 20)];
const trade = (give, get, myRoster, theirRoster) => analyzeTrade({
  give, get, myRoster, theirRoster, rosterSettings: slots, scoring: 'ppr', allPlayers, teamCount: 10,
});

test('a trade that fills a weak starting spot explains the lineup gain and who would start', () => {
  const mine = [player('MyRB', 'RB', 18), player('MyRB2', 'RB', 15), player('MyWR', 'WR', 16), player('WeakWR', 'WR', 4)];
  const theirs = [player('TheirWR', 'WR', 13), player('TheirRB', 'RB', 9)];
  const result = trade([mine[1]], [theirs[0]], mine, theirs);
  const why = explainTrade(result, { allPlayers, scoring: 'ppr', partnerName: 'Blitz' });
  assert.deepEqual(why.names, ['You get', 'You give']);
  assert.match(why.summary, /Your starting lineup gains [\d.]+ pts a week because TheirWR would start for you/);
  assert.equal(why.factors.find((f) => f.key === 'lineup').edge, 'start');
  assert.ok(['clear', 'lean'].includes(why.call.key));
});

test('an injured player in the trade gets a heads-up, and value tracks the injury', () => {
  const mine = [player('MyWR', 'WR', 15), player('MyWR2', 'WR', 14), player('MyRB', 'RB', 14)];
  const theirs = [player('HurtWR', 'WR', 16, { injury: 'Questionable' }), player('TheirRB', 'RB', 9)];
  const result = trade([mine[0]], [theirs[0]], mine, theirs);
  const why = explainTrade(result, { allPlayers, scoring: 'ppr', partnerName: 'Blitz' });
  assert.match(why.watch, /HurtWR is listed Questionable/);
  assert.match(why.watch, /quicker return makes this trade better for you/);
  assert.equal(why.factors.find((f) => f.key === 'health').edge, 'sit');
});

test('a lopsided trade against you says how much value you give up', () => {
  const mine = [player('Star', 'WR', 22), player('MyWR2', 'WR', 12), player('MyRB', 'RB', 14)];
  const theirs = [player('Scrub', 'WR', 6), player('TheirRB', 'RB', 9)];
  const result = trade([mine[0]], [theirs[0]], mine, theirs);
  const why = explainTrade(result, { allPlayers, scoring: 'ppr', partnerName: 'Blitz' });
  assert.equal(why.call.key, 'lose');
  assert.match(why.summary, /You give up [\d.]+ more in trade value than you get/);
  assert.match(why.summary, /Your starting lineup drops [\d.]+ pts a week without Star/);
});

test('a starter card lists free agents who project more at the slot, best first', () => {
  const lineup = buildLineup([player('MyDef', 'DST', 6, { opponent: 'BUF' })], { slots: [{ label: 'DST', positions: ['DST'] }] });
  const waiverPool = [
    player('Waiver1', 'DST', 9, { opponent: 'LV', posRank: 3 }),
    player('Waiver2', 'DST', 11, { opponent: 'T20' }),
    player('Close', 'DST', 7),
    player('Hurt', 'DST', 12, { injury: 'Out' }),
    player('WrongPos', 'WR', 20),
  ];
  const why = explainStarter(lineup, lineup.starters[0].slot.key, { ...ctx(), waiverPool, waiverNote: 'Not on any roster.' });
  assert.deepEqual(why.waivers.players.map((p) => [p.name, p.gain]), [['Waiver2', 5], ['Waiver1', 3]]);
  assert.equal(why.waivers.note, 'Not on any roster.');
  assert.match(why.waivers.players[1].detail, /DST3/);
});

test('no waiver section when nobody free beats the starter', () => {
  const lineup = buildLineup([player('Star', 'WR', 20)], { slots: [{ label: 'WR', positions: ['WR'] }] });
  const why = explainStarter(lineup, lineup.starters[0].slot.key, { ...ctx(), waiverPool: [player('Meh', 'WR', 10)] });
  assert.equal(why.waivers, null);
});

test('win chance grows with the projection gap and shrinks with volatile players', () => {
  const steady = (name, pts) => player(name, 'WR', pts, { spread: avg(3), gamesPlayed: 10 });
  const wild = (name, pts) => player(name, 'WR', pts, { spread: avg(12), gamesPlayed: 10 });
  assert.equal(Math.round(winChance(steady('A', 12), steady('B', 12), 'ppr') * 100), 50);
  assert.ok(winChance(steady('A', 15), steady('B', 10), 'ppr') > winChance(wild('A', 15), wild('B', 10), 'ppr'));
  // Few games lean on the position's usual swing.
  assert.equal(spreadFor(player('New', 'WR', 10, { gamesPlayed: 0 }), 'ppr'), 7.5);
  assert.ok(spreadFor(player('Vet', 'WR', 10, { spread: avg(3), gamesPlayed: 12 }), 'ppr') < 4.5);
  const why = explainPair(steady('Ace', 18), steady('Bo', 11), ctx());
  assert.ok(why.confidence.chance >= 85, String(why.confidence.chance));
  assert.match(why.confidence.text, /Ace outscores Bo about \d+% of the time/);
  assert.match(why.basis, /Sleeper's projections/);
});

test('usage share and how similar players did against each defense show up as evidence', () => {
  const usage = (recent, season) => ({ targetShare: season, recentTargetShare: recent, carryShare: 0, recentCarryShare: 0, recentGames: 3 });
  const lead = (id, week, value) => ({ id, name: id, team: 'X', week, value, points: avg(value), box: {} });
  const field = [
    { id: 'l1', seasonAvg: avg(10), gamesPlayed: 5 }, { id: 'l2', seasonAvg: avg(10), gamesPlayed: 5 },
    { id: 'l3', seasonAvg: avg(20), gamesPlayed: 5 }, { id: 'l4', seasonAvg: avg(20), gamesPlayed: 5 },
  ];
  const soft = { ...defenseRow(10), recentGames: [lead('l1', 5, 14), lead('l2', 4, 12)] };
  const hard = { ...defenseRow(12), recentGames: [lead('l3', 5, 14), lead('l4', 4, 16)] };
  const d = { ...defense, SOFT: { WR: soft }, HARD: { WR: hard } };
  const a = player('Ace', 'WR', 13, { opponent: 'SOFT', usage: usage(0.3, 0.22) });
  const b = player('Bo', 'WR', 12, { opponent: 'HARD', usage: usage(0.2, 0.21) });
  const why = explainPair(a, b, { defense: d, allPlayers: field, scoring: 'ppr' });
  const lift = why.factors.find((f) => f.key === 'lift');
  assert.equal(lift.start, '+30% vs usual');
  assert.equal(lift.sit, '−25% vs usual');
  assert.equal(lift.edge, 'start');
  const share = why.factors.find((f) => f.key === 'usage');
  assert.equal(share.start, '30% of targets');
  assert.equal(share.edge, 'start');
  assert.match(why.basis, /team target and carry shares/);
});

test('wording: stingy defenses read as "fewest", and a player who cannot play never wins head to head', async () => {
  const { compareVerdict, defenseMatchup, tagForSide } = await import('../src/data/startSitUtils.js');
  const label = (rank) => defenseMatchup({ opponent: 'T', position: 'QB' }, { T: { QB: { ...defenseRow(rank), rank } } }, 'ppr').rankLabel;
  assert.equal(label(29), '4th fewest points allowed to QBs, of 32 teams');
  assert.equal(label(3), '3rd most points allowed to QBs, of 32 teams');
  const out = player('Star', 'WR', 20, { injury: 'Out' });
  const ok = player('Backup', 'WR', 8);
  assert.equal(compareVerdict([out, ok]).winner.name, 'Backup');
  const sell = { key: 'sell', label: 'Sell high' };
  assert.equal(tagForSide(sell, 'give').label, 'Sell high');
  assert.equal(tagForSide(sell, 'get').label, 'Buying high');
  assert.equal(tagForSide({ key: 'buy', label: 'Buy low' }, 'give').label, 'Selling low');
});
