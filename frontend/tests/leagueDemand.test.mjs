// League demand: `node --test frontend/tests/leagueDemand.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendLevels, demandNote, playerDemand, positionDemand, realWaiverLevels } from '../src/data/leagueDemand.js';

const p = (id, position, value, team = 'KC') => ({ id, name: id, position, team, outlook: { value, perGame: value } });
const league = (mine, opponents) => ({
  players: mine.players, starters: mine.starters,
  opponents: opponents.map((o, i) => ({ teamName: `T${i}`, players: o.players, starters: o.starters, picks: [] })),
});

test('player demand counts teams that roster and start a player across leagues', () => {
  const a = league({ players: [p('x', 'RB', 10)], starters: ['x'] }, [{ players: [p('y', 'WR', 9)], starters: [] }]);
  const b = league({ players: [p('y', 'WR', 9)], starters: ['y'] }, [{ players: [p('x', 'RB', 10)], starters: ['x'] }, { players: [], starters: [] }]);
  const demand = playerDemand([a, b]);
  assert.equal(demand.teams, 5);
  assert.deepEqual(demand.byId.get('x'), { rostered: 2, started: 2 });
  assert.equal(demandNote('y', demand), 'On 2 of 5 teams across your 2 leagues, started by 1.');
  assert.equal(demandNote('z', demand), 'On no team across your 2 leagues.');
  assert.equal(demandNote('x', playerDemand([])), null);
});

test('the real waiver wire sets part of the waiver level, and deep positions show up', () => {
  const all = [p('r1', 'RB', 15), p('r2', 'RB', 12), p('f1', 'RB', 8), p('f2', 'RB', 7), p('f3', 'RB', 6), p('f4', 'RB', 1), p('fa', 'RB', 20, 'FA')];
  const rostered = new Set(['r1', 'r2']);
  const real = realWaiverLevels(all, rostered, 'ppr');
  assert.equal(real.RB, 7, 'average of the best three free agents on NFL teams');
  assert.equal(real.WR, null, 'too few free agents to say');
  assert.deepEqual(blendLevels({ RB: 9, WR: 10 }, real), { RB: 8, WR: 10 });
  assert.deepEqual(blendLevels({ RB: 9 }, null), { RB: 9 });

  const lg = league({ players: [p('r1', 'RB', 15), p('a', 'RB', 5), p('b', 'RB', 5)], starters: [] }, [{ players: [p('r2', 'RB', 12)], starters: [] }]);
  const slots = { slots: [{ label: 'RB', positions: ['RB'] }, { label: 'RB', positions: ['RB'] }] };
  const rows = positionDemand(lg, slots, (x) => x.position, real);
  assert.deepEqual(rows, [{ position: 'RB', perTeam: 2, starting: 2, depth: 1, bestFree: 7 }]);
});
