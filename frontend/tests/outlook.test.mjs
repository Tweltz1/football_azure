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
