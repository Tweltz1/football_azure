// Countdown Chaos (New Year's only): a reflex party game. The ball drops toward midnight and everyone taps
// STOP as close to midnight as they dare, without going over. Some rounds hide the clock or run it at a
// strange speed. Each phone times its own tap from when it saw the countdown start, so a slow connection
// doesn't cost anyone. Pure game logic, no React; the TV ticks it.

export const READY_MS = 3800;
export const GRACE_MS = 1600;
export const REVEAL_MS = 7000;
export const SCORES_MS = 5500;
export const ACTIVE_MS = 30000;
export const PERFECT_MS = 60;

// Twists: hideAt (ms after start the digits vanish), speed (how fast the shown clock runs vs real time),
// wobble (the shown clock speeds up and slows down). Real midnight is always when the real time runs out.
export const ROUND_TYPES = {
  classic: { title: 'Countdown!', blurb: 'Stop as close to midnight as you can. Don\'t go over!' },
  dark: { title: 'Lights Out', blurb: 'The clock goes dark halfway down. Keep counting in your head!', hide: 0.5 },
  fast: { title: 'Fast Forward', blurb: 'The clock counts down twice as fast. Quick fingers!', fast: true },
  wobble: { title: 'Wobbly Clock', blurb: 'This clock can\'t keep time. Trust the ball, not the numbers!', wobble: true },
  blind: { title: 'Blackout', blurb: 'You only see the first two seconds. Good luck!', hideMs: 2000 },
  mega: { title: 'The Big One', blurb: 'Double points! The clock goes dark at 4 seconds to go.', hideLeft: 4000, double: true },
};
export const PLAN = ['classic', 'classic', 'dark', 'fast', 'wobble', 'dark', 'blind', 'fast', 'wobble', 'mega'];

const mulberry = (seed) => {
  let r = seed | 0;
  return () => {
    r = (r + 0x6D2B79F5) | 0;
    let t = r;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};
const setPhase = (s, phase, now) => { s.phase = phase; s.phaseAt = now; };

/** How the round's clock looks at real time `ms` after the start (shared by the TV and the phones). */
export function shownClock(round, ms) {
  const type = ROUND_TYPES[round.type];
  const left = Math.max(0, round.dur - ms);
  let hidden = false;
  if (type.hide && ms > round.dur * type.hide) hidden = true;
  if (type.hideMs && ms > type.hideMs) hidden = true;
  if (type.hideLeft && left < type.hideLeft) hidden = true;
  let shown = left;
  // Fast: the shown clock starts at twice the real time and runs twice as fast, reaching 0 together.
  if (type.fast) shown = left * 2;
  // Wobble: drifts ahead and behind the real time, but lands on 0 at midnight.
  if (type.wobble) shown = Math.max(0, left + Math.sin(ms / 900) * 1400 * Math.min(1, left / 3000));
  return { left, shown, hidden };
}

/** Points for stopping `early` ms before midnight (negative means after). */
export function pointsFor(early, double) {
  if (early == null || early < 0) return 0;
  const base = Math.max(0, Math.round(1000 - early / 3)) + (early <= PERFECT_MS ? 500 : 0);
  return double ? base * 2 : base;
}

const startRound = (s, now) => {
  const type = PLAN[s.index];
  s.round = { id: s.index + 1, type, dur: Math.round(7000 + s.rand() * 4500) };
  s.stops = {};
  setPhase(s, 'ready', now);
  emit(s, 'ready', { index: s.index });
};

/** A new game. players: [{ cid, name }]. */
export function createCountdown(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    index: 0,
    round: null,
    stops: {},
    scores: {},
    last: {},
    history: [],
    phase: 'ready',
    phaseAt: now,
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = { perfect: 0, busts: 0, best: null, wins: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

const reveal = (s, now) => {
  const double = Boolean(ROUND_TYPES[s.round.type].double);
  const rows = s.players.map((p) => {
    const ms = s.stops[p.cid];
    const early = ms == null ? null : s.round.dur - ms;
    return { cid: p.cid, early, points: pointsFor(early, double) };
  });
  // The closest without going over wins the round (and a bonus).
  const best = rows.filter((r) => r.early != null && r.early >= 0).sort((a, b) => a.early - b.early)[0];
  rows.forEach((r) => {
    const st = s.stats[r.cid];
    if (best && r.cid === best.cid) { r.points += double ? 400 : 200; r.won = true; if (st) st.wins += 1; }
    s.scores[r.cid] = (s.scores[r.cid] || 0) + r.points;
    if (!st) return;
    if (r.early == null || r.early < 0) st.busts += 1;
    else {
      if (r.early <= PERFECT_MS) st.perfect += 1;
      if (st.best == null || r.early < st.best) st.best = r.early;
    }
  });
  s.last = Object.fromEntries(rows.map((r) => [r.cid, r]));
  s.history.push({ type: s.round.type, rows });
  setPhase(s, 'reveal', now);
  emit(s, 'reveal', { winner: best?.cid || null });
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'ready':
      if (elapsed >= READY_MS) { setPhase(s, 'count', now); emit(s, 'go', { id: s.round.id }); }
      break;
    case 'count': {
      if (elapsed >= s.round.dur && !s.midnight) { s.midnight = true; emit(s, 'midnight'); }
      const allIn = s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS).every((p) => s.stops[p.cid] != null);
      if (elapsed >= s.round.dur + GRACE_MS || (allIn && elapsed >= s.round.dur + 400)) { s.midnight = false; reveal(s, now); }
      break;
    }
    case 'reveal':
      if (elapsed >= REVEAL_MS) {
        if (s.index + 1 >= PLAN.length) { setPhase(s, 'over', now); emit(s, 'over'); } else if ((s.index + 1) % 3 === 0) { setPhase(s, 'scores', now); emit(s, 'scores'); } else { s.index += 1; startRound(s, now); }
      }
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) { s.index += 1; startRound(s, now); }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's STOP. ms: how long after the countdown started (on that phone's own clock) they tapped. */
export function stop(s, cid, roundId, ms, now) {
  if (s.phase !== 'count' || !s.round || roundId !== s.round.id) return false;
  if (!s.players.some((p) => p.cid === cid) || s.stops[cid] != null) return false;
  let t = Number(ms);
  // Trust the phone's own timing, but never more than a beat off what the TV saw.
  const seen = now - s.phaseAt;
  if (!Number.isFinite(t)) t = seen;
  t = Math.max(0, Math.min(seen + 150, Math.max(seen - 2500, t)));
  s.stops[cid] = Math.round(t);
  emit(s, 'stop', { by: cid });
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = { perfect: 0, busts: 0, best: null, wins: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'over';

export const ranking = (s) => {
  const list = s.players.map((p) => ({ cid: p.cid, score: s.scores[p.cid] || 0 })).sort((a, b) => b.score - a.score);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
  return list;
};

/** What one phone needs to show. */
export function phoneView(s, cid) {
  const view = {
    phase: s.phase,
    index: s.index + 1,
    rounds: PLAN.length,
    round: s.round,
    type: s.round.type,
    stopped: s.stops[cid] != null,
    score: s.scores[cid] || 0,
  };
  if (s.phase === 'reveal') view.last = s.last[cid] || null;
  if (s.phase === 'scores' || s.phase === 'reveal') view.rank = ranking(s).find((r) => r.cid === cid)?.rank;
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (score) => {
    let top = null;
    s.players.forEach((p) => {
      const v = score(s.stats[p.cid] || {});
      if (v != null && v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.perfect, 'Right on the Dot', (v) => `${v} perfect stop${v === 1 ? '' : 's'}`);
  add((st) => (st.best != null ? 10000 - st.best : 0), 'Closest Call', (v) => `Stopped ${((10000 - v) / 1000).toFixed(2)}s before midnight`);
  add((st) => st.busts, 'Party Crasher', (v) => `Went past midnight ${v} time${v === 1 ? '' : 's'}`);
  return list;
}
