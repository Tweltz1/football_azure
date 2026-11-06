import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutlooks } from '../src/data/outlook.js';

const pts = (n) => ({ ppr: n, half: n, std: n });
const games = (weeks, value, stats = {}) => weeks.map((week) => ({ week, points: pts(value), stats }));
const upcoming = (weeks, value, opponent = 'BBB') => weeks.map((week) => ({ week, opponent, points: pts(value) }));

// A field of healthy WRs so preseason ranks map to real per-game numbers.
const field = Array.from({ length: 30 }, (_, i) => ({
  id: `wr${i}`, name: `WR ${i}`, position: 'WR', team: `T${i}`, gamesPlayed: 6,
  seasonAvg: pts(20 - i * 0.5), recent: games([1, 2, 3, 4, 5, 6], 20 - i * 0.5), points: pts(20 - i * 0.5),
  upcoming: upcoming([8, 9, 10, 11], 20 - i * 0.5),
}));

const outlookFor = (players, id, { ranks = {}, defense } = {}) => buildOutlooks([...field, ...players], {
  scoring: 'ppr', week: 7, defense, seasonRanks: new Map(Object.entries(ranks)),
}).get(id);

test('a star who has barely played and is about to return keeps real value from their preseason rank', () => {
  const star = {
    id: 'ajb', name: 'Star WR', position: 'WR', team: 'PHI', injury: 'Out', gamesPlayed: 1,
    seasonAvg: pts(4), recent: games([1], 4), points: pts(0), upcoming: [...upcoming([8], 0), ...upcoming([9, 10, 11], 16)],
  };
  const o = outlookFor([star], 'ajb', { ranks: { ajb: 3 } });
  assert.ok(o.value > 10, `value ${o.value}`);
  assert.equal(o.backWeek, 9);
  assert.equal(o.missed, 2);
  assert.ok(o.notes.some((n) => /projected back in week 9/.test(n)));
  assert.ok(o.notes.some((n) => /preseason ranking \(WR3/.test(n)));
});

test('an out player with no return in sight loses most of their value', () => {
  const hurt = {
    id: 'h', name: 'Hurt', position: 'WR', team: 'X', injury: 'IR', gamesPlayed: 6,
    seasonAvg: pts(15), recent: games([1, 2, 3, 4, 5, 6], 15), points: pts(0), upcoming: upcoming([8, 9, 10, 11], 0),
  };
  const o = outlookFor([hurt], 'h');
  assert.ok(o.value < 6, `value ${o.value}`);
  assert.ok(o.notes.some((n) => /no return in sight/.test(n)));
});

test("a back who filled in for an injured starter loses value when the starter returns", () => {
  const starter = {
    id: 'rb1', name: 'Starter RB', position: 'RB', team: 'PIT', injury: 'Out', gamesPlayed: 3,
    seasonAvg: pts(16), recent: games([1, 2, 3], 16), points: pts(0), upcoming: upcoming([8, 9, 10, 11], 14),
  };
  const backup = {
    id: 'rb2', name: 'Fill-in RB', position: 'RB', team: 'PIT', gamesPlayed: 6,
    seasonAvg: pts(13), recent: [...games([1, 2, 3], 8), ...games([4, 5, 6], 18)], points: pts(14),
    upcoming: upcoming([8, 9, 10, 11], 11),
  };
  const o = outlookFor([starter, backup], 'rb2');
  assert.ok(o.roleChange < 0, `role change ${o.roleChange}`);
  assert.ok(o.notes.some((n) => /Starter RB \(RB\) is expected back in week 8/.test(n)));
  const alone = outlookFor([{ ...starter, team: 'OTHER' }, backup], 'rb2');
  assert.ok(o.value < alone.value);
});

test('an easy schedule ahead lifts value and says so', () => {
  const mid = {
    id: 'm', name: 'Mid WR', position: 'WR', team: 'Z', gamesPlayed: 6,
    seasonAvg: pts(12), recent: games([1, 2, 3, 4, 5, 6], 12), points: pts(12), upcoming: upcoming([8, 9, 10, 11], 12, 'SOFT'),
  };
  const defense = { SOFT: { WR: { games: 6, points: pts(50) } } };
  ['A', 'B', 'C', 'D'].forEach((t) => { defense[t] = { WR: { games: 6, points: pts(35) } }; });
  const easy = outlookFor([mid], 'm', { defense });
  const plain = outlookFor([mid], 'm');
  assert.ok(easy.value > plain.value);
  assert.ok(easy.notes.some((n) => /Easy schedule ahead: SOFT/.test(n)));
});

test('a hurt star missing from the preseason list leans on the trade-market rank, and a game cut short is set aside', () => {
  const star = {
    id: 'ajb2', name: 'Market WR', position: 'WR', team: 'PHI', injury: 'Out', gamesPlayed: 1,
    seasonAvg: pts(5.7), recent: games([1], 5.7), points: pts(0), upcoming: [...upcoming([8], 0), ...upcoming([9, 10, 11], 15)],
  };
  const noRank = outlookFor([star], 'ajb2');
  const o = buildOutlooks([...field, star], {
    scoring: 'ppr', week: 7, seasonRanks: new Map(), marketRanks: new Map([['ajb2', 8]]),
  }).get('ajb2');
  assert.ok(o.value > noRank.value + 3, `market ${o.value} vs none ${noRank.value}`);
  assert.ok(o.notes.some((n) => /Set aside 1 game/.test(n)));
  assert.ok(o.notes.some((n) => /trade-market ranking \(WR8/.test(n)));
});

test('a back loses some work when a teammate who has not played yet this season comes back', () => {
  const lead = {
    id: 'rbw', name: 'Lead RB', position: 'RB', team: 'NYG', gamesPlayed: 6,
    seasonAvg: pts(15), recent: games([1, 2, 3, 4, 5, 6], 15), points: pts(13), upcoming: upcoming([8, 9, 10, 11], 13),
  };
  const returning = {
    id: 'rbd', name: 'Returning RB', position: 'RB', team: 'NYG', gamesPlayed: 0,
    seasonAvg: null, recent: [], points: pts(9), upcoming: upcoming([8, 9, 10, 11], 9),
  };
  const o = outlookFor([lead, returning], 'rbw');
  assert.ok(o.roleChange < 0, `role change ${o.roleChange}`);
  assert.ok(o.notes.some((n) => /Returning RB \(RB\) is back healthy/.test(n)));
  const hurtStill = outlookFor([lead, { ...returning, points: pts(0), upcoming: upcoming([8, 9, 10, 11], 0) }], 'rbw');
  assert.equal(hurtStill.roleChange || 0, 0);
});

test('teammate role notes need at least 3 games to go on', () => {
  const wr = {
    id: 'w1', name: 'One Game WR', position: 'WR', team: 'GB', gamesPlayed: 1,
    seasonAvg: pts(12), recent: games([1], 12), points: pts(12), upcoming: upcoming([8, 9, 10, 11], 12),
  };
  const mate = {
    id: 'w2', name: 'Mate WR', position: 'WR', team: 'GB', gamesPlayed: 5,
    seasonAvg: pts(12), recent: games([2, 3, 4, 5, 6], 12), points: pts(12), upcoming: upcoming([8, 9, 10, 11], 12),
  };
  const o = outlookFor([wr, mate], 'w1');
  assert.ok(!o.notes.some((n) => /Mate WR/.test(n)));
});

test('a star coming back takes nearly all the work; close preseason ranks mean a real split', () => {
  const rbField = Array.from({ length: 40 }, (_, i) => ({
    id: `rb${i}x`, name: `RB ${i}`, position: 'RB', team: `R${i}`, gamesPlayed: 6,
    seasonAvg: pts(24 - i * 0.45), recent: games([1, 2, 3, 4, 5, 6], 24 - i * 0.45), points: pts(24 - i * 0.45),
    upcoming: upcoming([8, 9, 10, 11], 24 - i * 0.45),
  }));
  const fillIn = {
    id: 'fill', name: 'Fill-in RB', position: 'RB', team: 'SF', gamesPlayed: 6,
    seasonAvg: pts(16), recent: games([1, 2, 3, 4, 5, 6], 16), points: pts(14), upcoming: upcoming([8, 9, 10, 11], 14),
  };
  const star = {
    id: 'star', name: 'Star RB', position: 'RB', team: 'SF', gamesPlayed: 0,
    seasonAvg: null, recent: [], points: pts(20), upcoming: upcoming([8, 9, 10, 11], 20),
  };
  const run = (ranks) => buildOutlooks([...field, ...rbField, fillIn, star], {
    scoring: 'ppr', week: 7, seasonRanks: new Map(Object.entries(ranks)),
  }).get('fill');
  const starBack = run({ fill: 40, star: 1 });
  const closeCall = run({ fill: 18, star: 22 });
  const unranked = run({});
  // The star takes most of it back: the fill-in loses well over half his production.
  assert.ok(starBack.roleChange < -8, `star back ${starBack.roleChange}`);
  assert.ok(starBack.notes.some((n) => /Star RB should take most of the work back \(about (8\d\/1\d|90\/10)\)/.test(n)), starBack.notes.join(' | '));
  // Close ranks and a fill-in who has played well: a split he leads, a much smaller loss.
  assert.ok(closeCall.roleChange < 0 && closeCall.roleChange > -8, `close ${closeCall.roleChange}`);
  assert.ok(closeCall.notes.some((n) => /real split, Fill-in RB leading/.test(n)), closeCall.notes.join(' | '));
  assert.ok(Math.abs(starBack.roleChange) > Math.abs(unranked.roleChange));
});

test("a hurt player's preseason ranking outweighs a market rank that already priced in the injury", () => {
  const star = {
    id: 'hurt9', name: 'Hurt WR', position: 'WR', team: 'NE', injury: 'IR', gamesPlayed: 1,
    seasonAvg: pts(4), recent: games([1], 4), points: pts(0), upcoming: [...upcoming([8], 0), ...upcoming([9, 10, 11], 15)],
  };
  const o = buildOutlooks([...field, star], {
    scoring: 'ppr', week: 7, seasonRanks: new Map([['hurt9', 9]]), marketRanks: new Map([['hurt9', 27]]),
  }).get('hurt9');
  assert.ok(o.notes.some((n) => /preseason and trade-market rankings \(WR15/.test(n)), o.notes.join(' | '));
});

test("Sleeper's trimmed numbers for a player just back from injury don't drag his value down much", () => {
  const star = {
    id: 'ret', name: 'Returning WR', position: 'WR', team: 'NE', injury: 'IR', gamesPlayed: 0,
    seasonAvg: null, recent: [], points: pts(0), upcoming: [...upcoming([8], 0), ...upcoming([9, 10, 11], 8)],
  };
  const o = buildOutlooks([...field, star], { scoring: 'ppr', week: 7, seasonRanks: new Map([['ret', 5]]) }).get('ret');
  assert.ok(o.perGame > 0.75 * o.healthy, `perGame ${o.perGame} healthy ${o.healthy}`);
});
