// Crew Fun Run: the race rules. Every runner moves on fixed 1/30 s ticks over a course made from a seed,
// driven only by its own inputs (jumps, item uses, and hits it received, each with the tick it happened).
// That makes a runner's whole race replayable from its input list, which is how phones share the race:
// each phone sends its own inputs now and then, and the others replay them (see raceNet.js). Only plain
// arithmetic here (no Math.sin and friends), so every phone gets exactly the same result.

export const TICKS_PER_SECOND = 30;

export const COURSE_LENGTH = 11000;
export const RUN_SPEED = 8;
export const GRAVITY = 1.6;
export const JUMP = 20;
export const SUPER_JUMP = 27;
export const RUNNER_HALF_WIDTH = 16;
export const RUNNER_HEIGHT = 60;
/** How long after the first finisher the race waits for everyone else. */
export const FINISH_GRACE_TICKS = TICKS_PER_SECOND * 30;
/** A runner who never finishes stops being simulated here. */
export const MAX_TICKS = TICKS_PER_SECOND * 240;

/**
 * How often a phone sends its inputs, and how far behind the others are drawn so their inputs have
 * arrived. The free Realtime plan allows about 100 messages a second, counted once per phone that
 * receives one, so more racers means fewer, bigger batches.
 */
export const batchMs = (racers) => (racers <= 5 ? 1000 : 2000);
export const viewDelayMs = (racers) => batchMs(racers) + 700;

// ---- Random numbers -----------------------------------------------------------------------------------

export function nextRandom(state) {
  let t = (state.r = (state.r + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function mixSeed(seed, salt) {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

// ---- Items ------------------------------------------------------------------------------------------------

/**
 * One item per crew member (crew index order: John, Evan, Bush, Pat, Michael, Chrome, Connor, Ben, Weltz,
 * Logan). A box gives your own character's item 40% of the time, so who you pick matters.
 */
export const ITEMS = [
  { key: 'horseshoe', crew: 0, name: 'Colts Horseshoe', line: 'Go Colts!', does: 'Knocks down everyone just ahead of you.' },
  { key: 'bionic', crew: 1, name: "Evan's Bionic Legs", line: '010101', does: 'Super jumps and a little extra speed for 5 seconds.' },
  { key: 'eye', crew: 2, name: 'Bleeding Eye', line: 'My eye is bleeding!', does: 'Splatters the screen of everyone ahead of you.' },
  { key: 'potion', crew: 3, name: "Pat's Science Potion", line: 'Science rules!', does: 'Freezes the runner right in front of you.' },
  { key: 'seven', crew: 4, name: "Michael's $7 Bid", line: "I guess I'll take him for $7!", does: 'Drags the leader back to where you are.' },
  { key: 'shield', crew: 5, name: "Chrome's Money Shield", line: 'Money is no issue.', does: 'Blocks the next trap or hit (8 seconds).' },
  { key: 'car', crew: 6, name: "Connor's '57", line: "Wanna take a ride in my '57?", does: 'Drive fast through anything for 2.5 seconds.' },
  { key: 'spit', crew: 7, name: "Ben's Ptooey", line: 'Ptooey!', does: 'Leaves a slippery puddle behind you.' },
  { key: 'oip', crew: 8, name: 'OIP Shout', line: 'OIP!', does: 'Stuns everyone close to you, in front or behind.' },
  { key: 'dew', crew: 9, name: "Logan's Mountain Dew", line: "I'm from Denver, bro.", does: 'A big burst of speed for 3 seconds.' },
];
export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((item) => [item.key, item]));

/** The item box `boxIndex` gives the runner in roster slot `slot`, who plays crew member `crew`. */
export function itemFor(seed, slot, boxIndex, crew) {
  const state = { r: mixSeed(mixSeed(seed, 1000 + slot), boxIndex) };
  if (nextRandom(state) < 0.4) return ITEMS[crew % ITEMS.length].key;
  return ITEMS[Math.floor(nextRandom(state) * ITEMS.length)].key;
}

/** How long each effect lasts, in ticks. */
export const EFFECT = {
  dew: 90, bionic: 150, car: 75, shield: 240, stun: 36, fall: 15, freeze: 60, oip: 45, horseshoe: 30, slip: 30, blind: 90,
};
export const OIP_RANGE = 450;
export const HORSESHOE_RANGE = 900;

// ---- The course --------------------------------------------------------------------------------------------

/**
 * A course from a seed: gaps (fall in and you climb back out at the edge), spikes (stopped where you hit
 * them), rock walls (jump onto or over), and item boxes. Obstacles are spaced so a good jump always clears.
 */
export function makeCourse(seed) {
  const state = { r: mixSeed(seed, 7) };
  const rand = () => nextRandom(state);
  const gaps = [];
  const spikes = [];
  const walls = [];
  const boxes = [];
  let x = 700;
  let nextBox = 500;
  while (x < COURSE_LENGTH - 500) {
    const roll = rand();
    if (x >= nextBox) {
      boxes.push({ x: x - 120, y: 30 });
      nextBox = x + 800 + Math.floor(rand() * 500);
    }
    if (roll < 0.3) {
      const w = 70 + Math.floor(rand() * 60);
      gaps.push({ start: x, end: x + w });
      x += w;
    } else if (roll < 0.58) {
      const w = 36 + Math.floor(rand() * 44);
      spikes.push({ start: x, end: x + w, y: 0 });
      x += w;
    } else if (roll < 0.86) {
      const w = 70 + Math.floor(rand() * 140);
      const h = 45 + Math.floor(rand() * 55);
      walls.push({ start: x, end: x + w, h });
      // Long rocks sometimes have a spike strip on top to hop over.
      if (w >= 170 && rand() < 0.5) spikes.push({ start: x + Math.floor(w / 2) - 18, end: x + Math.floor(w / 2) + 18, y: h });
      x += w;
    } else {
      // Two spike strips close together: one long jump or two quick ones.
      spikes.push({ start: x, end: x + 36, y: 0 });
      spikes.push({ start: x + 230, end: x + 266, y: 0 });
      x += 266;
    }
    x += 220 + Math.floor(rand() * 220);
  }
  return { seed, length: COURSE_LENGTH, gaps, spikes, walls, boxes };
}

const inGap = (course, x) => course.gaps.some((g) => x > g.start + 6 && x < g.end - 6);
const wallAt = (course, x) => course.walls.find((w) => x >= w.start && x <= w.end) || null;

/** Floor height under x, or null over a gap. */
export function groundAt(course, x) {
  const wall = wallAt(course, x);
  if (wall) return wall.h;
  return inGap(course, x) ? null : 0;
}

// ---- A runner ------------------------------------------------------------------------------------------------

export function startRunner(slot, crew) {
  return {
    slot, crew,
    tick: 0, x: 60, y: 0, vy: 0, grounded: true,
    stunUntil: 0, freezeUntil: 0, dewUntil: 0, bionicUntil: 0, carUntil: 0, shieldUntil: 0, blindUntil: 0,
    item: null, boxesTaken: [], lastSpike: -1, lastTrap: -1, traps: [],
    finishTick: null, hitBy: null, falls: 0,
  };
}

export const isStopped = (r) => r.tick < r.stunUntil || r.tick < r.freezeUntil;
export const isSafe = (r) => r.tick < r.carUntil;

function speedOf(r) {
  if (isStopped(r)) return 0;
  if (r.tick < r.carUntil) return RUN_SPEED * 1.9;
  if (r.tick < r.dewUntil) return RUN_SPEED * 1.55;
  if (r.tick < r.bionicUntil) return RUN_SPEED * 1.2;
  return RUN_SPEED;
}

/** Something bad happened (trap or hit): the shield or the '57 may soak it up. Returns true when it lands. */
function takeHit(r) {
  if (isSafe(r)) return false;
  if (r.tick < r.shieldUntil) {
    r.shieldUntil = 0;
    return false;
  }
  return true;
}

/**
 * An effect from someone else's item, as the target applies it. `arg` is the attacker's position.
 * Returns true when it landed (so the target records it in its inputs).
 */
export function applyHit(r, course, kind, arg) {
  if (r.finishTick != null) return false;
  if (kind === 'oip' && Math.abs(r.x - arg) > OIP_RANGE) return false;
  if (kind === 'horseshoe' && !(r.x > arg && r.x < arg + HORSESHOE_RANGE)) return false;
  if (kind === 'seven' && !(r.x > arg)) return false;
  if (kind === 'eye') {
    if (!(r.x > arg)) return false;
    r.blindUntil = r.tick + EFFECT.blind;
    return true;
  }
  if (!takeHit(r)) return false;
  if (kind === 'oip') r.stunUntil = r.tick + EFFECT.oip;
  else if (kind === 'horseshoe') r.stunUntil = r.tick + EFFECT.horseshoe;
  else if (kind === 'potion') r.freezeUntil = r.tick + EFFECT.freeze;
  else if (kind === 'seven') {
    // Back to the bidder's spot (or the nearest solid ground behind it).
    let x = arg;
    while (groundAt(course, x) == null && x > 0) x -= 10;
    r.x = x;
    r.y = groundAt(course, x) || 0;
    r.vy = 0;
    r.grounded = true;
    r.stunUntil = r.tick + 20;
  }
  r.hitBy = kind;
  return true;
}

/**
 * Uses the held item. Effects on yourself happen here; effects on others come back as an event for the
 * race to send ({ kind, arg }, plus `target` when it picks one runner), or null.
 */
export function fireItem(r) {
  const item = r.item;
  if (!item || r.finishTick != null) return null;
  r.item = null;
  if (item === 'dew') r.dewUntil = r.tick + EFFECT.dew;
  else if (item === 'bionic') r.bionicUntil = r.tick + EFFECT.bionic;
  else if (item === 'car') r.carUntil = r.tick + EFFECT.car;
  else if (item === 'shield') r.shieldUntil = r.tick + EFFECT.shield;
  else return { kind: item, arg: Math.round(r.x) };
  return { kind: item, self: true };
}

/**
 * One tick. `actions` is this tick's inputs: ['j'] jump, ['u'] use item, ['h', kind, arg] a hit that
 * landed, ['t', x] a puddle someone dropped. Returns the event from a used item, if any.
 */
export function stepRunner(r, course, actions = []) {
  let event = null;
  if (r.finishTick != null || r.tick >= MAX_TICKS) {
    r.tick += 1;
    return null;
  }
  for (const action of actions) {
    if (action[0] === 'j' && r.grounded && !isStopped(r)) {
      r.vy = r.tick < r.bionicUntil ? SUPER_JUMP : JUMP;
      r.grounded = false;
    } else if (action[0] === 'u') {
      event = fireItem(r);
    } else if (action[0] === 'h') {
      applyHit(r, course, action[1], action[2]);
    } else if (action[0] === 't') {
      r.traps.push(action[1]);
    }
  }

  // Forward, unless a rock wall is in the way below its top.
  const fromX = r.x;
  let toX = r.x + speedOf(r);
  for (const wall of course.walls) {
    const face = wall.start - RUNNER_HALF_WIDTH;
    if (fromX <= face && toX > face && r.y < wall.h - 0.5) {
      if (isSafe(r)) continue; // the '57 drives straight up and over
      toX = face;
    }
  }
  if (isSafe(r)) {
    const wall = wallAt(course, toX);
    if (wall && r.y < wall.h) { r.y = wall.h; r.vy = 0; r.grounded = true; }
  }
  r.x = toX;

  // Up and down.
  const ground = groundAt(course, r.x);
  if (!r.grounded || ground == null || r.y > ground) {
    const fromY = r.y;
    r.vy -= GRAVITY;
    r.y += r.vy;
    r.grounded = false;
    if (ground != null && r.y <= ground && fromY >= ground - 0.5) {
      r.y = ground;
      r.vy = 0;
      r.grounded = true;
    }
  } else if (ground != null && r.y < ground) {
    r.y = ground;
  }
  if (r.grounded && ground != null && r.y > ground) r.grounded = false;

  // Fell in a gap: climb out at the near edge.
  if (r.y < -220) {
    const gap = course.gaps.find((g) => r.x >= g.start - 30 && r.x <= g.end + 30) || { start: r.x };
    r.x = gap.start - 30;
    r.y = 0;
    r.vy = 0;
    r.grounded = true;
    r.stunUntil = r.tick + EFFECT.fall;
    r.falls += 1;
    r.hitBy = 'gap';
  }

  // Spikes and puddles stop you right where you hit them.
  course.spikes.forEach((spike, index) => {
    if (index === r.lastSpike) return;
    if (r.x + RUNNER_HALF_WIDTH * 0.6 > spike.start && r.x - RUNNER_HALF_WIDTH * 0.6 < spike.end && r.y >= spike.y - 1 && r.y < spike.y + 14) {
      r.lastSpike = index;
      if (takeHit(r)) { r.stunUntil = r.tick + EFFECT.stun; r.hitBy = 'spike'; }
    }
  });
  r.traps.forEach((trapX, index) => {
    if (index <= r.lastTrap) return;
    if (Math.abs(r.x - trapX) < 26 && r.y < 12 && r.grounded) {
      r.lastTrap = index;
      if (takeHit(r)) { r.stunUntil = r.tick + EFFECT.slip; r.hitBy = 'spit'; }
    }
  });

  // Item boxes: one per box per runner, and only with empty hands.
  if (!r.item) {
    course.boxes.forEach((box, index) => {
      if (r.boxesTaken.includes(index)) return;
      if (Math.abs(r.x - box.x) < 32 && r.y < box.y + 40 && r.y + RUNNER_HEIGHT > box.y) {
        r.boxesTaken.push(index);
        r.item = itemFor(course.seed, r.slot, index, r.crew);
      }
    });
  }

  r.tick += 1;
  if (r.x >= course.length && r.finishTick == null) r.finishTick = r.tick;
  return event;
}

/** 0-1 of the way to the finish line. */
export const progressOf = (r) => Math.max(0, Math.min(1, r.x / COURSE_LENGTH));

/** Final order: finishers by time, then everyone else by how far they got. */
export function standings(runners) {
  return runners.slice().sort((a, b) => {
    if (a.finishTick != null && b.finishTick != null) return a.finishTick - b.finishTick;
    if (a.finishTick != null) return -1;
    if (b.finishTick != null) return 1;
    return b.x - a.x;
  });
}

// ---- Crew bots (practice) -------------------------------------------------------------------------------

/**
 * A computer runner's inputs for this tick. `skill` 0-1: how well it times its jumps. `rand` is its own
 * random function. It looks at what's just ahead and jumps a little early or late depending on skill.
 */
export function botActions(r, course, skill, rand) {
  const actions = [];
  if (r.finishTick != null || isStopped(r)) return actions;
  const speed = speedOf(r);
  const jitter = (rand() - 0.5) * (1 - skill) * 150;
  const lead = 46 + (speed - RUN_SPEED) * 6 + jitter;
  const ahead = (start, extra = 0) => start - r.x > 0 && start - r.x < lead + extra;
  const danger = course.gaps.some((g) => ahead(g.start))
    || course.spikes.some((s, i) => i !== r.lastSpike && ahead(s.start) && Math.abs(s.y - r.y) < 5)
    || course.walls.some((w) => ahead(w.start - RUNNER_HALF_WIDTH, 24) && r.y < w.h);
  if (danger && r.grounded) actions.push(['j']);
  if (r.item && rand() < 0.02) actions.push(['u']);
  return actions;
}
