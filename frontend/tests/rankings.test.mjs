import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionRanks, rankLabel, seasonRankings, weeklyRankings } from '../src/data/rankings.js';

const p = (id, position, ppr, extra = {}) => ({ id, name: id, position, team: 'KC', points: { ppr, half: ppr - 1, std: ppr - 2 }, ...extra });

test('position ranks count each position on its own, best projection first', () => {
  const ranks = positionRanks([p('wr-b', 'WR', 12), p('rb-a', 'RB', 15), p('wr-a', 'WR', 18), p('rb-b', 'RB', 9)], 'ppr');
  assert.equal(ranks.get('wr-a'), 1);
  assert.equal(ranks.get('wr-b'), 2);
  assert.equal(ranks.get('rb-a'), 1);
  assert.equal(ranks.get('rb-b'), 2);
});

test('players without a projection are not ranked and are counted as hidden', () => {
  const players = [p('a', 'QB', 20), p('out', 'QB', 0, { injury: 'Out' }), p('b', 'QB', 22)];
  assert.equal(positionRanks(players, 'ppr').has('out'), false);
  const { rows, hidden } = weeklyRankings(players, 'QB', 'ppr');
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
  assert.equal(hidden, 1);
});

test('the flex tab mixes RB, WR and TE but keeps each player\'s own position rank', () => {
  const players = [p('rb1', 'RB', 15), p('wr1', 'WR', 18), p('te1', 'TE', 11), p('wr2', 'WR', 16), p('qb1', 'QB', 25)];
  const { rows } = weeklyRankings(players, 'FLEX', 'ppr');
  assert.deepEqual(rows.map((r) => [r.id, r.rank, r.positionRank]), [['wr1', 1, 1], ['wr2', 2, 2], ['rb1', 3, 1], ['te1', 4, 1]]);
});

test('scoring changes the order', () => {
  const players = [
    { id: 'catcher', name: 'catcher', position: 'WR', points: { ppr: 16, half: 12, std: 8 } },
    { id: 'deep', name: 'deep', position: 'WR', points: { ppr: 14, half: 13, std: 12 } },
  ];
  assert.equal(weeklyRankings(players, 'WR', 'ppr').rows[0].id, 'catcher');
  assert.equal(weeklyRankings(players, 'WR', 'std').rows[0].id, 'deep');
});

test('season rankings give position ranks and how far each player moved since last week', () => {
  const pool = [
    { id: 'a', name: 'A', position: 'WR', rank: 3, previousRank: 9 },
    { id: 'x', name: 'X', position: 'RB', rank: 4, previousRank: 1 },
    { id: 'b', name: 'B', position: 'WR', rank: 7, previousRank: 2 },
    { id: 'c', name: 'C', position: 'WR', rank: 12 },
  ];
  const rows = seasonRankings(pool, 'WR');
  assert.deepEqual(rows.map((r) => [r.id, r.positionRank, r.overallRank, r.change]), [['a', 1, 3, 1], ['b', 2, 7, -1], ['c', 3, 12, null]]);
});

test('rank labels', () => {
  assert.equal(rankLabel('WR', 12), 'WR12');
  assert.equal(rankLabel('TE', null), 'TE');
});
