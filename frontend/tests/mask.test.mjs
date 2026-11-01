import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMask, tick, clue, ready, vote, bite, phoneView, ranking, awards, isOver, addPlayer, tally, vampireCount,
  ROUNDS, CATCH_TEAM, ESCAPE,
} from '../src/party/games/mask.js';
import { CATEGORIES } from '../src/party/maskWords.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ cid: `p${i}`, name: `P${i}` }));

test('the word bank has eight different words in every category', () => {
  assert.ok(CATEGORIES.length >= ROUNDS * 3);
  CATEGORIES.forEach((c) => assert.equal(new Set(c.words).size, 8, c.name));
});

test('more players means more vampires', () => {
  assert.equal(vampireCount(3), 1);
  assert.equal(vampireCount(6), 1);
  assert.equal(vampireCount(7), 2);
  assert.equal(vampireCount(10), 2);
  assert.equal(vampireCount(11), 3);
  assert.equal(vampireCount(12), 3);
  [3, 5, 8, 12].forEach((n) => assert.equal(createMask(players(n), 4, 0).vampires.length, vampireCount(n)));
});

test('humans see the word, vampires only see the category and each other', () => {
  const s = createMask(players(8), 9, 0);
  const [v1, v2] = s.vampires;
  const human = s.players.find((p) => !s.vampires.includes(p.cid)).cid;
  const hv = phoneView(s, human, 0);
  const vv = phoneView(s, v1, 0);
  assert.equal(hv.role, 'human');
  assert.equal(hv.word, s.word);
  assert.equal(vv.role, 'vampire');
  assert.equal(vv.word, undefined);
  assert.equal(vv.category, s.category);
  assert.deepEqual(vv.team, [s.players.find((p) => p.cid === v2).name]);
  assert.equal(vv.hints.length, 4);
  assert.ok(vv.hints.includes(s.word));
  assert.equal(hv.hints, undefined);
});

test('a human cannot give away the word', () => {
  const s = createMask(players(4), 2, 0);
  tick(s, 10000);
  assert.equal(s.phase, 'clue');
  const human = s.players.find((p) => !s.vampires.includes(p.cid)).cid;
  assert.equal(clue(s, human, `my ${s.word}!`, 10100), 'word');
  assert.equal(s.clues[human], undefined);
  assert.equal(clue(s, human, 'spooky', 10200), 'ok');
});

test('catching the vampire pays the humans; an escape pays the vampire; ties go to the first vote', () => {
  const s = createMask(players(4), 7, 0);
  const [v] = s.vampires;
  const humans = s.players.map((p) => p.cid).filter((c) => c !== v);
  s.phase = 'vote';
  vote(s, humans[0], v, 1);
  vote(s, humans[1], humans[2], 2);
  assert.deepEqual(tally(s).unmasked, [v]);
  const t = createMask(players(4), 7, 0);
  t.phase = 'vote';
  vote(t, humans[0], humans[1], 1);
  vote(t, humans[1], humans[2], 2);
  assert.deepEqual(tally(t).unmasked, [humans[1]]);
});

// Bots: humans give the word as a clue category hint, and vote for the vampire with probability `sharp`.
function run(n, seed, sharp) {
  const s = createMask(players(n), seed, 0);
  let rng = seed;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  let now = 0;
  while (!isOver(s) && now < 30 * 60000) {
    now += 250;
    tick(s, now);
    s.players.forEach((p) => { s.lastSeen[p.cid] = now; });
    const since = now - s.phaseAt;
    if (s.phase === 'clue' && since > 8000) s.cast.forEach((cid) => { if (!s.clues[cid]) clue(s, cid, `clue${cid}`, now); });
    if (s.phase === 'talk' && since > 20000) s.cast.forEach((cid) => ready(s, cid, now));
    if (s.phase === 'vote' && since > 6000) {
      s.cast.forEach((cid) => {
        if (s.votes[cid]) return;
        const others = s.cast.filter((x) => x !== cid);
        const target = !s.vampires.includes(cid) && rand() < sharp ? s.vampires[0] : others[Math.floor(rand() * others.length)];
        vote(s, cid, target === cid ? others[0] : target, now);
      });
    }
    if (s.phase === 'bite' && since > 5000) bite(s, s.vampires[0], s.options[0], now);
  }
  return { s, ms: now };
}

test('a full game runs 3 rounds in about 5 to 15 minutes and everyone scores sensibly', () => {
  for (const n of [3, 6, 9, 12]) {
    const { s, ms } = run(n, 20 + n, 0.9);
    assert.equal(s.phase, 'final', `${n} players`);
    assert.equal(s.history.length, ROUNDS);
    assert.ok(ms > 5 * 60000 && ms < 15 * 60000, `${n} players took ${Math.round(ms / 60000)} min`);
    const top = ranking(s)[0];
    assert.ok(top.score >= CATCH_TEAM, `${n}: someone scored`);
    assert.ok(awards(s).length >= 1);
  }
  const { s } = run(5, 99, 0);
  assert.ok(s.history.some((h) => h.caught.length === 0));
  assert.ok(Object.values(s.scores).some((v) => v >= ESCAPE));
});

test('a late joiner watches this round, then plays the next', () => {
  const s = createMask(players(3), 1, 0);
  addPlayer(s, 'late', 'Late', 100);
  assert.equal(phoneView(s, 'late', 100).role, 'watch');
  assert.equal(clue(s, 'late', 'hi', 100), false);
});
