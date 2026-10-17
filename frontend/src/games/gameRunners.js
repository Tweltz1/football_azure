import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { GAMES, gradeTurn, TICKS_PER_SECOND, turnFor } from './sim.generated';

// How a game talks to whoever keeps score. Practice games score themselves in the browser with a random
// seed. An official lobby try asks the server, which deals the seed or each turn and checks the result.
//
// A runner has:
//   start()                    -> { seed } for a skill game, { turn } for a turn game (or { finished, score })
//   turn(index, answer, secs)  -> { result, finished, score }   (turn games)
//   finish(inputs)             -> { score, detail }              (skill games)

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function practiceRunner(game) {
  const seed = randomSeed();
  const points = [];
  const zones = [];
  let index = 0;
  return {
    official: false,
    async start() {
      return GAMES[game].style === 'skill' ? { seed } : { turn: turnFor(game, seed, index) };
    },
    async next() {
      return { turn: turnFor(game, seed, index) };
    },
    async turn(i, answer, seconds) {
      const result = gradeTurn(game, seed, i, answer, seconds, zones.slice());
      if (game === 'penalty') zones.push(answer?.zone ?? 4);
      points.push(result.points);
      index = i + 1;
      const score = points.reduce((a, b) => a + b, 0);
      return { result, finished: index >= turnFor(game, seed, 0).of, score };
    },
    async finish() {
      return {};
    },
  };
}

export function officialRunner(leagueId, challengeId) {
  const post = async (action, body) => (await axios.post(`${API_BASE_URL}/leagues/${leagueId}/minigame/${action}`, { challengeId, ...body })).data;
  return {
    official: true,
    start: () => post('start'),
    next: () => post('start'),
    turn: (index, answer) => post('turn', { index, answer }),
    finish: (inputs) => post('finish', { inputs }),
  };
}

export const errorText = (error) => {
  const data = error?.response?.data;
  return typeof data === 'string' && data ? data : error?.message || 'Something went wrong.';
};

/**
 * Runs `onTick` on fixed 1/30 s ticks while `running`, and re-renders once per frame. `onTick` returns
 * false to stop. A hidden tab pauses the game instead of fast-forwarding it.
 */
export function useFixedLoop(running, onTick) {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const step = 1000 / TICKS_PER_SECOND;
    let raf = 0;
    let last = performance.now();
    let pending = 0;
    let stopped = false;
    const loop = (now) => {
      pending += Math.min(100, now - last);
      last = now;
      while (pending >= step && !stopped) {
        pending -= step;
        if (tickRef.current() === false) stopped = true;
      }
      setFrame((frame) => frame + 1);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Seconds left on a turn's clock, counting down from `seconds` (already `elapsed` in). */
export function useCountdown(active, seconds, elapsed = 0, key) {
  const [left, setLeft] = useState(seconds - elapsed);
  useEffect(() => {
    setLeft(seconds - elapsed);
    if (!active) return undefined;
    const startedAt = performance.now() - elapsed * 1000;
    const id = setInterval(() => setLeft(seconds - (performance.now() - startedAt) / 1000), 100);
    return () => clearInterval(id);
  }, [active, seconds, elapsed, key]);
  return Math.max(0, left);
}

// Best practice scores, per game, on this device.
const BEST_KEY = 'hoodLeague.gameBests';
export const readBests = () => {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { return {}; }
};
export const saveBest = (game, score) => {
  const bests = readBests();
  if (!(score > (bests[game] ?? -1))) return false;
  bests[game] = score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) { /* private mode */ }
  return true;
};

const CLIMBER_KEY = 'hoodLeague.climber';
export const readClimber = () => {
  try { const v = parseInt(localStorage.getItem(CLIMBER_KEY), 10); return Number.isInteger(v) ? v : 8; } catch (e) { return 8; }
};
export const saveClimber = (index) => {
  try { localStorage.setItem(CLIMBER_KEY, String(index)); } catch (e) { /* private mode */ }
};
