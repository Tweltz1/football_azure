// Leaderboards for the Games page, for signed-in players. Practice games count when the server dealt them
// (the same checks as an official lobby try: skill runs are replayed from their inputs, turn games are dealt
// and timed here). Crew Fun Run times are replayed from the runner's own inputs; a live room's win goes to
// the fastest finisher once at least two players in that race have reported.

import type { Ctx, Res } from './handlers.ts';
import type { GameStore, ScoreRow } from './ports.ts';
import type { MiniGameAttempt } from './models.ts';
import {
  applyTurn, GAMES, isGameKind, replaySkillGame, TICKS_PER_SECOND, turnFor, validInputs, type GameKind,
} from './miniGames.ts';
import { ITEM_BY_KEY, MAP_BY_KEY, MAX_TICKS, replayRun } from './raceSim.js';

type Body = Record<string, unknown>;

const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const unavailable = (): Res => ({ status: 503, body: 'Leaderboards are not available here.' });

/** How many lines a board shows. */
export const BOARD_SIZE = 20;
/** Race results for a live room are kept under this game, one row per runner, to work out who won. */
const RACE_RUNS = 'racerun';
const RACE_WINNER = 'racewin';
const DID_NOT_FINISH = MAX_TICKS + 1;
const MAX_RACE_INPUTS = 8000;

const secondsSince = (ctx: Ctx, iso: unknown) => (ctx.now().getTime() - Date.parse(String(iso))) / 1000;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The name shown on a board: the profile's display name, or the first part of the sign-in name. */
async function boardName(ctx: Ctx): Promise<string> {
  const profile = await ctx.profiles.find(ctx.userId!);
  const name = profile?.displayName || ctx.displayName || 'Player';
  return name.split('@')[0].trim().slice(0, 24) || 'Player';
}

/** Saves a score if it beats the player's best on that board. Returns the board standing afterwards (null for a zero). */
async function record(ctx: Ctx, games: GameStore, game: string, board: string, score: number, detail: string | null, lowFirst: boolean) {
  if (!lowFirst && score <= 0) return null;
  const best = await games.getScore(game, board, ctx.userId!);
  const better = !best || (lowFirst ? score < best.score : score > best.score);
  if (better) {
    await games.putScore({ game, board, userId: ctx.userId!, name: await boardName(ctx), score, detail, at: ctx.now().toISOString() });
  }
  const mine = better ? score : best!.score;
  return { newBest: better, best: mine, rank: (await games.countBetter(game, board, mine, lowFirst)) + 1 };
}

/** An official lobby try counts for the game's board too. Never fails the try over a leaderboard problem. */
export async function recordLobbyScore(ctx: Ctx, game: GameKind, score: number, detail: string | null) {
  if (!ctx.games || !ctx.userId) return;
  try {
    await record(ctx, ctx.games, game, 'all', score, detail, false);
  } catch (error) {
    ctx.log.warn(`Leaderboard save failed for ${game}.`, error);
  }
}

// ---- Ranked practice for the five mini-games -----------------------------------------------------------

const practiceKind = (game: GameKind) => `practice:${game}`;

function practiceBody(game: GameKind, attempt: MiniGameAttempt, ctx: Ctx) {
  const base = { game, ranked: true, finished: !!attempt.finishedAt, score: attempt.score, points: attempt.points ?? [] };
  if (GAMES[game].style === 'skill') return { ...base, seed: attempt.seed };
  if (attempt.finishedAt) return base;
  return { ...base, turn: turnFor(game, attempt.seed ?? 0, attempt.turn ?? 0), elapsed: Math.max(0, secondsSince(ctx, attempt.servedAt)) };
}

/** Deals a fresh practice game (a new seed, or the first turn). Starting again throws away one in progress. */
async function startPractice(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const game = String(data.game ?? '');
  if (!isGameKind(game)) return bad('Pick one of the games.');
  const now = ctx.now().toISOString();
  const attempt: MiniGameAttempt = { startedAt: now, finishedAt: null, score: null, detail: null, seed: newSeed() };
  if (GAMES[game].style === 'turns') Object.assign(attempt, { turn: 0, servedAt: now, points: [], history: [] });
  await games.setSession(ctx.userId!, practiceKind(game), attempt as unknown as Record<string, unknown>);
  return ok(practiceBody(game, attempt, ctx));
}

/** The next turn of a practice turn game (its clock starts now). */
async function nextPracticeTurn(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const game = String(data.game ?? '');
  if (!isGameKind(game) || GAMES[game].style !== 'turns') return bad('That game is not played in turns.');
  const attempt = (await games.getSession(ctx.userId!, practiceKind(game))) as MiniGameAttempt | null;
  if (!attempt) return bad('Start the game first.');
  if (!attempt.finishedAt && !attempt.servedAt) {
    attempt.servedAt = ctx.now().toISOString();
    await games.setSession(ctx.userId!, practiceKind(game), attempt as unknown as Record<string, unknown>);
  }
  return ok(practiceBody(game, attempt, ctx));
}

async function playPracticeTurn(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const game = String(data.game ?? '');
  if (!isGameKind(game) || GAMES[game].style !== 'turns') return bad('That game is not played in turns.');
  const attempt = (await games.getSession(ctx.userId!, practiceKind(game))) as MiniGameAttempt | null;
  if (!attempt) return bad('Start the game first.');
  if (attempt.finishedAt) return bad('That game is over. Start a new one.');
  const graded = applyTurn(game, attempt, Math.trunc(Number(data.index)), data.answer, secondsSince(ctx, attempt.servedAt), ctx.now().toISOString());
  if (!graded) return { status: 409, body: 'That turn was already played.' };
  await games.setSession(ctx.userId!, practiceKind(game), attempt as unknown as Record<string, unknown>);
  const board = attempt.finishedAt ? await record(ctx, games, game, 'all', attempt.score ?? 0, attempt.detail, false) : null;
  return ok({ result: graded, game, finished: !!attempt.finishedAt, score: attempt.score, points: attempt.points, board });
}

async function finishPractice(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const game = String(data.game ?? '');
  if (!isGameKind(game) || GAMES[game].style !== 'skill') return bad('That game is played in turns.');
  const inputs = validInputs(data.inputs);
  if (!inputs) return bad('That run could not be read.');
  const attempt = (await games.getSession(ctx.userId!, practiceKind(game))) as MiniGameAttempt | null;
  if (!attempt) return bad('Start the game first.');
  if (attempt.finishedAt) return bad('That run was already saved.');
  const replay = replaySkillGame(game, attempt.seed ?? 0, inputs);
  // A real run takes as long as its ticks; one sent sooner was made up, not played.
  if (secondsSince(ctx, attempt.startedAt) < (replay.ticks / TICKS_PER_SECOND) * 0.9 - 3) return bad('That run finished faster than the clock allows.');
  attempt.finishedAt = ctx.now().toISOString();
  attempt.score = replay.score;
  attempt.detail = replay.detail;
  await games.setSession(ctx.userId!, practiceKind(game), attempt as unknown as Record<string, unknown>);
  const board = await record(ctx, games, game, 'all', replay.score, replay.detail, false);
  return ok({ game, finished: true, score: replay.score, detail: replay.detail, board });
}

// ---- Crew Fun Run ---------------------------------------------------------------------------------------

/** A runner's own inputs: [tick, 'j'] jumps, [tick, 'u'] item uses, [tick, 'h', kind, x] hits, [tick, 't', x] puddles. */
function validRaceInputs(value: unknown): unknown[][] | null {
  if (!Array.isArray(value) || value.length > MAX_RACE_INPUTS) return null;
  let last = -1;
  for (const input of value) {
    if (!Array.isArray(input) || !Number.isInteger(input[0]) || input[0] < 0 || input[0] > MAX_TICKS || input[0] < last) return null;
    last = input[0];
    const [, kind, a, b] = input;
    if (kind === 'j' || kind === 'u') { if (input.length !== 2) return null; } else if (kind === 'h') {
      if (input.length !== 4 || !ITEM_BY_KEY[a as string] || typeof b !== 'number' || !Number.isFinite(b)) return null;
    } else if (kind === 't') {
      if (input.length !== 3 || typeof a !== 'number' || !Number.isFinite(a)) return null;
    } else return null;
  }
  return value as unknown[][];
}

/** The race clock starts: remembers its seed, so the finished run is checked against it. */
async function startRace(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const seed = Math.trunc(Number(data.seed));
  if (!Number.isFinite(seed)) return bad('That race could not be read.');
  await games.setSession(ctx.userId!, 'race', { seed, startedAt: ctx.now().toISOString() });
  return ok({ ranked: true });
}

async function finishRace(ctx: Ctx, games: GameStore, data: Body): Promise<Res> {
  const session = await games.getSession(ctx.userId!, 'race');
  const seed = Math.trunc(Number(data.seed));
  if (!session || session.seed !== seed) return bad('Start the race first.');
  const slot = Math.trunc(Number(data.slot));
  const crew = Math.trunc(Number(data.crew));
  if (!(slot >= 0 && slot < 10 && crew >= 0 && crew < 10)) return bad('That race could not be read.');
  const inputs = validRaceInputs(data.inputs);
  if (!inputs) return bad('That race could not be read.');
  const run = replayRun(seed, slot, crew, inputs);
  const ticks = run.finishTick ?? DID_NOT_FINISH;
  if (run.finishTick != null && secondsSince(ctx, session.startedAt) < (run.finishTick / TICKS_PER_SECOND) * 0.9 - 3) {
    return bad('That race finished faster than the clock allows.');
  }
  await games.setSession(ctx.userId!, 'race', null);
  const seconds = run.finishTick != null ? `${(run.finishTick / TICKS_PER_SECOND).toFixed(1)}s` : null;
  const time = run.finishTick != null ? await record(ctx, games, 'race', `time-${run.map}`, run.finishTick, seconds, true) : null;

  // A live room: once two players have reported, the fastest of them has the win.
  const raceId = String(data.raceId ?? '').slice(0, 60);
  let won = false;
  if (raceId && data.live === true) {
    const name = await boardName(ctx);
    await games.putScore({ game: RACE_RUNS, board: raceId, userId: ctx.userId!, name, score: ticks, detail: null, at: ctx.now().toISOString() });
    const runs = await games.topScores(RACE_RUNS, raceId, 2, true);
    const leader = runs[0];
    if (runs.length >= 2 && leader.score < DID_NOT_FINISH) {
      const credited = await games.getScore(RACE_WINNER, raceId, 'winner');
      if (credited?.detail !== leader.userId) {
        if (credited?.detail) await addWin(ctx, games, credited.detail, credited.name, -1);
        await addWin(ctx, games, leader.userId, leader.name, 1);
        await games.putScore({ game: RACE_WINNER, board: raceId, userId: 'winner', name: leader.name, score: leader.score, detail: leader.userId, at: ctx.now().toISOString() });
      }
      won = leader.userId === ctx.userId;
    }
  }
  const wins = await games.getScore('race', 'wins', ctx.userId!);
  return ok({ map: run.map, finishTick: run.finishTick, time, won, wins: wins?.score ?? 0 });
}

async function addWin(ctx: Ctx, games: GameStore, userId: string, name: string, change: number) {
  const row = await games.getScore('race', 'wins', userId);
  const score = Math.max(0, (row?.score ?? 0) + change);
  await games.putScore({ game: 'race', board: 'wins', userId, name: row?.name ?? name, score, detail: null, at: ctx.now().toISOString() });
}

// ---- Reading a board ------------------------------------------------------------------------------------

/** Which boards exist, and which way they sort. */
export function boardOrder(game: string, board: string): boolean | null {
  if (isGameKind(game)) return board === 'all' ? false : null;
  if (game === 'race' && board === 'wins') return false;
  if (game === 'race' && board.startsWith('time-') && MAP_BY_KEY[board.slice(5)]) return true;
  return null;
}

async function getBoard(ctx: Ctx, games: GameStore, query: URLSearchParams): Promise<Res> {
  const game = query.get('game') ?? '';
  const board = query.get('board') ?? 'all';
  const lowFirst = boardOrder(game, board);
  if (lowFirst == null) return bad('There is no such leaderboard.');
  const rows: ScoreRow[] = await games.topScores(game, board, BOARD_SIZE, lowFirst);
  const mine = await games.getScore(game, board, ctx.userId!);
  const rank = mine ? (await games.countBetter(game, board, mine.score, lowFirst)) + 1 : null;
  return ok({
    game,
    board,
    rows: rows.map((r) => ({ name: r.name, score: r.score, detail: r.detail, at: r.at, me: r.userId === ctx.userId })),
    mine: mine ? { score: mine.score, detail: mine.detail, rank } : null,
  });
}

/** Routes under games/: practice/{start,next,turn,finish}, race/{start,finish}, and GET leaderboard. */
export function gamesRoute(ctx: Ctx, method: string, parts: string[], query: URLSearchParams, data: Body): Promise<Res> | null {
  const games = ctx.games;
  const action = parts.slice(1).join('/');
  const routes: Record<string, (g: GameStore) => Promise<Res>> = method === 'GET'
    ? { leaderboard: (g) => getBoard(ctx, g, query) }
    : {
      'practice/start': (g) => startPractice(ctx, g, data),
      'practice/next': (g) => nextPracticeTurn(ctx, g, data),
      'practice/turn': (g) => playPracticeTurn(ctx, g, data),
      'practice/finish': (g) => finishPractice(ctx, g, data),
      'race/start': (g) => startRace(ctx, g, data),
      'race/finish': (g) => finishRace(ctx, g, data),
    };
  const route = routes[action];
  if (!route) return null;
  return games ? route(games) : Promise.resolve(unavailable());
}
