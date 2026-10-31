import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick, play, soul, phoneView, awards, maxCandlesFor, HAND } from '../src/party/lastCandle.js';
import { lookCode, parseLook, crewLook, DEFAULT_LOOK, randomLook, stepLook } from '../src/party/look.js';
import { personSvg } from '../src/party/cartoon.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ cid: `p${i}`, name: `P${i}` }));

// Bots: each tick, every player who holds a charm some monster needs throws it with probability `skill`.
// Fog monsters only get help from players whose seer has "called it out" (modelled by the seer's view).
function run(n, skill, seed, { soulTogether = true } = {}) {
  const g = createGame(players(n), seed, 0);
  let rng = seed;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  let now = 0;
  while (!['won', 'lost'].includes(g.phase) && now < 15 * 60000) {
    now += 100;
    tick(g, now);
    if (g.phase !== 'night') continue;
    const visible = new Set();
    g.monsters.forEach((m) => { if (!m.fog || rand() < 0.7) m.need.forEach((c) => visible.add(c)); });
    for (const p of g.players) {
      if (rand() > skill * 0.12) continue;
      const hand = g.hands[p.cid];
      const slot = hand.findIndex((c) => c && visible.has(c));
      if (slot >= 0) play(g, p.cid, slot, now);
    }
    if (g.monsters.some((m) => m.boss) && soulTogether && rand() < 0.02) g.players.forEach((p) => soul(g, p.cid, now));
  }
  return g;
}

test('look codes round-trip and read Hood Protocol codes', () => {
  for (let i = 0; i < 10; i += 1) assert.deepEqual(parseLook(lookCode(crewLook(i))), crewLook(i));
  const hp = '6.0.0.2.20.3.10.6.0.0.0.0.0.1.0'; // a 15-field Hood Protocol code
  const look = parseLook(hp);
  assert.equal(look.hat, 2);
  assert.equal(look.shorts, true);
  assert.equal(look.costume, 0);
  assert.deepEqual(parseLook(''), DEFAULT_LOOK);
  assert.equal(parseLook('99.99.99').skin, 9);
  assert.equal(stepLook(DEFAULT_LOOK, 'costume', -1).costume, 9);
  // Family friendly: no beer helmet, even from a Hood Protocol code
  assert.equal(parseLook('6.0.0.13.0.0.0.0.0.0.0.0.0.0.0').hat, 1);
  assert.equal(stepLook({ ...DEFAULT_LOOK, hat: 12 }, 'hat', 1).hat, 14);
  let s = 9;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 500; i += 1) assert.notEqual(randomLook(rand).hat, 13);
});

test('every look draws without throwing', () => {
  let s = 3;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 300; i += 1) {
    const svg = personSvg(randomLook(rand), { kind: ['stand', 'wave', 'cheer', 'throw', 'scared', 'walk'][i % 6], k: rand() });
    assert.ok(svg.startsWith('<svg') && !svg.includes('NaN') && !svg.includes('undefined'));
  }
});

test('hands start full with distinct charms', () => {
  const g = createGame(players(12), 42, 0);
  g.players.forEach((p) => {
    assert.equal(g.hands[p.cid].length, HAND);
    assert.equal(new Set(g.hands[p.cid]).size, HAND);
  });
  assert.equal(g.candles, maxCandlesFor(12));
});

test('a throw nobody needs spooks the thrower', () => {
  const g = createGame(players(2), 7, 0);
  tick(g, 9100);
  assert.equal(g.phase, 'night');
  assert.equal(g.monsters.length, 0);
  assert.equal(play(g, 'p0', 0, 9200), 'fizzle');
  assert.equal(phoneView(g, 'p0', 9300).spooked, true);
  assert.equal(play(g, 'p0', 1, 9300), null);
  assert.equal(phoneView(g, 'p0', 9200 + 2600).spooked, false);
});

test('a good crew wins, a crew that never throws loses', () => {
  for (const n of [1, 3, 6, 12]) {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed += 1) if (run(n, 1, seed).phase === 'won') wins += 1;
    assert.ok(wins >= 5, `${n} players won only ${wins}/8`);
    assert.equal(run(n, 0, 5).phase, 'lost');
  }
});

test('the Pumpkin King needs everyone on SOUL', () => {
  const g = run(4, 1, 3, { soulTogether: false });
  assert.equal(g.phase, 'lost');
  assert.ok(awards(run(6, 1, 2)).length > 0);
});
