// Reasons behind Start/Sit calls: `node --test frontend/tests/startSitWhy.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainBench, explainPair, explainStarter } from '../src/data/startSitWhy.js';
import { buildLineup } from '../src/data/startSitUtils.js';

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
