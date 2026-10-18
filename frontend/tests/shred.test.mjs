import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replaySkillGame, SHRED, shredScore, shredSpeed, shredStart, shredStep,
} from '../src/games/sim.generated.js';

// Jumps when the next stretch (riding straight on) would crash, trying the latest safe take-off first.
function survives(s, ticks) {
  const t = structuredClone(s);
  for (let i = 0; i < ticks && t.alive; i += 1) shredStep(t, false);
  return t.alive;
}
function shouldJump(s) {
  if (survives(s, 45)) return false;
  const t = structuredClone(s);
  shredStep(t, true);
  if (!t.alive) return false;
  if (survives(t, 30)) return true;
  // Would a double jump later in this jump save it?
  for (let wait = 4; wait <= 24; wait += 4) {
    const u = structuredClone(t);
    for (let i = 0; i < wait && u.alive; i += 1) shredStep(u, false);
    shredStep(u, true);
    if (u.alive && survives(u, 30)) return true;
  }
  return false;
}
// In the air: double jump now if riding on would crash and the boost saves it.
function shouldDouble(s) {
  if (s.doubleAt >= 0 || survives(s, 40)) return false;
  const t = structuredClone(s);
  shredStep(t, true);
  return t.alive && survives(t, 70);
}

test('Shred the Summit: a simple jumping bot gets well down the mountain, and runs replay exactly', () => {
  let far = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const s = shredStart(seed * 7919);
    const inputs = [];
    // The bot plays until it crashes (replays always run to the crash).
    while (s.alive) {
      const tap = s.grounded ? shouldJump(s) : shouldDouble(s);
      if (tap) inputs.push([s.tick, 1]);
      shredStep(s, tap);
    }
    if (shredScore(s) >= SHRED.hotDogsFrom) far += 1;
    const replay = replaySkillGame('shred', seed * 7919, inputs);
    assert.equal(replay.score, shredScore(s), `seed ${seed} replays to the same score`);
  }
  assert.ok(far >= 10, `only ${far} of 12 runs reached the hot dogs`);
});

test('Shred the Summit: gaps are always narrower than a jump, and obstacles leave room to land', () => {
  const air = (2 * SHRED.jump) / SHRED.gravity;
  for (let seed = 1; seed <= 30; seed += 1) {
    const s = shredStart(seed);
    const pits = new Map();
    const rocks = new Map();
    // Building the mountain only needs the rider to move along; keep them safe on the ground.
    for (let i = 0; i < 400; i += 1) {
      s.pits.forEach((p) => pits.set(p.x0, p));
      s.obstacles.filter((o) => !o.roll).forEach((o) => rocks.set(o.id, o.x));
      s.x += 60;
      shredStep(Object.assign(s, { alive: true, grounded: false, y: -1e6, vy: 0, hotdogs: [] }), false);
    }
    // The widest gaps need the double jump.
    const widest = air * shredSpeed(1e9) * 0.9;
    for (const p of pits.values()) assert.ok(p.x1 - p.x0 < widest, `seed ${seed}: gap ${Math.round(p.x1 - p.x0)} too wide`);
    const xs = [...rocks.values()].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] >= air * shredSpeed(0) * 1.29, `seed ${seed}: obstacles ${Math.round(xs[i] - xs[i - 1])} apart`);
  }
});

test('Shred the Summit: a second tap in the air double jumps once, higher than one jump', () => {
  const peak = (taps) => {
    const s = shredStart(5);
    for (let i = 0; i < 40; i += 1) shredStep(s, false);
    let top = s.y;
    for (let i = 0; i < 60; i += 1) {
      shredStep(s, taps.includes(i));
      top = Math.min(top, s.y);
    }
    return { top, doubles: s.jumps };
  };
  const one = peak([0]);
  const two = peak([0, 10]);
  const three = peak([0, 10, 14]);
  assert.ok(two.top < one.top - 30, 'the double jump goes higher');
  assert.equal(two.doubles, 2);
  assert.equal(three.doubles, 2, 'only one double jump per trip through the air');
});

test('Shred the Summit: riding off an edge keeps the jump and the double jump for the air', () => {
  const s = shredStart(9);
  for (let i = 0; i < 20; i += 1) shredStep(s, false);
  // As if the ground just dropped away under the board.
  Object.assign(s, { grounded: false, lastGround: -100, vy: 3, y: s.y - 200 });
  shredStep(s, true);
  assert.ok(s.vy < -SHRED.jump + 1, 'a full jump in the air');
  assert.equal(s.doubleAt, -100, 'the double jump is still there');
  for (let i = 0; i < 6; i += 1) shredStep(s, false);
  shredStep(s, true);
  assert.ok(s.doubleAt >= 0, 'then the double jump');
  assert.equal(s.jumps, 2);
});

test('Shred the Summit: points come from footballs (10) and landing on top of things (5), not distance', () => {
  const s = shredStart(11);
  for (let i = 0; i < 30; i += 1) shredStep(s, false);
  assert.ok(s.x > 0);
  const before = shredScore(s);
  assert.equal(before, s.balls * 10 + s.stomps * 5);
  // Drop the rider onto a rock just ahead: a bounce and 5 points, not a crash.
  const g = s.y;
  s.obstacles = [{ id: 999, kind: 'rock', x: s.x + s.vx, y: g, w: 30, h: 20, roll: 0 }];
  s.footballs = [];
  Object.assign(s, { grounded: false, jumped: true, vy: 4, y: g - 18 });
  shredStep(s, false);
  assert.ok(s.alive, 'landing on top is safe');
  assert.equal(s.stomps, 1);
  assert.ok(s.vy < 0, 'bounced up');
  assert.equal(shredScore(s), before + 5);
});

test('Shred the Summit: a gift sled gives a football, or later a hot dog on a fuse', () => {
  const s = shredStart(12);
  for (let i = 0; i < 30; i += 1) shredStep(s, false);
  s.footballs = [];
  s.obstacles = [{ id: 998, kind: 'sled', x: s.x + s.vx, y: s.y, w: 50, h: 36, roll: 0, gift: true }];
  shredStep(s, false);
  assert.equal(s.balls, 1, 'early gifts are footballs');
  assert.equal(s.obstacles[0].gift, false);
  // With plenty of footballs, some gifts are hot dogs thrown ahead.
  let dogs = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const t = shredStart(seed);
    for (let i = 0; i < 30; i += 1) shredStep(t, false);
    t.balls = 20;
    t.footballs = [];
    t.hotdogs = [];
    t.obstacles = [{ id: 997, kind: 'sled', x: t.x + t.vx, y: t.y, w: 50, h: 36, roll: 0, gift: true }];
    shredStep(t, false);
    assert.ok(t.alive, 'opening a gift is safe');
    if (t.hotdogs.some((d) => !d.sky && d.fuse > 0)) dogs += 1;
  }
  assert.ok(dogs > 2 && dogs < 18, `${dogs} of 20 gifts were hot dogs`);
});
