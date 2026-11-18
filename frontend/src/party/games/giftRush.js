// Gift Wrap Rush (Christmas only): a co-op assembly line in Santa's workshop. Toys ride a conveyor belt
// past four stations: BOX, WRAP, BOW and TAG. Each phone works one or more stations. While a present is in
// your station's zone, tap the choice its order card asks for. Perfect presents fly onto the sleigh; a
// wrong pick or a missed step drops it in the coal bin. Pure game logic, no React; the TV ticks it.

export const JOBS = ['box', 'wrap', 'bow', 'tag'];
export const JOB_INFO = {
  box: { label: 'BOX', icon: '📦', verb: 'Box it' },
  wrap: { label: 'WRAP', icon: '🎨', verb: 'Wrap it' },
  bow: { label: 'BOW', icon: '🎀', verb: 'Add a bow' },
  tag: { label: 'TAG', icon: '🏷️', verb: 'Tag it' },
};
export const OPTIONS = {
  box: [{ id: 'cube', name: 'Square' }, { id: 'tall', name: 'Tall' }, { id: 'long', name: 'Long' }, { id: 'round', name: 'Round' }],
  wrap: [{ id: 'red', name: 'Red', hex: '#d33b3b' }, { id: 'green', name: 'Green', hex: '#2f9a55' }, { id: 'blue', name: 'Blue', hex: '#2f6bff' }, { id: 'gold', name: 'Gold', hex: '#f2b632' }],
  bow: [{ id: 'red', name: 'Red', hex: '#e0302e' }, { id: 'white', name: 'White', hex: '#f4f4f8' }, { id: 'pink', name: 'Pink', hex: '#ff7fbf' }, { id: 'purple', name: 'Purple', hex: '#9b5de5' }],
  tag: [{ id: 'mom', name: 'Mom' }, { id: 'dad', name: 'Dad' }, { id: 'nana', name: 'Nana' }, { id: 'baby', name: 'Baby' }],
};
export const TOYS = ['bear', 'train', 'ball', 'robot', 'duck', 'drum'];

// The belt runs left to right. Each station owns one stretch of it; the sleigh waits past the end.
export const BELT = { x0: 110, y: 760, end: 1690 };
export const ZONES = { box: [190, 560], wrap: [560, 930], bow: [930, 1300], tag: [1300, 1670] };
export const INTRO_MS = 4500;
export const DONE_MS = 6500;
export const ACTIVE_MS = 30000;

export const ROUNDS = [
  { title: 'Workshop Warm-up', presents: 12, goal: 7, speed: 72, every: 4600 },
  { title: 'Rush Hour', presents: 16, goal: 10, speed: 88, every: 3700 },
  { title: 'Christmas Eve!', presents: 22, goal: 14, speed: 104, every: 3100 },
];

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
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

const emit = (s, type, data = {}) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 80) s.events.splice(0, s.events.length - 80);
};
const setPhase = (s, phase, now) => { s.phase = phase; s.phaseAt = now; };

export const zoneOf = (x) => JOBS.find((j) => x >= ZONES[j][0] && x < ZONES[j][1]) || null;

/** Which stations each player works this round. Fewer than 4 players means some phones work two. */
export function assignJobs(players, round) {
  const n = players.length;
  const out = {};
  const shift = (k) => JOBS[(k + round) % 4];
  if (n >= 4) players.forEach((p, i) => { out[p.cid] = [shift(i)]; });
  else if (n === 3) players.forEach((p, i) => { out[p.cid] = i === 0 ? [shift(0), shift(3)] : [shift(i)]; });
  else if (n === 2) players.forEach((p, i) => { out[p.cid] = [shift(i), shift(i + 2)].sort((a, b) => JOBS.indexOf(a) - JOBS.indexOf(b)); });
  else players.forEach((p) => { out[p.cid] = [...JOBS]; });
  return out;
}

const startRound = (s, now) => {
  s.presents = [];
  s.spawned = 0;
  s.nextSpawn = now + INTRO_MS;
  s.delivered = 0;
  s.coal = 0;
  s.jobs = assignJobs(s.players, s.round);
  setPhase(s, 'intro', now);
  emit(s, 'round', { round: s.round });
};

/** A new game. players: [{ cid, name }]. */
export function createRush(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    round: 0,
    phase: 'intro',
    phaseAt: now,
    lastTick: now,
    presents: [],
    nextId: 1,
    spawned: 0,
    nextSpawn: now,
    delivered: 0,
    coal: 0,
    score: 0,
    streak: 0,
    jobs: {},
    last: {},
    results: [],
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.stats[p.cid] = { good: 0, oops: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

const spawn = (s, now) => {
  const order = {};
  JOBS.forEach((j) => { order[j] = pick(s.rand, OPTIONS[j]).id; });
  s.presents.push({ id: s.nextId, x: BELT.x0, toy: pick(s.rand, TOYS), order, done: {}, wrong: {}, missed: {}, at: now, fate: null, fateAt: 0 });
  s.nextId += 1;
  s.spawned += 1;
  emit(s, 'spawn');
};

const finish = (s, p, now) => {
  const perfect = JOBS.every((j) => p.done[j] && !p.wrong[j]);
  p.fate = perfect ? 'sleigh' : 'coal';
  p.fateAt = now;
  if (perfect) {
    s.delivered += 1;
    s.streak += 1;
    s.score += 100 + Math.min(5, s.streak - 1) * 20;
  } else {
    s.coal += 1;
    s.streak = 0;
  }
  emit(s, perfect ? 'sleigh' : 'coal', { present: p.id });
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const dt = Math.min(0.05, Math.max(0, (now - s.lastTick) / 1000));
  s.lastTick = now;
  const plan = ROUNDS[s.round];
  const elapsed = now - s.phaseAt;
  if (s.phase === 'intro') {
    if (elapsed >= INTRO_MS) { setPhase(s, 'play', now); emit(s, 'go'); }
    return s;
  }
  if (s.phase === 'play') {
    if (s.spawned < plan.presents && now >= s.nextSpawn) {
      spawn(s, now);
      s.nextSpawn = now + plan.every * (0.85 + s.rand() * 0.3);
    }
    s.presents.forEach((p) => {
      if (p.fate) return;
      const before = zoneOf(p.x);
      p.x += plan.speed * dt;
      const after = zoneOf(p.x);
      // Leaving a zone with that step still not done: missed.
      if (before && before !== after && !p.done[before]) { p.missed[before] = true; emit(s, 'missed', { job: before }); }
      if (p.x >= BELT.end) finish(s, p, now);
    });
    // Presents that already landed are kept a moment for the animation, then cleared.
    s.presents = s.presents.filter((p) => !p.fate || now - p.fateAt < 1600);
    if (s.spawned >= plan.presents && s.presents.every((p) => p.fate)) {
      const saved = s.delivered >= plan.goal;
      if (saved) s.score += 250;
      s.results.push({ delivered: s.delivered, goal: plan.goal, presents: plan.presents, saved });
      setPhase(s, 'done', now);
      emit(s, saved ? 'saved' : 'short', { round: s.round });
    }
    return s;
  }
  if (s.phase === 'done' && elapsed >= DONE_MS) {
    if (s.round + 1 >= ROUNDS.length) {
      setPhase(s, 'over', now);
      emit(s, 'over');
    } else {
      s.round += 1;
      startRound(s, now);
    }
  }
  return s;
}

/** The present a station would work on now: the one furthest along in that zone still needing the step. */
export const targetFor = (s, job) => s.presents
  .filter((p) => !p.fate && zoneOf(p.x) === job && !p.done[job])
  .sort((a, b) => b.x - a.x)[0] || null;

/** A phone's tap: job is one of its stations, choice one of that station's options. */
export function work(s, cid, job, choice, now) {
  if (s.phase !== 'play' || !(s.jobs[cid] || []).includes(job)) return false;
  if (!OPTIONS[job] || !OPTIONS[job].some((o) => o.id === choice)) return false;
  const p = targetFor(s, job);
  if (!p) return false;
  p.done[job] = choice;
  p.by = p.by || {};
  p.by[job] = cid;
  const right = choice === p.order[job];
  if (!right) p.wrong[job] = true;
  if (s.stats[cid]) s.stats[cid][right ? 'good' : 'oops'] += 1;
  s.last[cid] = { ok: right, n: (s.last[cid]?.n || 0) + 1 };
  emit(s, right ? 'good' : 'oops', { job, by: cid, present: p.id, at: now });
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.stats[cid] = { good: 0, oops: 0 };
  s.lastSeen[cid] = now;
  // A latecomer helps out at the busiest-looking station until the next round.
  const counts = JOBS.map((j) => Object.values(s.jobs).filter((list) => list.includes(j)).length);
  s.jobs[cid] = [JOBS[counts.indexOf(Math.min(...counts))]];
}

export const isOver = (s) => s.phase === 'over';

/** What one phone needs to show. */
export function phoneView(s, cid) {
  const plan = ROUNDS[s.round];
  const jobs = s.jobs[cid] || [];
  return {
    phase: s.phase,
    round: s.round + 1,
    rounds: ROUNDS.length,
    title: plan.title,
    goal: plan.goal,
    presents: plan.presents,
    delivered: s.delivered,
    coal: s.coal,
    jobs,
    // Lights up the buttons when a present is waiting in your zone (but never says which choice).
    waiting: s.phase === 'play' ? jobs.filter((j) => targetFor(s, j)) : [],
    score: s.score,
    last: s.last[cid] || null,
    saved: s.phase === 'done' ? s.results[s.round]?.saved : null,
  };
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (score) => {
    let top = null;
    s.players.forEach((p) => {
      const v = score(s.stats[p.cid] || { good: 0, oops: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.good, 'Head Elf', (v) => `${v} perfect step${v === 1 ? '' : 's'} on the line`);
  add((st) => (st.good >= 5 && st.oops === 0 ? st.good : 0), 'Nice List', () => 'Never made a single mistake');
  add((st) => st.oops, 'Naughty List', (v) => `${v} oops${v === 1 ? '' : 'es'} sent to the coal bin`);
  return list;
}

export const totalDelivered = (s) => s.results.reduce((a, r) => a + r.delivered, 0);
export const roundsSaved = (s) => s.results.filter((r) => r.saved).length;
