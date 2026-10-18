// Lobby mini-games: five games a league member plays from the draft lobby (one official try) to win
// extra draft dollars, also playable for practice on the Games page. The same code runs on the server
// (to check scores) and in the browser (bundled into frontend/src/games/sim.generated.js).
//
// Two kinds of game:
// - Skill games (Climb Dash, Shred the Summit, Field Goal Gauntlet) run on fixed 1/30 s ticks from a seed. The browser
//   records each input with its tick and the server replays the run to get the score, so a score can't
//   just be typed in.
// - Turn games (Penalty Kicks, Price Is Right, Name That Player) are dealt one turn at a time by the
//   server from a seed the browser never sees, and timed by the server's clock, so looking up answers
//   or reading the keeper ahead of time doesn't work.
// Everything here uses plain arithmetic (no Math.sin and friends) so every JS engine gets the same result.

import { TRIVIA_ROWS, type TriviaRow } from './triviaData.ts';
import type { MiniGameAttempt } from './models.ts';

export const TICKS_PER_SECOND = 30;

const TRIVIA_FIRST = Math.min(...TRIVIA_ROWS.map((row) => row[3]));
const TRIVIA_LAST = Math.max(...TRIVIA_ROWS.map((row) => row[3]));

export type GameKind = 'climb' | 'shred' | 'fieldgoal' | 'penalty' | 'price' | 'nameplayer';

export interface GameInfo {
  title: string;
  blurb: string;
  /** 'skill' = replayed from inputs; 'turns' = dealt and graded by the server one turn at a time. */
  style: 'skill' | 'turns';
  /** What the score counts, shown next to it. */
  unit: string;
}

export const GAMES: Record<GameKind, GameInfo> = {
  climb: {
    title: 'The Climb Dash',
    blurb: 'Climb the mountain while the crew tumbles down at you. Dodge Chrome, Connor\'s \'57 and the rest. Grab "OIP!" for a bonus.',
    style: 'skill',
    unit: 'pts',
  },
  shred: {
    title: 'Shred the Summit',
    blurb: 'Snowboard down the mountain. Tap to jump (tap again in the air to double jump). Footballs are 10 points and landing on top of a rock, stump or tree is 5. Ride through gift sleds for footballs, but later some hold hot dogs on a fuse, and past 100 points hot dogs fall from the sky. It gets faster the farther you go.',
    style: 'skill',
    unit: 'pts',
  },
  fieldgoal: {
    title: 'Field Goal Gauntlet',
    blurb: 'Michael holds. Tap to aim, tap for power, mind the wind. It starts at 20 yards and backs up 5 every make. One miss ends it.',
    style: 'skill',
    unit: 'yds',
  },
  penalty: {
    title: 'Pink Dress Penalty Kicks',
    blurb: 'Ten penalty kicks at Chrome in the pink dress. Pick left or right, high or low, time your power, and hope he dives the wrong way.',
    style: 'turns',
    unit: 'goals',
  },
  price: {
    title: 'Price Is Right: Fantasy Edition',
    blurb: `Guess a player's PPR fantasy points for one season (${TRIVIA_FIRST}-${TRIVIA_LAST}). Closest without going over scores the most. 20 seconds a guess.`,
    style: 'turns',
    unit: 'pts',
  },
  nameplayer: {
    title: 'Name That Player',
    blurb: `A mystery season's stat line (${TRIVIA_FIRST}-${TRIVIA_LAST}) and four names. Pick the right one fast; quicker answers score more.`,
    style: 'turns',
    unit: 'pts',
  },
};

export const GAME_KINDS = Object.keys(GAMES) as GameKind[];
export const isGameKind = (value: unknown): value is GameKind => typeof value === 'string' && value in GAMES;

// ---- Random numbers -----------------------------------------------------------------------------------

/** mulberry32 on a state object, so a game's state stays plain JSON. */
export function nextRandom(state: { r: number }): number {
  let t = (state.r = (state.r + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Mixes a number into a seed (for "turn 3 of this seed" and the like). */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

const randomFrom = (seed: number, salt: number) => {
  const state = { r: mixSeed(seed, salt) };
  return () => nextRandom(state);
};

/** A triangle wave from -1 to 1 and back over `period` ticks (the swinging meters). */
export function swing(ticks: number, period: number): number {
  const phase = (ticks % period) / period;
  return phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase;
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** A seed's inputs: [tick, value] pairs in tick order. */
export type Input = [number, number];

// ---- The Climb Dash ---------------------------------------------------------------------------------

export const CLIMB = {
  lanes: 3,
  /** The climber's box, in a 0-100 tall screen. */
  playerTop: 80,
  playerBottom: 92,
  objectSize: 10,
  oipBonus: 25,
  maxTicks: TICKS_PER_SECOND * 600,
};

export type ClimbKind = 'guy' | 'chrome' | 'car' | 'oip';

export interface ClimbObject {
  id: number;
  kind: ClimbKind;
  lane: number;
  y: number;
  /** Which crew member falls (index into the crew list), for drawing. */
  art: number;
}

export interface ClimbState {
  r: number;
  tick: number;
  lane: number;
  height: number;
  oips: number;
  alive: boolean;
  hitBy: ClimbKind | null;
  objects: ClimbObject[];
  nextRow: number;
  nextId: number;
}

/** Fall speed in screen units per tick: it speeds up for the first three minutes. */
export const climbSpeed = (tick: number) => Math.min(2.4, 0.85 + tick * 0.00028);

export function climbStart(seed: number): ClimbState {
  return { r: seed | 0, tick: 0, lane: 1, height: 0, oips: 0, alive: true, hitBy: null, objects: [], nextRow: 20, nextId: 1 };
}

function spawnClimbRow(s: ClimbState) {
  const blockTwo = nextRandom(s) < Math.min(0.7, 0.15 + s.tick / 4000);
  const open = Math.floor(nextRandom(s) * CLIMB.lanes);
  let blocked = [0, 1, 2].filter((lane) => lane !== open);
  if (!blockTwo) blocked = [blocked[Math.floor(nextRandom(s) * 2)]];
  for (const lane of blocked) {
    const roll = nextRandom(s);
    const kind: ClimbKind = roll < 0.12 ? 'car' : roll < 0.3 ? 'chrome' : 'guy';
    const art = kind === 'car' ? 6 : kind === 'chrome' ? 5 : Math.floor(nextRandom(s) * 10);
    s.objects.push({ id: s.nextId++, kind, lane, y: -CLIMB.objectSize, art });
  }
  if (nextRandom(s) < 0.22) {
    const free = [0, 1, 2].filter((lane) => !blocked.includes(lane));
    s.objects.push({ id: s.nextId++, kind: 'oip', lane: free[Math.floor(nextRandom(s) * free.length)], y: -CLIMB.objectSize, art: 8 });
  }
  // Rows always leave room to slip between them, however fast things fall.
  const v = climbSpeed(s.tick);
  const gap = CLIMB.objectSize + (CLIMB.playerBottom - CLIMB.playerTop) + 4;
  s.nextRow = s.tick + Math.max(Math.ceil(gap / v), Math.floor(30 - s.tick / 200));
}

/** One tick. `lane` (0-2) moves the climber first when given. Changes and returns the state. */
export function climbStep(s: ClimbState, lane?: number | null): ClimbState {
  if (!s.alive) return s;
  if (lane != null) s.lane = clamp(Math.trunc(lane), 0, CLIMB.lanes - 1);
  if (s.tick >= s.nextRow) spawnClimbRow(s);
  const v = climbSpeed(s.tick);
  const kept: ClimbObject[] = [];
  for (const o of s.objects) {
    o.y += v;
    const touching = o.lane === s.lane && o.y + CLIMB.objectSize > CLIMB.playerTop && o.y < CLIMB.playerBottom;
    if (touching && o.kind === 'oip') {
      s.oips += 1;
      continue;
    }
    if (touching && s.alive) {
      s.alive = false;
      s.hitBy = o.kind;
    }
    if (o.y < 110) kept.push(o);
  }
  s.objects = kept;
  s.height += v * 0.1;
  s.tick += 1;
  if (s.tick >= CLIMB.maxTicks) s.alive = false;
  return s;
}

export const climbScore = (s: ClimbState) => Math.floor(s.height) + s.oips * CLIMB.oipBonus;

// ---- Shred the Summit -----------------------------------------------------------------------------------
// A snowboard run down an endless mountain. The rider moves on their own; a tap jumps. World units: x to
// the right, y DOWN (so going downhill is y growing). The mountain is built a little at a time from the
// seed, just ahead of the rider, and gets harder the farther down it goes.

export const SHRED = {
  gravity: 0.8,
  jump: 12.5,
  /** The second jump, from a tap in the air (once per jump). */
  doubleJump: 10.5,
  maxFall: 18,
  /** The rider's box: half its width, and its height above the board. */
  halfWidth: 11,
  height: 40,
  ballRadius: 12,
  ballPoints: 10,
  /** Landing on top of a rock, stump, tree, snowman or snowball bounces you up for these. */
  stompPoints: 5,
  stompBounce: 9,
  /** World units per meter (distance only sets speed and difficulty; it scores nothing). */
  pointEvery: 25,
  /** Hot dogs start falling from the sky at this score. */
  hotDogsFrom: 100,
  hotDogFall: 40,
  /** Gift sleds can hold a hot dog once you have this many footballs. */
  giftHotDogsFrom: 8,
  /** Letting go of Jump while rising faster than this slows the rise to it (a short hop). */
  jumpCut: 5.5,
  /** How fast gift sleds slide downhill (the rider catches up). */
  sledSlide: 2.5,
  /** Ticks a thrown hot dog sits before it blows. */
  fuse: 45,
  /** Gift launchers (a box that keeps firing footballs and hot dogs) show up from this score. */
  launchersFrom: 200,
  itemGravity: 0.3,
  blastRadius: 38,
  blastHeight: 50,
  blastTicks: 8,
  /** Ticks a tap is remembered for, and ticks after leaving the ground a jump still works. */
  jumpBuffer: 5,
  coyote: 4,
  maxTicks: TICKS_PER_SECOND * 600,
};

/** Ticks in the air for a jump that lands where it took off. */
const SHRED_AIR = (2 * SHRED.jump) / SHRED.gravity;

/** The rider's cruising speed: it picks up the farther down the mountain you get (in meters). */
export const shredSpeed = (meters: number) => 6 + Math.min(4.5, meters / 160);

export type ShredObstacleKind = 'rock' | 'stump' | 'tree' | 'snowman' | 'snowball' | 'sled' | 'launcher';
/** Sleds and launchers are safe to ride through; everything else crashes you unless you land on top. */
const SHRED_SAFE: ShredObstacleKind[] = ['sled', 'launcher'];
export type ShredHit = ShredObstacleKind | 'hotdog' | 'gap' | 'cliff' | 'time';

/** `kind` is only for drawing: a wooden kicker ramp or a trestle bridge over a gap. */
export interface ShredSegment { x0: number; x1: number; y0: number; y1: number; kind?: 'ramp' | 'bridge' }
export interface ShredPit { x0: number; x1: number; floor: number }
export interface ShredObstacle {
  id: number; kind: ShredObstacleKind; x: number; y: number; w: number; h: number; roll: number;
  /** Landed on already (no more points or crashes from it). */
  stomped?: boolean;
  /** A sled still holding its gift. */
  gift?: boolean;
  /** A launcher's next shot (tick). */
  shot?: number;
}
/** A football; `vx`/`vy` while it flies out of a launcher. */
export interface ShredBall { id: number; x: number; y: number; vx?: number; vy?: number }
/**
 * A hot dog: dropped from the sky (`sky`, blows as it lands on `ground`) or thrown from a gift (flies with
 * vx/vy, lands, then blows after `fuse` ticks). `boom` counts up from 1 while it explodes.
 */
export interface ShredHotDog { id: number; x: number; y: number; vx: number; vy: number; ground: number; landed: boolean; sky: boolean; fuse: number; boom: number }

export interface ShredState {
  r: number;
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Last tick on the ground (for a jump just after riding off an edge). */
  lastGround: number;
  /** Tick of the last tap not yet used, or -100. */
  wantJump: number;
  jumps: number;
  /** Tick of the double jump on this trip through the air, or -100 when it's still available. */
  doubleAt: number;
  /** True once the rider has jumped on this trip through the air (riding off an edge isn't a jump). */
  jumped: boolean;
  balls: number;
  stomps: number;
  alive: boolean;
  hitBy: ShredHit | null;
  segments: ShredSegment[];
  pits: ShredPit[];
  obstacles: ShredObstacle[];
  footballs: ShredBall[];
  hotdogs: ShredHotDog[];
  genX: number;
  genY: number;
  noObstacleUntil: number;
  nextHotDog: number;
  nextId: number;
}

export function shredStart(seed: number): ShredState {
  const s: ShredState = {
    r: seed | 0, tick: 0, x: 0, y: 0, vx: shredSpeed(0), vy: 0, grounded: true, lastGround: 0, wantJump: -100, jumps: 0, doubleAt: -100, jumped: false,
    balls: 0, stomps: 0, alive: true, hitBy: null, segments: [], pits: [], obstacles: [], footballs: [], hotdogs: [],
    genX: -300, genY: 0, noObstacleUntil: 900, nextHotDog: 0, nextId: 1,
  };
  shredBuild(s);
  return s;
}

export const shredDistance = (s: ShredState) => Math.max(0, Math.floor(s.x / SHRED.pointEvery));
export const shredScore = (s: ShredState) => s.balls * SHRED.ballPoints + s.stomps * SHRED.stompPoints;

/** The ground's height at x, or null over a gap. */
export function shredGround(s: ShredState, x: number): number | null {
  for (const g of s.segments) {
    if (x >= g.x0 && x < g.x1) return g.y0 + ((g.y1 - g.y0) * (x - g.x0)) / (g.x1 - g.x0);
  }
  return null;
}

const shredSlope = (s: ShredState, x: number) => {
  for (const g of s.segments) if (x >= g.x0 && x < g.x1) return (g.y1 - g.y0) / (g.x1 - g.x0);
  return 0;
};

function addSegment(s: ShredState, length: number, drop: number, kind?: 'ramp' | 'bridge') {
  s.segments.push(kind ? { x0: s.genX, x1: s.genX + length, y0: s.genY, y1: s.genY + drop, kind } : { x0: s.genX, x1: s.genX + length, y0: s.genY, y1: s.genY + drop });
  s.genX += length;
  s.genY += drop;
}

const rand = (s: ShredState, lo: number, hi: number) => lo + nextRandom(s) * (hi - lo);

function addBallLine(s: ShredState, x0: number, count: number, high: boolean) {
  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * 48;
    const g = shredGround(s, x);
    if (g != null) s.footballs.push({ id: s.nextId++, x, y: g - (high ? 95 : 24) });
  }
}

const SHRED_SIZES: Record<ShredObstacleKind, [number, number]> = {
  rock: [30, 20], stump: [34, 16], tree: [26, 48], snowman: [26, 40], snowball: [34, 34], sled: [50, 36], launcher: [50, 40],
};

/** A gift launcher on a flat stretch, once the score is high enough. */
function maybeLauncher(s: ShredState, x0: number, x1: number) {
  if (shredScore(s) < SHRED.launchersFrom || x1 - x0 < 260 || nextRandom(s) > 0.3) return;
  const x = x0 + (x1 - x0) * 0.6;
  const g = shredGround(s, x);
  if (g == null) return;
  s.obstacles.push({ id: s.nextId++, kind: 'launcher', x, y: g, w: SHRED_SIZES.launcher[0], h: SHRED_SIZES.launcher[1], roll: -SHRED.sledSlide * 0.6, shot: 0 });
}

/** Rocks, trees and the rest down a stretch of ground, always far enough apart to land and jump again. */
function placeObstacles(s: ShredState, x0: number, x1: number, reach: number, hard: number) {
  let x = Math.max(x0 + 60, s.noObstacleUntil);
  while (x < x1 - 40) {
    if (nextRandom(s) < 0.5 + 0.3 * hard) {
      const roll = nextRandom(s);
      const kind: ShredObstacleKind = roll < 0.2 ? 'rock' : roll < 0.35 ? 'stump' : roll < 0.53 ? 'tree' : roll < 0.68 ? 'snowman'
        : roll < 0.8 ? (hard < 0.15 ? 'stump' : 'snowball') : 'sled';
      // Snowballs roll at you, so they need extra room in front.
      if (kind === 'snowball') x += 140;
      const g = shredGround(s, x);
      if (x >= x1 - 40 || g == null) break;
      const size = SHRED_SIZES[kind];
      const o: ShredObstacle = { id: s.nextId++, kind, x, y: g, w: size[0], h: size[1], roll: kind === 'snowball' ? 1.6 : 0 };
      // Gift sleds slide on down the hill ahead of you.
      if (kind === 'sled') { o.gift = true; o.roll = -SHRED.sledSlide; }
      s.obstacles.push(o);
      // A football over some of them, for the brave.
      if (nextRandom(s) < 0.3) s.footballs.push({ id: s.nextId++, x, y: g - size[1] - 46 });
      // Always room to land and jump again.
      s.noObstacleUntil = x + reach * 1.6;
      x = s.noObstacleUntil + nextRandom(s) * reach * (1.6 - hard);
    } else {
      x += reach * 0.6;
    }
  }
}

/** A flat-ish run-up before a jump, long enough to land from the last obstacle first. */
const runUp = (s: ShredState, least: number) => Math.max(least, s.noObstacleUntil - s.genX + 40);

/** Builds mountain ahead of the rider. */
function shredBuild(s: ShredState) {
  while (s.genX < s.x + 1800) {
    const hard = Math.min(1, s.genX / 40000);
    const speed = shredSpeed(shredDistance(s) + (s.genX - s.x) / SHRED.pointEvery);
    // How far a jump carries at cruising speed.
    const reach = SHRED_AIR * speed;
    const start = s.genX;
    if (s.genX < 600) {
      addSegment(s, 900, 140);
      continue;
    }
    const roll = nextRandom(s);
    if (roll < 0.24) {
      const length = rand(s, 420, 820);
      addSegment(s, length, length * rand(s, 0.12, 0.34 + 0.1 * hard));
      placeObstacles(s, start, s.genX, reach, hard);
      if (nextRandom(s) < 0.5) addBallLine(s, start + rand(s, 40, length - 240), 4, nextRandom(s) < 0.4);
    } else if (roll < 0.34) {
      const length = rand(s, 280, 480);
      addSegment(s, length, length * rand(s, 0, 0.05));
      placeObstacles(s, start, s.genX, reach, hard);
      maybeLauncher(s, start, s.genX);
      if (nextRandom(s) < 0.5) addBallLine(s, start + 40, 5, false);
    } else if (roll < 0.48) {
      // A big hill: a long climb, a flat top, then a steep drop.
      const up = rand(s, 220, 360);
      addSegment(s, up, -up * rand(s, 0.18, 0.32));
      addBallLine(s, s.genX - up + 40, 4, false);
      addSegment(s, 80, 0);
      const down = rand(s, 320, 520);
      const downStart = s.genX;
      addSegment(s, down, down * rand(s, 0.4, 0.65));
      placeObstacles(s, downStart + 100, s.genX, reach, hard);
    } else if (roll < 0.62) {
      // A wooden kicker ramp, then a big drop onto a downhill landing.
      addSegment(s, runUp(s, 60), 0);
      addSegment(s, 140, -rand(s, 80, 110), 'ramp');
      const lipX = s.genX;
      const lipY = s.genY;
      s.genY += rand(s, 150, 260);
      addSegment(s, 420, 170);
      for (let i = 1; i <= 5; i += 1) s.footballs.push({ id: s.nextId++, x: lipX + i * speed * 4, y: lipY - 46 - i * 9 + i * i * 1.6 });
      s.noObstacleUntil = s.genX;
    } else if (roll < 0.78) {
      // A gap to jump, landing lower. The widest ones (farther down) need the double jump.
      const lead = runUp(s, 120);
      addSegment(s, lead, lead * 0.25);
      const edgeY = s.genY;
      const width = reach * (0.3 + nextRandom(s) * (0.2 + 0.4 * hard));
      const drop = rand(s, 20, 120);
      s.pits.push({ x0: s.genX, x1: s.genX + width, floor: edgeY + drop + 220 });
      for (let i = 1; i <= 3; i += 1) s.footballs.push({ id: s.nextId++, x: s.genX + (width * i) / 4, y: edgeY - 70 });
      s.genX += width;
      s.genY += drop;
      addSegment(s, 300, 50);
      s.noObstacleUntil = s.genX;
    } else if (roll < 0.9) {
      // A wooden trestle bridge between two gaps.
      const lead = runUp(s, 120);
      addSegment(s, lead, lead * 0.25);
      const edgeY = s.genY;
      const first = reach * rand(s, 0.25, 0.42);
      const deckY = edgeY + rand(s, -20, 40);
      s.pits.push({ x0: s.genX, x1: s.genX + first, floor: Math.max(edgeY, deckY) + 260 });
      s.genX += first;
      s.genY = deckY;
      const deck = rand(s, 220, 380);
      addSegment(s, deck, 0, 'bridge');
      addBallLine(s, s.genX - deck + 50, 4, nextRandom(s) < 0.5);
      const second = reach * (0.25 + nextRandom(s) * (0.17 + 0.25 * hard));
      const drop = rand(s, 30, 110);
      s.pits.push({ x0: s.genX, x1: s.genX + second, floor: deckY + drop + 260 });
      s.genX += second;
      s.genY += drop;
      addSegment(s, 300, 50);
      s.noObstacleUntil = s.genX;
    } else {
      // A cliff: the ground just steps down.
      addSegment(s, runUp(s, 160), 10);
      s.genY += rand(s, 120, 260);
      addSegment(s, 360, 90);
      s.noObstacleUntil = s.genX;
    }
  }
  const behind = s.x - 500;
  s.segments = s.segments.filter((g) => g.x1 > behind);
  s.pits = s.pits.filter((p) => p.x1 > behind);
  s.obstacles = s.obstacles.filter((o) => o.x > behind);
  s.footballs = s.footballs.filter((b) => b.x > behind);
}

function throwHotDog(s: ShredState, x: number, y: number, vx: number, vy: number) {
  s.hotdogs.push({ id: s.nextId++, x, y, vx, vy, ground: 0, landed: false, sky: false, fuse: SHRED.fuse, boom: 0 });
}

function shredHotDogs(s: ShredState, score: number) {
  if (score >= SHRED.hotDogsFrom && s.tick >= s.nextHotDog) {
    // Aim for about where the rider will be when it lands, give or take.
    const x = s.x + s.vx * SHRED.hotDogFall + rand(s, -60, 160);
    const g = shredGround(s, x);
    if (g != null) {
      // Starts slow and speeds up, landing SHRED.hotDogFall ticks later.
      const vy = (440 - (SHRED.itemGravity * SHRED.hotDogFall * (SHRED.hotDogFall + 1)) / 2) / SHRED.hotDogFall;
      s.hotdogs.push({ id: s.nextId++, x, y: g - 440, vx: 0, vy, ground: g, landed: false, sky: true, fuse: 0, boom: 0 });
      // More of them the higher the score.
      s.nextHotDog = s.tick + Math.floor(Math.max(35, 120 - (score - SHRED.hotDogsFrom) / 4) + nextRandom(s) * 30);
    }
  }
  const kept: ShredHotDog[] = [];
  for (const d of s.hotdogs) {
    if (!d.landed) {
      d.vy += SHRED.itemGravity;
      d.x += d.vx;
      d.y += d.vy;
      const g = d.sky ? d.ground : shredGround(s, d.x);
      if (g != null && d.y >= g) {
        d.y = g;
        d.ground = g;
        d.landed = true;
        if (d.fuse === 0) d.boom = 1;
      } else if (d.y > s.y + 900) {
        continue;
      }
    } else if (d.fuse > 0) {
      d.fuse -= 1;
      if (d.fuse === 0) d.boom = 1;
    } else {
      d.boom += 1;
    }
    if (d.boom <= SHRED.blastTicks + 6) kept.push(d);
  }
  s.hotdogs = kept;
}

/** Gift launchers fire a football or a hot dog back toward the rider every couple of seconds. */
function shredLaunchers(s: ShredState) {
  for (const o of s.obstacles) {
    if (o.kind !== 'launcher' || o.x - s.x > 650 || o.x < s.x - 40 || s.tick < (o.shot ?? 0)) continue;
    const vx = -rand(s, 0.5, 2.5);
    const vy = -rand(s, 8, 12);
    if (nextRandom(s) < 0.55) s.footballs.push({ id: s.nextId++, x: o.x, y: o.y - o.h, vx, vy });
    else throwHotDog(s, o.x, o.y - o.h, vx, vy);
    o.shot = s.tick + 55 + Math.floor(nextRandom(s) * 25);
  }
  // Footballs in flight come down and settle on the snow.
  for (const b of s.footballs) {
    if (b.vy == null) continue;
    b.vy += SHRED.itemGravity;
    b.x += b.vx ?? 0;
    b.y += b.vy;
    const g = shredGround(s, b.x);
    if (g != null && b.y >= g - 14) {
      b.y = g - 14;
      delete b.vx;
      delete b.vy;
    }
  }
  s.footballs = s.footballs.filter((b) => b.y < s.y + 900);
}

/** Opens a sled's gift: a football, or (once you have a few) sometimes a hot dog thrown ahead on a fuse. */
function openGift(s: ShredState, o: ShredObstacle) {
  o.gift = false;
  if (s.balls < SHRED.giftHotDogsFrom || nextRandom(s) < 0.6) s.balls += 1;
  else throwHotDog(s, o.x, o.y - o.h, s.vx * 1.5, -9);
}

function shredCrash(s: ShredState, hit: ShredHit) {
  s.alive = false;
  s.hitBy = hit;
}

/** One tick. `tap` (a jump) when given. Changes and returns the state. */
/**
 * One tick. `tap` is a new press of Jump; `held` is whether Jump is still down. Letting go early while
 * rising cuts the jump short, so a quick tap is a small hop and a hold goes full height.
 */
export function shredStep(s: ShredState, tap = false, held = true): ShredState {
  if (!s.alive) return s;
  if (tap) s.wantJump = s.tick;
  const score = shredScore(s);
  const base = shredSpeed(shredDistance(s));
  const slope = shredSlope(s, s.x);
  const canJump = s.grounded || (s.tick - s.lastGround <= SHRED.coyote && s.vy >= 0);
  if (s.tick - s.wantJump <= SHRED.jumpBuffer && canJump) {
    s.vy = Math.min(0, slope * s.vx) * 0.5 - SHRED.jump;
    s.grounded = false;
    s.lastGround = -100;
    s.wantJump = -100;
    s.doubleAt = -100;
    s.jumped = true;
    s.jumps += 1;
  } else if (tap && !s.grounded && !s.jumped) {
    // Rode off a ramp or cliff without jumping: the jump still works in the air.
    s.vy = Math.min(s.vy, 0) - SHRED.jump;
    s.jumped = true;
    s.wantJump = -100;
    s.jumps += 1;
  } else if (tap && !s.grounded && s.doubleAt < 0) {
    // A second tap in the air: one more boost before landing.
    s.vy = Math.min(s.vy, 0) - SHRED.doubleJump;
    s.doubleAt = s.tick;
    s.wantJump = -100;
    s.jumps += 1;
  }

  if (!held && !s.grounded && s.vy < -SHRED.jumpCut) s.vy = -SHRED.jumpCut;

  if (s.grounded) {
    // Downhill speeds you up, uphill slows you down, and you drift back toward cruising speed.
    s.vx = clamp(s.vx + slope * 0.25 - (s.vx - base) * 0.03, base * 0.75, base * 1.5);
    const nx = s.x + s.vx;
    const g = shredGround(s, nx);
    if (g == null || g - s.y > s.vx * 0.9 + 6) {
      // Rode off an edge (or a kicker): keep the slope's speed into the air.
      s.vy = slope * s.vx;
      s.grounded = false;
      s.x = nx;
      s.y += s.vy;
    } else {
      s.x = nx;
      s.y = g;
      s.lastGround = s.tick;
    }
  } else {
    s.vx += (base - s.vx) * 0.01;
    s.vy = Math.min(SHRED.maxFall, s.vy + SHRED.gravity);
    s.x += s.vx;
    s.y += s.vy;
    const g = shredGround(s, s.x);
    if (g != null && s.y >= g) {
      if (s.y - g <= Math.max(16, s.vy + 2)) {
        s.y = g;
        s.vy = 0;
        s.grounded = true;
        s.doubleAt = -100;
        s.jumped = false;
        s.lastGround = s.tick;
      } else {
        shredCrash(s, 'cliff');
      }
    }
    for (const p of s.pits) if (s.x >= p.x0 && s.x < p.x1 && s.y > p.floor) shredCrash(s, 'gap');
  }

  // What the rider touches.
  const left = s.x - SHRED.halfWidth;
  const right = s.x + SHRED.halfWidth;
  const top = s.y - SHRED.height;
  for (const o of s.obstacles) {
    if (o.roll > 0 && o.x - s.x < 700) {
      o.x -= o.roll;
      const g = shredGround(s, o.x);
      if (g == null) o.y += 12; else o.y = g;
    } else if (o.roll < 0 && o.x - s.x < 700) {
      // A sled stops at the edge of a gap rather than going over.
      const g = shredGround(s, o.x - o.roll);
      if (g != null) { o.x -= o.roll; o.y = g; }
    }
    // A little forgiving at the edges.
    const touching = right > o.x - o.w / 2 + 4 && left < o.x + o.w / 2 - 4 && s.y > o.y - o.h + 5 && top < o.y;
    if (!touching || o.stomped) continue;
    if (SHRED_SAFE.includes(o.kind)) {
      if (o.gift) openGift(s, o);
      continue;
    }
    if (!s.grounded && s.vy >= 0 && s.y - s.vy <= o.y - o.h + 8) {
      // Landed on top: bounce off for points, with the jump and double jump back.
      o.stomped = true;
      s.y = o.y - o.h;
      s.vy = -SHRED.stompBounce;
      s.jumped = false;
      s.doubleAt = -100;
      s.stomps += 1;
      continue;
    }
    shredCrash(s, o.kind);
  }
  const r = SHRED.ballRadius;
  s.footballs = s.footballs.filter((b) => {
    const got = right > b.x - r && left < b.x + r && s.y > b.y - r && top < b.y + r;
    if (got) s.balls += 1;
    return !got;
  });
  shredHotDogs(s, score);
  shredLaunchers(s);
  for (const d of s.hotdogs) {
    if (d.boom === 0 && d.landed) {
      // Sitting on its fuse: riding into it sets it off right away.
      if (right > d.x - 16 && left < d.x + 16 && s.y > d.y - 12) d.fuse = 0;
    } else if (d.boom === 0 && d.sky) {
      if (right > d.x - 16 && left < d.x + 16 && s.y > d.y - 10 && top < d.y + 4) shredCrash(s, 'hotdog');
    } else if (d.boom > 0 && d.boom <= SHRED.blastTicks) {
      if (right > d.x - SHRED.blastRadius && left < d.x + SHRED.blastRadius && s.y > d.ground - SHRED.blastHeight) shredCrash(s, 'hotdog');
    }
  }

  s.tick += 1;
  shredBuild(s);
  if (s.tick >= SHRED.maxTicks && s.alive) shredCrash(s, 'time');
  return s;
}

export const shredDetail = (s: ShredState) => `${s.balls} football${s.balls === 1 ? '' : 's'}, ${s.stomps} landing${s.stomps === 1 ? '' : 's'} on top, ${shredDistance(s)} m`;

// ---- Field Goal Gauntlet ------------------------------------------------------------------------------

export const FIELD_GOAL = {
  firstDistance: 20,
  step: 5,
  flightTicks: 50,
  /** A meter left alone this long kicks by itself. */
  idleTicks: TICKS_PER_SECOND * 15,
  maxKicks: 20,
};

/** 'doink in' / 'doink out' bounced off an upright or the crossbar; 'shank' came off a kick hit too hard. */
export type KickResult = 'good' | 'doink in' | 'doink out' | 'short' | 'wide left' | 'wide right' | 'shank';

export const kickMade = (result: KickResult) => result === 'good' || result === 'doink in';

export interface FieldGoalKick {
  distance: number;
  wind: number;
  aim: number;
  power: number;
  result: KickResult;
  /** Where it crossed, -1 to 1 across the screen, for drawing. */
  drift: number;
  /** What a doink hit. */
  post?: 'left' | 'right' | 'bar';
}

export interface FieldGoalState {
  r: number;
  tick: number;
  phase: 'aim' | 'power' | 'flight' | 'over';
  phaseStart: number;
  kick: number;
  distance: number;
  /** -1 (pushes left) to 1 (pushes right). */
  wind: number;
  aim: number;
  kicks: FieldGoalKick[];
}

export const fieldGoalDistance = (kick: number) => FIELD_GOAL.firstDistance + FIELD_GOAL.step * kick;
export const aimPeriod = (kick: number) => Math.max(24, 60 - kick * 4);
export const powerPeriod = (kick: number) => Math.max(30, 56 - kick * 2);
/** Power reading 0-1 at a tick of the power phase. */
export const powerAt = (ticks: number, kick: number) => (swing(ticks, powerPeriod(kick)) + 1) / 2;
export const aimAt = (ticks: number, kick: number) => swing(ticks, aimPeriod(kick));
/** Power a kick of this distance needs. */
export const powerNeeded = (distance: number) => distance / 70;
/** How far off the middle (in aim units) still goes through. */
export const fieldGoalTolerance = (distance: number) => 0.5 * (25 / distance);
export const windEffect = (wind: number, distance: number) => wind * 0.5 * (distance / 40);
/** The good power runs from powerNeeded to this much above it; past that the kick is shanked. */
export const powerWindow = (kick: number) => Math.max(0.12, 0.28 - kick * 0.014);
export const powerLimit = (distance: number, kick: number) => Math.min(1, powerNeeded(distance) + powerWindow(kick));
/** How close to an upright (in aim units) the ball clips it. */
export const DOINK_BAND = 0.04;
/** A kick this little under the power needed clips the crossbar. */
export const CROSSBAR_BAND = 0.025;

function gradeKick(aim: number, power: number, wind: number, distance: number, kick: number): Pick<FieldGoalKick, 'result' | 'drift' | 'post'> {
  const need = powerNeeded(distance);
  const tol = fieldGoalTolerance(distance);
  const drift = aim + windEffect(wind, distance);
  if (power > powerLimit(distance, kick)) return { result: 'shank', drift: clamp(drift + 0.7, -1.5, 1.5) };
  const off = Math.abs(drift);
  if (power < need) {
    if (power >= need - CROSSBAR_BAND && off < tol - DOINK_BAND) {
      return { result: power >= need - CROSSBAR_BAND / 2 ? 'doink in' : 'doink out', drift, post: 'bar' };
    }
    return { result: 'short', drift: clamp(drift, -1.5, 1.5) };
  }
  if (off >= tol - DOINK_BAND && off <= tol + DOINK_BAND) {
    return { result: off <= tol ? 'doink in' : 'doink out', drift, post: drift < 0 ? 'left' : 'right' };
  }
  if (off < tol) return { result: 'good', drift };
  return { result: drift < 0 ? 'wide left' : 'wide right', drift: clamp(drift, -1.5, 1.5) };
}

function newKick(s: FieldGoalState) {
  s.distance = fieldGoalDistance(s.kick);
  s.wind = Math.round((nextRandom(s) * 2 - 1) * Math.min(1, 0.25 + s.kick * 0.08) * 100) / 100;
  s.phase = 'aim';
  s.phaseStart = s.tick;
}

export function fieldGoalStart(seed: number): FieldGoalState {
  const s: FieldGoalState = { r: seed | 0, tick: 0, phase: 'aim', phaseStart: 0, kick: 0, distance: 0, wind: 0, aim: 0, kicks: [] };
  newKick(s);
  return s;
}

/** One tick; `tap` locks the aim or the power. Changes and returns the state. */
export function fieldGoalStep(s: FieldGoalState, tap = false): FieldGoalState {
  if (s.phase === 'over') return s;
  const since = s.tick - s.phaseStart;
  if (s.phase === 'aim' && (tap || since >= FIELD_GOAL.idleTicks)) {
    s.aim = aimAt(since, s.kick);
    s.phase = 'power';
    s.phaseStart = s.tick + 1;
  } else if (s.phase === 'power' && (tap || since >= FIELD_GOAL.idleTicks)) {
    const power = powerAt(since, s.kick);
    s.kicks.push({ distance: s.distance, wind: s.wind, aim: s.aim, power, ...gradeKick(s.aim, power, s.wind, s.distance, s.kick) });
    s.phase = 'flight';
    s.phaseStart = s.tick + 1;
  } else if (s.phase === 'flight' && since >= FIELD_GOAL.flightTicks) {
    const last = s.kicks[s.kicks.length - 1];
    if (!kickMade(last.result) || s.kicks.length >= FIELD_GOAL.maxKicks) {
      s.phase = 'over';
    } else {
      s.kick += 1;
      newKick(s);
    }
  }
  s.tick += 1;
  return s;
}

/** Longest make, in yards (0 with none). */
export const fieldGoalScore = (s: FieldGoalState) =>
  s.kicks.filter((k) => kickMade(k.result)).reduce((best, k) => Math.max(best, k.distance), 0);

// ---- Replays (the server's check of a skill run) -------------------------------------------------------

export interface ReplayResult {
  score: number;
  ticks: number;
  detail: string;
}

export const MAX_INPUTS = 5000;

export function validInputs(value: unknown): Input[] | null {
  if (!Array.isArray(value) || value.length > MAX_INPUTS) return null;
  const inputs: Input[] = [];
  let last = -1;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [tick, input] = item;
    if (!Number.isInteger(tick) || !Number.isInteger(input) || tick < last || tick < 0) return null;
    inputs.push([tick, input]);
    last = tick;
  }
  return inputs;
}

/** Replays a skill game from its seed and inputs. Inputs for ticks that already passed are ignored. */
export function replaySkillGame(game: GameKind, seed: number, inputs: Input[]): ReplayResult {
  let i = 0;
  const inputAt = (tick: number) => {
    let value: number | null = null;
    while (i < inputs.length && inputs[i][0] <= tick) {
      if (inputs[i][0] === tick) value = inputs[i][1];
      i += 1;
    }
    return value;
  };
  if (game === 'climb') {
    const s = climbStart(seed);
    while (s.alive) climbStep(s, inputAt(s.tick));
    const score = climbScore(s);
    return { score, ticks: s.tick, detail: `${Math.floor(s.height)} ft, ${s.oips} OIP${s.oips === 1 ? '' : 's'}` };
  }
  if (game === 'shred') {
    const s = shredStart(seed);
    // 1 = Jump pressed, 0 = let go (runs with no 0s hold every jump to full height).
    let held = true;
    while (s.alive) {
      const v = inputAt(s.tick);
      if (v != null) held = v === 1;
      shredStep(s, v === 1, held);
    }
    return { score: shredScore(s), ticks: s.tick, detail: shredDetail(s) };
  }
  if (game === 'fieldgoal') {
    const s = fieldGoalStart(seed);
    while (s.phase !== 'over') fieldGoalStep(s, inputAt(s.tick) != null);
    const made = s.kicks.filter((k) => kickMade(k.result)).length;
    return { score: fieldGoalScore(s), ticks: s.tick, detail: `${made} made` };
  }
  throw new Error(`${game} is not a skill game`);
}

// ---- Turn games ----------------------------------------------------------------------------------------

export const TURNS: Record<'penalty' | 'price' | 'nameplayer', { count: number; seconds: number }> = {
  penalty: { count: 10, seconds: 30 },
  price: { count: 8, seconds: 20 },
  nameplayer: { count: 10, seconds: 12 },
};
/** Extra time allowed for the trip to the server and back. */
export const TURN_GRACE_SECONDS = 3;

export const turnCount = (game: GameKind) => (game in TURNS ? TURNS[game as keyof typeof TURNS].count : 0);
export const turnSeconds = (game: GameKind) => (game in TURNS ? TURNS[game as keyof typeof TURNS].seconds : 0);

const formatNumber = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A row's stat line in words, e.g. "1,456 rush yds, 14 rush TD, 61 rec, 431 rec yds". */
export function statLine(row: TriviaRow): string {
  const [, pos, , , , , passYds, passTd, ints, rushYds, rushTd, rec, recYds, recTd] = row;
  const parts: string[] = [];
  if (pos === 'QB') parts.push(`${formatNumber(passYds)} pass yds`, `${passTd} pass TD`, `${ints} INT`);
  if (pos === 'QB' || pos === 'RB' || rushYds >= 100) parts.push(`${formatNumber(rushYds)} rush yds`, `${rushTd} rush TD`);
  if (pos !== 'QB') parts.push(`${rec} rec`, `${formatNumber(recYds)} rec yds`, `${recTd} rec TD`);
  return parts.join(', ');
}

/** The rows a game draws from: enough games played that the numbers mean something. */
// Row fields used here: 0 name, 1 position, 2 team, 3 season, 4 games, 5 PPR points.
const ALL_ROWS = TRIVIA_ROWS.map((row, index) => ({ row, index }));
const PRICE_ROWS = ALL_ROWS.filter(({ row }) => row[4] >= 8 && row[5] >= 60);
const NAME_ROWS = ALL_ROWS.filter(({ row }) => row[4] >= 6 && row[5] >= 40);
const priceRows = () => PRICE_ROWS;
const nameRows = () => NAME_ROWS;
/** How many different questions each trivia game can ask. */
export const TRIVIA_COUNTS = { price: PRICE_ROWS.length, nameplayer: NAME_ROWS.length };

/** `count` different picks from a list, in a seeded order. */
function pickSome<T>(list: T[], count: number, random: () => number): T[] {
  const copy = list.slice();
  const out: T[] = [];
  while (out.length < count && copy.length) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  return out;
}

export interface PenaltyTurn { kind: 'penalty'; index: number; of: number; seconds: number }
export interface PriceTurn { kind: 'price'; index: number; of: number; seconds: number; name: string; position: string; team: string; games: number; season: number }
export interface NameTurn { kind: 'nameplayer'; index: number; of: number; seconds: number; position: string; team: string; games: number; season: number; clue: string; choices: string[] }
export type Turn = PenaltyTurn | PriceTurn | NameTurn;

/** What the player is shown for turn `index` (never the answer). */
export function turnFor(game: GameKind, seed: number, index: number): Turn {
  const of = turnCount(game);
  const seconds = turnSeconds(game);
  if (game === 'penalty') return { kind: 'penalty', index, of, seconds };
  if (game === 'price') {
    const { row } = pickSome(priceRows(), of, randomFrom(seed, 1))[index];
    return { kind: 'price', index, of, seconds, name: row[0], position: row[1], team: row[2], games: row[4], season: row[3] };
  }
  if (game === 'nameplayer') {
    const { row } = pickSome(nameRows(), of, randomFrom(seed, 1))[index];
    const random = randomFrom(seed, 100 + index);
    // Wrong answers: other players at the same position from around the same years.
    const names = [...new Set(nameRows()
      .filter((r) => r.row[1] === row[1] && r.row[0] !== row[0] && Math.abs(r.row[3] - row[3]) <= 4)
      .map((r) => r.row[0]))];
    const choices = pickSome(names, 3, random);
    choices.splice(Math.floor(random() * 4), 0, row[0]);
    return { kind: 'nameplayer', index, of, seconds, position: row[1], team: row[2], games: row[4], season: row[3], clue: statLine(row), choices };
  }
  throw new Error(`${game} is not a turn game`);
}

export type PenaltyOutcome = 'goal' | 'saved' | 'over the bar' | 'wide';

export interface TurnResult {
  points: number;
  /** One line for the player: "Goal!", "Actual: 284.5 pts", "It was Puka Nacua". */
  message: string;
  late?: boolean;
  /** Penalty Kicks: where the keeper went and what happened, for drawing. */
  keeper?: { column: number; high: boolean };
  outcome?: PenaltyOutcome;
  /** Price Is Right: the real number. Name That Player: the right name. */
  answer?: number | string;
}

/** Penalty Kicks targets: 0 top left, 1 top right, 2 bottom left, 3 bottom right. */
export const penaltyColumn = (zone: number) => zone % 2;
export const penaltyHigh = (zone: number) => zone < 2;

/**
 * Grades one turn. `answer` is the player's input: Penalty Kicks {zone, power}, Price Is Right a number,
 * Name That Player a choice index. `seconds` is how long they took (by the server's clock when official).
 * `history` is the zones of earlier kicks, which the keeper uses to read a player who keeps going one way.
 */
export function gradeTurn(game: GameKind, seed: number, index: number, answer: unknown, seconds: number, history: number[] = []): TurnResult {
  const limit = turnSeconds(game);
  const late = seconds > limit + TURN_GRACE_SECONDS;
  if (game === 'penalty') {
    const { zone, power } = (answer ?? {}) as { zone?: unknown; power?: unknown };
    const z = Number.isInteger(zone) && (zone as number) >= 0 && (zone as number) < 4 ? (zone as number) : 2;
    const p = typeof power === 'number' && Number.isFinite(power) ? clamp(power, 0, 1) : 0;
    const random = randomFrom(seed, 200 + index);
    const lastColumns = history.slice(-2).map(penaltyColumn);
    // He dives left or right at random, but leans toward a side you've gone twice in a row.
    let column = Math.floor(random() * 2);
    if (lastColumns.length === 2 && lastColumns[0] === lastColumns[1] && random() < 0.5) column = lastColumns[0];
    const high = random() < 0.4;
    const keeper = { column, high };
    let outcome: PenaltyOutcome;
    if (late) outcome = 'saved';
    else if (penaltyHigh(z) && p > 0.92) outcome = 'over the bar';
    else if (p > 0.97) outcome = 'wide';
    else if (column === penaltyColumn(z) && (p < 0.35 || high === penaltyHigh(z))) outcome = 'saved';
    else outcome = 'goal';
    const message = late ? 'Too slow, the ref blew the whistle.' : outcome === 'goal' ? 'GOAL!' : outcome === 'saved' ? 'Saved by the dress!' : `Missed, ${outcome}.`;
    return { points: outcome === 'goal' ? 1 : 0, message, late, keeper, outcome };
  }
  if (game === 'price') {
    const { row } = pickSome(priceRows(), turnCount(game), randomFrom(seed, 1))[index];
    const actual = row[5];
    const guess = typeof answer === 'number' && Number.isFinite(answer) ? answer : -1;
    let points = 0;
    if (!late && guess >= 0 && guess <= actual) {
      points = Math.round(100 * Math.max(0, 1 - ((actual - guess) / actual) * 2));
      if (actual - guess <= 2) points += 25;
    }
    const message = late ? `Too slow. Actual: ${actual} pts.`
      : guess > actual ? `Over! Actual: ${actual} pts.`
      : `Actual: ${actual} pts. +${points}`;
    return { points, message, late, answer: actual };
  }
  if (game === 'nameplayer') {
    const turn = turnFor(game, seed, index) as NameTurn;
    const { row } = pickSome(nameRows(), turnCount(game), randomFrom(seed, 1))[index];
    const right = turn.choices.indexOf(row[0]);
    const correct = !late && answer === right;
    const points = correct ? 100 + Math.round(50 * clamp(1 - seconds / limit, 0, 1)) : 0;
    const message = late ? `Too slow. It was ${row[0]}.` : correct ? `Yes, ${row[0]}! +${points}` : `Nope, it was ${row[0]}.`;
    return { points, message, late, answer: row[0] };
  }
  throw new Error(`${game} is not a turn game`);
}

/**
 * Plays turn `index` of a turn game on an attempt (an official lobby try or a ranked practice game) that
 * has a turn on the clock, `seconds` after it was dealt. Returns the grade, or null when that turn was
 * already played. The next turn's clock starts when the player asks for it (servedAt), not while they read
 * this result.
 */
export function applyTurn(game: GameKind, attempt: MiniGameAttempt, index: number, answer: unknown, seconds: number, now: string): TurnResult | null {
  if (index !== attempt.turn || !attempt.servedAt) return null;
  const graded = gradeTurn(game, attempt.seed ?? 0, index, answer, seconds, attempt.history ?? []);
  attempt.points = [...(attempt.points ?? []), graded.points];
  if (game === 'penalty') attempt.history = [...(attempt.history ?? []), Math.trunc(Number((answer as { zone?: unknown } | null)?.zone)) || 0];
  attempt.turn = index + 1;
  attempt.servedAt = null;
  const total = attempt.points.reduce((sum, p) => sum + p, 0);
  attempt.score = total;
  if (attempt.turn >= turnCount(game)) {
    attempt.finishedAt = now;
    attempt.detail = game === 'penalty' ? `${total} of ${turnCount(game)}` : `${attempt.points.filter((p) => p > 0).length} of ${turnCount(game)} scored`;
  }
  return graded;
}
