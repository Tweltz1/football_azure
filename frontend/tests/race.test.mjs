import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  behindPar, botActions, EFFECT, groundAt, itemFor, ITEMS, makeCourse, mapFor, MAPS, MAX_TICKS, nextRandom, replayRun, RESPAWN_BACK,
  startRunner, stepRunner,
} from '../src/games/race/raceSim.js';
import { createRaceEngine } from '../src/games/race/raceEngine.js';

const rng = (seed) => { const s = { r: seed }; return () => nextRandom(s); };

test('crew bots finish every course, and a run replays exactly from its inputs', () => {
  const maps = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const course = makeCourse(seed);
    maps.add(course.map);
    const runner = startRunner(0, seed % 10);
    const rand = rng(seed);
    const log = [];
    while (runner.finishTick == null && runner.tick < MAX_TICKS) {
      const actions = botActions(runner, course, 0.6, rand);
      actions.forEach((a) => log.push([runner.tick, ...a]));
      stepRunner(runner, course, actions);
    }
    assert.ok(runner.finishTick != null && runner.finishTick < 30 * 90, `seed ${seed} took ${runner.finishTick}`);
    const again = startRunner(0, seed % 10);
    let i = 0;
    while (again.finishTick == null && again.tick < MAX_TICKS) {
      const actions = [];
      while (i < log.length && log[i][0] === again.tick) actions.push(log[i++].slice(1));
      stepRunner(again, course, actions);
    }
    assert.equal(again.finishTick, runner.finishTick);
    assert.equal(again.x, runner.x);
    assert.equal(replayRun(seed, 0, seed % 10, log).finishTick, runner.finishTick);
  }
});

test('two phones see the same race, hits included, with messages arriving late', () => {
  const roster = [{ cid: 'a', name: 'Ann', crew: 8 }, { cid: 'b', name: 'Bo', crew: 3 }, { cid: 'c', name: 'Cy', crew: 6 }];
  const queue = [];
  let now = 0;
  const engines = {};
  const netFor = (cid) => ({ send: (event, payload) => queue.push({ at: now + 4 + (queue.length % 5), from: cid, event, payload }) });
  for (const p of roster) engines[p.cid] = createRaceEngine({ seed: 4242, roster, meCid: p.cid, net: netFor(p.cid) });
  const brains = Object.fromEntries(roster.map((p, i) => [p.cid, rng(10 + i)]));
  let hits = 0;
  while (!Object.values(engines).every((e) => e.over) && now < MAX_TICKS + 2000) {
    for (const msg of queue.filter((m) => m.at <= now)) {
      queue.splice(queue.indexOf(msg), 1);
      for (const [cid, e] of Object.entries(engines)) {
        if (cid === msg.from) continue;
        if (msg.event === 'inp') e.receiveInputs(msg.payload);
        if (msg.event === 'atk') { e.receiveAttack(msg.payload); hits += 1; }
      }
    }
    for (const [cid, e] of Object.entries(engines)) {
      if (e.over) continue;
      const me = e.me.runner;
      // Use items right away so attacks fly between phones.
      botActions(me, e.course, 0.7, brains[cid]).forEach((a) => (a[0] === 'j' ? e.jump() : null));
      if (me.item) e.useItem();
      e.step();
    }
    now += 1;
  }
  // Deliver anything still in flight, then let each phone's replay catch up.
  for (const msg of queue) for (const [cid, e] of Object.entries(engines)) if (cid !== msg.from && msg.event === 'inp') e.receiveInputs(msg.payload);
  assert.ok(hits > 0, 'some power-ups were thrown at other phones');
  for (const p of roster) {
    const own = engines[p.cid].me.runner;
    assert.ok(own.finishTick != null, `${p.cid} finished`);
    for (const other of Object.values(engines)) {
      const seen = other.racers.find((r) => r.cid === p.cid).runner;
      // Replay the rest of what this phone has received.
      while (seen.finishTick == null && seen.tick < MAX_TICKS) {
        const r = other.racers.find((x) => x.cid === p.cid);
        if (seen.tick > r.upto) break;
        stepRunner(seen, other.course, r.inputs.get(seen.tick) || []);
      }
      assert.equal(seen.finishTick, own.finishTick, `${p.cid} as seen by another phone`);
    }
  }
});

test("the host's phone runs the fill-in bots and the other phones replay them exactly", () => {
  const roster = [
    { cid: 'a', name: 'Ann', crew: 8 }, { cid: 'b', name: 'Bo', crew: 3 },
    { cid: 'bot-1', name: 'Pat bot', crew: 3, bot: true, skill: 0.6 }, { cid: 'bot-2', name: 'Evan bot', crew: 1, bot: true, skill: 0.55 },
  ];
  const queue = [];
  let now = 0;
  const engines = {};
  const netFor = (cid) => ({ send: (event, payload) => queue.push({ at: now + 3 + (queue.length % 4), from: cid, event, payload }) });
  for (const p of roster.filter((r) => !r.bot)) engines[p.cid] = createRaceEngine({ seed: 777, roster, meCid: p.cid, hostCid: 'a', net: netFor(p.cid) });
  const brains = { a: rng(1), b: rng(2) };
  while (!Object.values(engines).every((e) => e.over) && now < MAX_TICKS + 2000) {
    for (const msg of queue.filter((m) => m.at <= now)) {
      queue.splice(queue.indexOf(msg), 1);
      for (const [cid, e] of Object.entries(engines)) {
        if (cid === msg.from) continue;
        if (msg.event === 'inp') e.receiveInputs(msg.payload);
        if (msg.event === 'atk') e.receiveAttack(msg.payload);
      }
    }
    for (const [cid, e] of Object.entries(engines)) {
      if (e.over) continue;
      botActions(e.me.runner, e.course, 0.7, brains[cid]).forEach((a) => (a[0] === 'j' ? e.jump() : null));
      if (e.me.runner.item) e.useItem();
      e.step();
    }
    now += 1;
  }
  for (const msg of queue) if (msg.event === 'inp') engines.b.receiveInputs(msg.payload);
  for (const cid of ['bot-1', 'bot-2']) {
    const own = engines.a.racers.find((r) => r.cid === cid).runner;
    const r = engines.b.racers.find((x) => x.cid === cid);
    const seen = r.runner;
    while (seen.finishTick == null && seen.tick <= r.upto && seen.tick < own.tick) stepRunner(seen, engines.b.course, r.inputs.get(seen.tick) || []);
    assert.equal(seen.finishTick, own.finishTick, `${cid} on the other phone`);
    if (own.finishTick == null) assert.equal(seen.x, own.x);
  }
  assert.ok(engines.a.racers.some((r) => r.bot && r.runner.x > 2000), 'bots ran');
});

test('all three maps come up, and boxes lean a little toward speed-ups for a runner far behind', () => {
  const seen = new Set(Array.from({ length: 60 }, (_, i) => mapFor(i).key));
  assert.equal(seen.size, MAPS.length);
  const count = (behind) => {
    const n = {};
    for (let box = 0; box < 4000; box += 1) { const k = itemFor(99, box % 10, box, behind); n[k] = (n[k] || 0) + 1; }
    return n;
  };
  const even = count(0);
  const back = count(1);
  ITEMS.forEach((item) => assert.ok(even[item.key] > 250, `${item.key} shows up`));
  const boosts = (n) => ['dew', 'bionic', 'car', 'shield'].reduce((a, k) => a + n[k], 0);
  assert.ok(boosts(back) > boosts(even) * 1.4 && boosts(back) < 4000 * 0.65, `${boosts(even)} -> ${boosts(back)}`);
  const r = startRunner(0, 0);
  assert.equal(behindPar(r), 0);
  r.tick = 900;
  assert.ok(behindPar(r) === 1);
});

test('after falling in a gap you climb out with a run-up, on clear ground, and can clear it', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const course = makeCourse(seed);
    const gap = course.gaps[0];
    if (!gap) continue;
    const r = startRunner(0, 0);
    r.x = gap.start + 10;
    r.y = 0;
    let t = 0;
    while (r.falls === 0 && t < 200) { stepRunner(r, course); t += 1; }
    assert.equal(r.x, gap.start - RESPAWN_BACK);
    for (let x = r.x; x < gap.start; x += 4) assert.equal(groundAt(course, x), 0, `clear run-up at ${x} (seed ${seed})`);
    // Once the stun wears off there's time to react: jumping half a second later still clears it.
    while (r.tick < r.stunUntil + 15) stepRunner(r, course);
    stepRunner(r, course, [['j']]);
    for (let i = 0; i < 60; i += 1) stepRunner(r, course);
    assert.equal(r.falls, 1, `cleared the gap on the retry (seed ${seed})`);
    assert.ok(r.x > gap.end);
    assert.ok(EFFECT.fall > 0);
  }
});
