// Waiver moves: `node --test frontend/tests/waiverMoves.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestWaiverMoves } from '../src/data/waiverMoves.js';
import { replacementLevels } from '../src/data/startSitUtils.js';

const slots = { slots: [['QB', ['QB']], ['RB', ['RB']], ['RB', ['RB']], ['WR', ['WR']], ['WR', ['WR']], ['TE', ['TE']]].map(([label, positions]) => ({ label, positions })) };
const outlook = (value, extra = {}) => ({ value, perGame: value, missed: 0, backWeek: null, notes: [], ...extra });
const player = (id, position, value, extra = {}) => ({
  id, name: id, position, team: 'KC', points: value, seasonAvg: { ppr: value }, gamesPlayed: 5, outlook: outlook(value), ...extra,
});

const roster = [
  player('QB1', 'QB', 20), player('RB1', 'RB', 15), player('RB2', 'RB', 12), player('WR1', 'WR', 14), player('WR2', 'WR', 12),
  player('TE1', 'TE', 9), player('WRbench', 'WR', 4), player('RBbench', 'RB', 5),
  // A star back who misses the next 3 games: low value right now, but a starter when healthy.
  player('StarHurt', 'RB', 7, { injury: 'Out', outlook: outlook(7, { perGame: 17, missed: 3, backWeek: 10 }) }),
];
const pool = [player('FreeWR', 'WR', 9), player('FreeTE', 'TE', 3), player('FreeRB', 'RB', 4.5)];
const all = [...roster, ...pool, ...Array.from({ length: 40 }, (_, i) => player(`f${i}`, ['QB', 'RB', 'WR', 'TE'][i % 4], 8 - i * 0.15))];
const levels = replacementLevels(all, 10, slots, 'ppr');

test('a hurt star is held, the weakest bench player is the drop, and a better free agent replaces them', () => {
  const { drops, holds, moves } = suggestWaiverMoves({ roster, pool, rosterSettings: slots, scoring: 'ppr', levels });
  assert.deepEqual(holds.map((h) => h.player.id), ['StarHurt']);
  assert.match(holds[0].reason, /back around week 10, but worth about 17\.0 a game when playing\. Hold\./);
  assert.equal(drops[0].player.id, 'WRbench');
  assert.ok(!drops.some((d) => ['QB1', 'RB1', 'WR1', 'TE1'].includes(d.player.id)), 'starters are never drops');
  assert.equal(moves[0].add.player.id, 'FreeWR');
  assert.equal(moves[0].drop.player.id, 'WRbench');
  assert.ok(moves[0].gain >= 1);
  assert.ok(!moves.some((m) => m.add.player.id === 'FreeRB'), 'a pickup barely better than the bench is not worth a claim');
});

test('no second kicker: a free kicker only replaces yours, and only as a clear upgrade', () => {
  const kSlots = { slots: [...slots.slots, { label: 'K', positions: ['K'] }] };
  const myK = player('MyK', 'K', 9);
  const withK = [...roster, myK];
  const kLevels = { ...levels, K: 7 };
  const small = suggestWaiverMoves({ roster: withK, pool: [player('FreeK', 'K', 11.4)], rosterSettings: kSlots, scoring: 'ppr', levels: kLevels });
  assert.equal(small.moves.length, 0, 'a 2.4-point kicker upgrade is not worth it');
  const big = suggestWaiverMoves({ roster: withK, pool: [player('GreatK', 'K', 13)], rosterSettings: kSlots, scoring: 'ppr', levels: kLevels });
  assert.equal(big.moves[0]?.drop.player.id, 'MyK', 'a kicker only replaces your kicker');
  const noTeam = suggestWaiverMoves({ roster: withK, pool: [player('NoTeamK', 'K', 15, { team: 'FA' })], rosterSettings: kSlots, scoring: 'ppr', levels: kLevels });
  assert.equal(noTeam.moves.length, 0, 'players without an NFL team are skipped');
});

test('the backup to a high-usage lead back is worth a claim as a handcuff, more so behind your own starter', () => {
  const lead = player('LeadRB', 'RB', 18, { team: 'SF', usage: { carryShare: 0.72 } });
  const backup = player('BackupRB', 'RB', 4.5, { team: 'SF' });
  const third = player('ThirdRB', 'RB', 2, { team: 'SF' });
  const others = [lead, backup, third, ...all];
  const theirs = suggestWaiverMoves({ roster, pool: [backup, third], rosterSettings: slots, scoring: 'ppr', levels, allPlayers: others });
  const mine = suggestWaiverMoves({ roster: [...roster, lead], pool: [backup, third], rosterSettings: slots, scoring: 'ppr', levels, allPlayers: others });
  const move = mine.moves.find((m) => m.add.player.id === 'BackupRB');
  assert.ok(move, 'backing up your own lead back is worth a claim');
  assert.match(move.add.reason, /handcuff to your LeadRB \(72% of carries\)/);
  assert.ok(!mine.moves.some((m) => m.add.player.id === 'ThirdRB'), 'only the next man up is a handcuff');
  const theirMove = theirs.moves.find((m) => m.add.player.id === 'BackupRB');
  assert.ok(!theirMove || theirMove.gain < move.gain);
});
