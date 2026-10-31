import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHallway, tick, vote, phoneView, makeFloor, isOver, tally, addPlayer, awards, clueText,
  FLOORS, LANTERNS, floorPlan, matching,
} from '../src/party/games/hallway.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ cid: `p${i}`, name: `P${i}` }));

test('every floor has exactly one door that fits all the clues, and each guide needs the other', () => {
  let seed = 3;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let floor = 1; floor <= FLOORS; floor += 1) {
    for (let k = 0; k < 60; k += 1) {
      const guides = 1 + (k % 2);
      const room = makeFloor(rand, floor, guides);
      assert.equal(room.doors.length, floorPlan(floor).doors);
      const fit = matching(room.doors, room.clues);
      assert.equal(fit.length, 1);
      assert.equal(fit[0], room.safe);
      if (guides === 2) room.hands.forEach((h) => assert.ok(matching(room.doors, h).length > 1, 'one guide alone is not enough'));
      room.clues.forEach((c) => assert.ok(/safe door|Look for|Stay away/.test(clueText(c)), clueText(c)));
      if (floorPlan(floor).tier >= 2) assert.ok(room.clues.some((c) => c.kind !== 'is'), 'higher floors use trickier clues');
    }
  }
});

// Bots: the guides' clues are pooled with probability `talk`, then everyone votes for a fitting door.
function run(n, seed, talk) {
  const s = createHallway(players(n), seed, 0);
  let rng = seed;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  let now = 0;
  let floorSeen = 0;
  let shared = [];
  while (!isOver(s) && now < 30 * 60000) {
    now += 200;
    tick(s, now);
    s.players.forEach((p) => { s.lastSeen[p.cid] = now; });
    if (s.phase !== 'vote') continue;
    if (floorSeen !== s.floor) {
      floorSeen = s.floor;
      shared = s.room.hands.flatMap((h) => (rand() < talk ? h : []));
    }
    if (now - s.phaseAt < 12000) continue;
    const options = matching(s.room.doors, shared);
    s.players.forEach((p) => {
      if (s.votes[p.cid]) return;
      const d = options[Math.floor(rand() * options.length)];
      vote(s, p.cid, d, now);
    });
  }
  return { s, ms: now };
}

test('a crew that talks wins in about 4 to 9 minutes; one that does not loses', () => {
  for (const n of [1, 3, 6, 12]) {
    const { s, ms } = run(n, 11 + n, 1);
    assert.equal(s.phase, 'won', `${n} players`);
    assert.equal(s.lanterns, LANTERNS);
    assert.ok(ms > 2.5 * 60000 && ms < 9 * 60000, `${n} took ${Math.round(ms / 1000)}s`);
    assert.ok(awards(s).length >= 1);
  }
  let losses = 0;
  for (let k = 0; k < 10; k += 1) if (run(4, 50 + k, 0).s.phase === 'lost') losses += 1;
  assert.ok(losses >= 7, `silent crews lost ${losses}/10`);
});

test('votes: plurality wins, ties go to the first door voted, guides rotate and see their clues', () => {
  const s = createHallway(players(4), 7, 0);
  tick(s, 5000);
  assert.equal(s.phase, 'vote');
  const g = phoneView(s, s.guides[0], 5000);
  assert.ok(g.guide && g.clues.length >= 1);
  const other = s.players.find((p) => !s.guides.includes(p.cid)).cid;
  assert.equal(phoneView(s, other, 5000).clues, undefined);
  vote(s, 'p0', 1, 6000);
  vote(s, 'p1', 0, 7000);
  assert.equal(tally(s).door, 1);
  vote(s, 'p2', 0, 8000);
  assert.equal(tally(s).door, 0);
  vote(s, 'p3', 0, 9000);
  assert.ok(s.closeAt);
  const firstGuides = [...s.guides];
  tick(s, s.closeAt + 1);
  assert.equal(s.phase, 'reveal');
  tick(s, s.closeAt + 10000);
  if (s.phase === 'floor') assert.notDeepEqual(s.guides, firstGuides);
  addPlayer(s, 'late', 'Late', 20000);
  assert.ok(phoneView(s, 'late', 20000));
});
