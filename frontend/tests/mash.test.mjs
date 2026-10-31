import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMash, tick, write, vote, phoneView, ranking, awards, isOver, addPlayer, todo, options,
  ROUND_MS, VOTE_POINTS, MASH_BONUS,
} from '../src/party/games/mash.js';
import { clean, PROMPTS, FINAL_PROMPTS } from '../src/party/mashPrompts.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ cid: `p${i}`, name: `P${i}` }));

test('prompts are unique and answers are cleaned up', () => {
  assert.equal(new Set(PROMPTS).size, PROMPTS.length);
  assert.ok(PROMPTS.length >= 40 && FINAL_PROMPTS.length >= 5);
  assert.equal(clean('  a   lot   of   space  '), 'a lot of space');
  assert.equal(clean('x'.repeat(100)).length, 60);
  assert.ok(!/shit/i.test(clean('oh shit')));
  assert.equal(clean('Pumpkin spice'), 'Pumpkin spice');
});

test('every player gets prompts, and each matchup has 2 or 3 authors', () => {
  for (const n of [3, 4, 6, 7, 8, 12]) {
    const s = createMash(players(n), n, 0);
    s.players.forEach((p) => assert.ok(todo(s, p.cid).length >= 1, `${n}: ${p.cid}`));
    s.matchups.forEach((m) => assert.ok(m.authors.length >= 2 && m.authors.length <= 3));
    if (n <= 4) assert.equal(s.matchups.length, 2 * n);
    else if (n <= 6) assert.equal(s.matchups.length, n);
    else assert.equal(s.matchups.length, Math.floor(n / 2));
  }
});

function run(n, seed, funny) {
  const s = createMash(players(n), seed, 0);
  let rng = seed;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  let now = 0;
  const writeAt = {};
  while (!isOver(s) && now < 30 * 60000) {
    now += 100;
    tick(s, now);
    s.players.forEach((p) => { s.lastSeen[p.cid] = now; });
    if (s.phase === 'write') {
      s.players.forEach((p) => {
        if (!writeAt[p.cid] || writeAt[p.cid] < s.phaseAt) writeAt[p.cid] = now + 5000 + rand() * 25000;
        if (now >= writeAt[p.cid] && todo(s, p.cid).length) { write(s, p.cid, `answer by ${p.cid} ${rand()}`, now); writeAt[p.cid] = now + 4000 + rand() * 10000; }
      });
    }
    if (s.phase === 'vote' && now - s.phaseAt > 2000 + rand() * 3000) {
      const m = s.matchups[s.current];
      const opts = options(m);
      s.players.forEach((p) => {
        const choices = opts.filter((o) => o.cid !== p.cid);
        if (!choices.length) return;
        const best = choices.slice().sort((a, b) => (funny[b.cid] || 0) - (funny[a.cid] || 0))[0];
        vote(s, p.cid, rand() < 0.8 ? best.cid : choices[Math.floor(rand() * choices.length)].cid, now);
      });
    }
  }
  return { s, ms: now };
}

test('a full game runs 3 rounds in about 5 to 12 minutes and the funniest player wins', () => {
  for (const n of [3, 5, 8, 12]) {
    const { s, ms } = run(n, 40 + n, { p0: 10, p1: 5 });
    assert.ok(isOver(s), `${n} finished`);
    assert.equal(s.round, 2);
    assert.ok(ms > 3.5 * 60000 && ms < 12 * 60000, `${n} players took ${Math.round(ms / 1000)}s`);
    assert.ok(ranking(s).slice(0, 2).some((r) => r.cid === 'p0'), `${n} players`);
    assert.ok(awards(s).length >= 2);
  }
});

test('voting: authors cannot vote on their own matchup, all votes to one answer is a Mash-up', () => {
  const s = createMash(players(4), 1, 0);
  let now = ROUND_MS;
  tick(s, now);
  assert.equal(s.phase, 'write');
  s.players.forEach((p) => { while (todo(s, p.cid).length) assert.ok(write(s, p.cid, `${p.cid} says boo`, now)); });
  assert.equal(write(s, 'p0', 'extra', now), false);
  now = s.closeAt + 1;
  tick(s, now);
  assert.equal(s.phase, 'vote');
  const m = s.matchups[0];
  const [a, b] = m.authors;
  const others = s.players.map((p) => p.cid).filter((c) => !m.authors.includes(c));
  assert.equal(vote(s, a, b, now), false, 'author cannot vote');
  const v = phoneView(s, a, now);
  assert.ok(v.author);
  others.forEach((c) => assert.ok(vote(s, c, a, now)));
  assert.equal(vote(s, others[0], b, now), false, 'one vote each');
  tick(s, s.closeAt + 1);
  assert.equal(s.phase, 'reveal');
  assert.equal(m.result.gains[a].gain, others.length * VOTE_POINTS + MASH_BONUS);
  assert.ok(m.result.gains[a].mashup);
  assert.equal(m.result.gains[b].gain, 0);
  assert.equal(phoneView(s, a, s.closeAt + 2).mine.gain, m.result.gains[a].gain);
});

test('nobody writing skips every matchup and still ends; late joiners can play', () => {
  const s = createMash(players(3), 9, 0);
  let now = 0;
  addPlayer(s, 'late', 'Late', 0);
  while (!isOver(s) && now < 30 * 60000) { now += 200; tick(s, now); }
  assert.ok(isOver(s));
  assert.ok(ranking(s).every((r) => r.score === 0));
  assert.ok(s.matchups[0].authors.length === 4, 'late joiner writes in the final');
});
