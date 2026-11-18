// Rainbow Run (St. Patrick's only): push your luck up the rainbow. Each step, everyone secretly picks
// CLIMB or HEAD HOME. Climbers split the gold on the next step; anyone heading home banks what they
// carry (plus any leftover gold they pass on the way down). But the rainbow has hazards: the second
// time the same hazard shows up, the rainbow collapses and every climber drops what they carry.
// Pure game logic, no React; the TV ticks it.

export const RUNS = 4;
export const DECIDE_MS = 14000;
export const REVEAL_MS = 3200;
export const MAX_STEPS = 12;
export const TOP_BONUS = 10;
export const RUN_END_MS = 5500;
export const START_MS = 4000;
export const CLOSE_MS = 900;
export const ACTIVE_MS = 30000;

export const HAZARDS = {
  cat: { name: 'Black Cat', icon: '🐈‍⬛' },
  storm: { name: 'Thunderstorm', icon: '⛈️' },
  snake: { name: 'Snake', icon: '🐍' },
  trap: { name: 'Leprechaun Trap', icon: '🪤' },
};
const COINS = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];
export const POT = 20;

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
const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};
const setPhase = (s, phase, now) => { s.phase = phase; s.phaseAt = now; s.closeAt = null; };
export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);

export const buildDeck = (rand, removed = []) => shuffle(rand, [
  ...COINS.map((v) => ({ kind: 'coins', value: v })),
  ...Object.keys(HAZARDS).flatMap((h) => Array.from({ length: removed.includes(h) ? 2 : 3 }, () => ({ kind: 'hazard', hazard: h }))),
  { kind: 'pot', value: POT },
]);

const startRun = (s, now) => {
  s.deck = buildDeck(s.rand, s.collapsedBy);
  s.steps = [];
  s.seen = {};
  s.climbing = s.players.map((p) => p.cid);
  s.carry = Object.fromEntries(s.players.map((p) => [p.cid, 0]));
  s.choices = {};
  s.went = [];
  s.top = null;
  s.crash = null;
  setPhase(s, 'start', now);
  emit(s, 'run', { run: s.run });
};

/** A new game. players: [{ cid, name }]. */
export function createRainbow(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    run: 0,
    deck: [],
    steps: [],
    seen: {},
    climbing: [],
    carry: {},
    bank: {},
    choices: {},
    went: [],
    crash: null,
    collapsedBy: [],
    history: [],
    phase: 'start',
    phaseAt: now,
    closeAt: null,
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.bank[p.cid] = 0;
    s.stats[p.cid] = { best: 0, dropped: 0, steps: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRun(s, now);
  return s;
}

const decide = (s, now) => {
  s.choices = {};
  s.went = [];
  setPhase(s, 'decide', now);
  emit(s, 'decide', { step: s.steps.length });
};

const endRun = (s, now) => {
  s.history.push({ steps: s.steps.length, crash: s.crash, top: s.top });
  setPhase(s, 'runEnd', now);
  emit(s, 'runEnd', { crash: Boolean(s.crash) });
};

/** Resolves the step: leavers bank and go home, then the next card flips for the climbers. */
const resolve = (s, now) => {
  // Nobody picked: they keep climbing (the brave default).
  const leaving = s.climbing.filter((cid) => s.choices[cid] === 'home');
  s.went = leaving;
  if (leaving.length) {
    // Leftover gold on the steps is split by everyone heading home this turn; any remainder stays put.
    let left = s.steps.reduce((a, st) => a + (st.left || 0), 0);
    const share = Math.floor(left / leaving.length);
    left -= share * leaving.length;
    s.steps.forEach((st) => { st.left = 0; });
    if (s.steps.length) s.steps[s.steps.length - 1].left = left;
    leaving.forEach((cid) => {
      const total = s.carry[cid] + share;
      s.bank[cid] += total;
      if (s.stats[cid]) s.stats[cid].best = Math.max(s.stats[cid].best, total);
      s.carry[cid] = 0;
    });
    s.climbing = s.climbing.filter((cid) => !leaving.includes(cid));
    emit(s, 'home', { who: leaving });
  }
  if (!s.climbing.length) { s.flip = null; setPhase(s, 'reveal', now); s.runOver = true; return; }
  const card = s.deck.shift() || { kind: 'coins', value: 5 };
  const step = { ...card, left: 0, climbers: s.climbing.length };
  s.flip = step;
  s.climbing.forEach((cid) => { if (s.stats[cid]) s.stats[cid].steps += 1; });
  if (card.kind === 'hazard') {
    s.seen[card.hazard] = (s.seen[card.hazard] || 0) + 1;
    if (s.seen[card.hazard] >= 2) {
      s.crash = { hazard: card.hazard, lost: s.climbing.reduce((a, cid) => a + s.carry[cid], 0), who: [...s.climbing] };
      s.climbing.forEach((cid) => { if (s.stats[cid]) s.stats[cid].dropped += s.carry[cid]; s.carry[cid] = 0; });
      s.collapsedBy.push(card.hazard);
      s.climbing = [];
      s.steps.push(step);
      setPhase(s, 'reveal', now);
      s.runOver = true;
      emit(s, 'crash', { hazard: card.hazard });
      return;
    }
    emit(s, 'hazard', { hazard: card.hazard });
  } else {
    const share = Math.floor(card.value / s.climbing.length);
    step.left = card.value - share * s.climbing.length;
    step.share = share;
    s.climbing.forEach((cid) => { s.carry[cid] += share; });
    emit(s, card.kind === 'pot' ? 'pot' : 'coins', { value: card.value });
  }
  s.steps.push(step);
  s.runOver = false;
  // Made it to the end of the rainbow: everyone still climbing banks their gold plus a bonus.
  if (s.steps.length >= MAX_STEPS) {
    s.top = [...s.climbing];
    s.climbing.forEach((cid) => {
      const total = s.carry[cid] + TOP_BONUS;
      s.bank[cid] += total;
      if (s.stats[cid]) s.stats[cid].best = Math.max(s.stats[cid].best, total);
      s.carry[cid] = 0;
    });
    s.climbing = [];
    s.runOver = true;
    emit(s, 'top');
  }
  setPhase(s, 'reveal', now);
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'start':
      if (elapsed >= START_MS) decide(s, now);
      break;
    case 'decide':
      if (elapsed >= DECIDE_MS || (s.closeAt != null && now >= s.closeAt)) resolve(s, now);
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS) { if (s.runOver) endRun(s, now); else decide(s, now); }
      break;
    case 'runEnd':
      if (elapsed >= RUN_END_MS) {
        if (s.run + 1 >= RUNS) { setPhase(s, 'over', now); emit(s, 'over'); } else { s.run += 1; startRun(s, now); }
      }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's pick for this step: 'climb' or 'home'. Can change until the step resolves. */
export function choose(s, cid, pick, now) {
  if (s.phase !== 'decide' || !s.climbing.includes(cid) || !['climb', 'home'].includes(pick)) return false;
  s.choices[cid] = pick;
  emit(s, 'chose', { by: cid });
  const waiting = activePlayers(s, now).some((p) => s.climbing.includes(p.cid) && !s.choices[p.cid]);
  if (waiting) s.closeAt = null; else if (s.closeAt == null) s.closeAt = now + CLOSE_MS;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** Latecomers join at the next rainbow. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.bank[cid] = 0;
  s.carry[cid] = 0;
  s.stats[cid] = { best: 0, dropped: 0, steps: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'over';

export const ranking = (s) => {
  const list = s.players.map((p) => ({ cid: p.cid, score: s.bank[p.cid] || 0 })).sort((a, b) => b.score - a.score);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
  return list;
};

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const view = {
    phase: s.phase,
    run: s.run + 1,
    runs: RUNS,
    step: s.steps.length,
    climbing: s.climbing.includes(cid),
    carry: s.carry[cid] || 0,
    bank: s.bank[cid] || 0,
    pick: s.choices[cid] || null,
    seen: Object.keys(s.seen).filter((h) => s.seen[h] === 1),
    climbers: s.climbing.length,
  };
  if (s.phase === 'decide') view.left = Math.ceil(Math.max(0, DECIDE_MS - (now - s.phaseAt)) / 1000);
  if (s.phase === 'reveal' && s.flip) view.flip = { kind: s.flip.kind, value: s.flip.value, hazard: s.flip.hazard, share: s.flip.share };
  if (s.crash) view.crashed = s.crash.who.includes(cid);
  view.wentHome = s.went.includes(cid);
  if (s.phase === 'runEnd' || s.phase === 'over') view.rank = ranking(s).find((r) => r.cid === cid)?.rank;
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (score) => {
    let top = null;
    s.players.forEach((p) => {
      const v = score(s.stats[p.cid] || { best: 0, dropped: 0, steps: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.best, 'Pot of Gold', (v) => `Banked ${v} gold in one trip`);
  add((st) => st.steps, 'Rainbow Climber', (v) => `Climbed ${v} steps`);
  add((st) => st.dropped, 'Butterfingers', (v) => `Dropped ${v} gold when the rainbow fell`);
  return list;
}
