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
  return t.alive && survives(t, 30);
}

test('Shred the Summit: a simple jumping bot gets well down the mountain, and runs replay exactly', () => {
  let far = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const s = shredStart(seed * 7919);
    const inputs = [];
    // The bot plays until it crashes (replays always run to the crash).
    while (s.alive) {
      const tap = s.grounded && shouldJump(s);
      if (tap) inputs.push([s.tick, 1]);
      shredStep(s, tap);
    }
    if (shredScore(s) >= SHRED.hotDogsFrom) far += 1;
    const replay = replaySkillGame('shred', seed * 7919, inputs);
    assert.equal(replay.score, shredScore(s), `seed ${seed} replays to the same score`);
  }
  assert.ok(far >= 8, `only ${far} of 12 runs reached the hot dogs`);
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
    const widest = air * shredSpeed(1e9) * 0.66;
    for (const p of pits.values()) assert.ok(p.x1 - p.x0 < widest, `seed ${seed}: gap ${Math.round(p.x1 - p.x0)} too wide`);
    const xs = [...rocks.values()].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] >= air * shredSpeed(0) * 1.29, `seed ${seed}: obstacles ${Math.round(xs[i] - xs[i - 1])} apart`);
  }
});
