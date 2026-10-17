// Lobby mini-games: five games a league member plays from the draft lobby (one official try) to win
// extra draft dollars, also playable for practice on the Games page. The same code runs on the server
// (to check scores) and in the browser (bundled into frontend/src/games/sim.generated.js).
//
// Two kinds of game:
// - Skill games (Climb Dash, Field Goal Gauntlet) run on fixed 1/30 s ticks from a seed. The browser
//   records each input with its tick and the server replays the run to get the score, so a score can't
//   just be typed in.
// - Turn games (Penalty Kicks, Price Is Right, Name That Player) are dealt one turn at a time by the
//   server from a seed the browser never sees, and timed by the server's clock, so looking up answers
//   or reading the keeper ahead of time doesn't work.
// Everything here uses plain arithmetic (no Math.sin and friends) so every JS engine gets the same result.

import { TRIVIA_ROWS, TRIVIA_SEASON, type TriviaRow } from './triviaData.ts';

export const TICKS_PER_SECOND = 30;

export type GameKind = 'climb' | 'fieldgoal' | 'penalty' | 'price' | 'nameplayer';

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
  fieldgoal: {
    title: 'Field Goal Gauntlet',
    blurb: 'Michael holds. Tap to aim, tap for power, mind the wind. It starts at 20 yards and backs up 5 every make. One miss ends it.',
    style: 'skill',
    unit: 'yds',
  },
  penalty: {
    title: 'Pink Dress Penalty Kicks',
    blurb: 'Ten penalty kicks at Chrome in the pink dress. Pick a corner, time your power, and hope he guesses wrong.',
    style: 'turns',
    unit: 'goals',
  },
  price: {
    title: 'Price Is Right: Fantasy Edition',
    blurb: `Guess each player's ${TRIVIA_SEASON} PPR fantasy points. Closest without going over scores the most. 20 seconds a guess.`,
    style: 'turns',
    unit: 'pts',
  },
  nameplayer: {
    title: 'Name That Player',
    blurb: `A mystery ${TRIVIA_SEASON} stat line and four names. Pick the right one fast; quicker answers score more.`,
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

// ---- Field Goal Gauntlet ------------------------------------------------------------------------------

export const FIELD_GOAL = {
  firstDistance: 20,
  step: 5,
  flightTicks: 50,
  /** A meter left alone this long kicks by itself. */
  idleTicks: TICKS_PER_SECOND * 15,
  maxKicks: 20,
};

export type KickResult = 'good' | 'short' | 'wide left' | 'wide right';

export interface FieldGoalKick {
  distance: number;
  wind: number;
  aim: number;
  power: number;
  result: KickResult;
  /** Where it crossed, -1 to 1 across the screen, for drawing. */
  drift: number;
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
    // Crushing it (top of the meter) hooks it a bit.
    const hook = power > 0.96 ? 0.12 : 0;
    const drift = s.aim + windEffect(s.wind, s.distance) + hook;
    const result: KickResult = power < powerNeeded(s.distance)
      ? 'short'
      : Math.abs(drift) <= fieldGoalTolerance(s.distance) ? 'good' : drift < 0 ? 'wide left' : 'wide right';
    s.kicks.push({ distance: s.distance, wind: s.wind, aim: s.aim, power, result, drift: clamp(drift, -1.5, 1.5) });
    s.phase = 'flight';
    s.phaseStart = s.tick + 1;
  } else if (s.phase === 'flight' && since >= FIELD_GOAL.flightTicks) {
    const last = s.kicks[s.kicks.length - 1];
    if (last.result !== 'good' || s.kicks.length >= FIELD_GOAL.maxKicks) {
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
  s.kicks.filter((k) => k.result === 'good').reduce((best, k) => Math.max(best, k.distance), 0);

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
  if (game === 'fieldgoal') {
    const s = fieldGoalStart(seed);
    while (s.phase !== 'over') fieldGoalStep(s, inputAt(s.tick) != null);
    const made = s.kicks.filter((k) => k.result === 'good').length;
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
  const [, pos, , , , passYds, passTd, ints, rushYds, rushTd, rec, recYds, recTd] = row;
  const parts: string[] = [];
  if (pos === 'QB') parts.push(`${formatNumber(passYds)} pass yds`, `${passTd} pass TD`, `${ints} INT`);
  if (pos === 'QB' || pos === 'RB' || rushYds >= 100) parts.push(`${formatNumber(rushYds)} rush yds`, `${rushTd} rush TD`);
  if (pos !== 'QB') parts.push(`${rec} rec`, `${formatNumber(recYds)} rec yds`, `${recTd} rec TD`);
  return parts.join(', ');
}

/** The rows a game draws from: enough games played that the numbers mean something. */
const priceRows = () => TRIVIA_ROWS.map((row, index) => ({ row, index })).filter(({ row }) => row[3] >= 8 && row[4] >= 60);
const nameRows = () => TRIVIA_ROWS.map((row, index) => ({ row, index })).filter(({ row }) => row[3] >= 6 && row[4] >= 40);

/** `count` different picks from a list, in a seeded order. */
function pickSome<T>(list: T[], count: number, random: () => number): T[] {
  const copy = list.slice();
  const out: T[] = [];
  while (out.length < count && copy.length) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  return out;
}

export interface PenaltyTurn { kind: 'penalty'; index: number; of: number; seconds: number }
export interface PriceTurn { kind: 'price'; index: number; of: number; seconds: number; name: string; position: string; team: string; games: number; season: string }
export interface NameTurn { kind: 'nameplayer'; index: number; of: number; seconds: number; position: string; games: number; season: string; clue: string; choices: string[] }
export type Turn = PenaltyTurn | PriceTurn | NameTurn;

/** What the player is shown for turn `index` (never the answer). */
export function turnFor(game: GameKind, seed: number, index: number): Turn {
  const of = turnCount(game);
  const seconds = turnSeconds(game);
  if (game === 'penalty') return { kind: 'penalty', index, of, seconds };
  if (game === 'price') {
    const { row } = pickSome(priceRows(), of, randomFrom(seed, 1))[index];
    return { kind: 'price', index, of, seconds, name: row[0], position: row[1], team: row[2], games: row[3], season: TRIVIA_SEASON };
  }
  if (game === 'nameplayer') {
    const { row, index: rowIndex } = pickSome(nameRows(), of, randomFrom(seed, 1))[index];
    const random = randomFrom(seed, 100 + index);
    const others = pickSome(nameRows().filter((r) => r.row[1] === row[1] && r.index !== rowIndex), 3, random).map((r) => r.row[0]);
    const choices = others.slice();
    choices.splice(Math.floor(random() * 4), 0, row[0]);
    return { kind: 'nameplayer', index, of, seconds, position: row[1], games: row[3], season: TRIVIA_SEASON, clue: statLine(row), choices };
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

/** Penalty Kicks targets: 0-2 top row left to right, 3-5 bottom row. */
export const penaltyColumn = (zone: number) => zone % 3;
export const penaltyHigh = (zone: number) => zone < 3;

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
    const z = Number.isInteger(zone) && (zone as number) >= 0 && (zone as number) < 6 ? (zone as number) : 4;
    const p = typeof power === 'number' && Number.isFinite(power) ? clamp(power, 0, 1) : 0;
    const random = randomFrom(seed, 200 + index);
    const lastColumns = history.slice(-2).map(penaltyColumn);
    // He guesses at random, but leans toward a side you've gone twice in a row.
    let column = Math.floor(random() * 3);
    if (lastColumns.length === 2 && lastColumns[0] === lastColumns[1] && random() < 0.5) column = lastColumns[0];
    const high = random() < 0.4;
    const keeper = { column, high };
    let outcome: PenaltyOutcome;
    if (late) outcome = 'saved';
    else if (penaltyHigh(z) && p > 0.92) outcome = 'over the bar';
    else if (penaltyColumn(z) !== 1 && p > 0.97) outcome = 'wide';
    else if (column === penaltyColumn(z) && (p < 0.35 || high === penaltyHigh(z))) outcome = 'saved';
    else if (penaltyColumn(z) === 1 && p < 0.35) outcome = 'saved';
    else outcome = 'goal';
    const message = late ? 'Too slow, the ref blew the whistle.' : outcome === 'goal' ? 'GOAL!' : outcome === 'saved' ? 'Saved by the dress!' : `Missed, ${outcome}.`;
    return { points: outcome === 'goal' ? 1 : 0, message, late, keeper, outcome };
  }
  if (game === 'price') {
    const { row } = pickSome(priceRows(), turnCount(game), randomFrom(seed, 1))[index];
    const actual = row[4];
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
