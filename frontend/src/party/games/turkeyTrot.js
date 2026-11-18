// Turkey Trot (Thanksgiving only): a co-op round-up. Runaway turkeys wander the farmyard and run from
// anyone who gets close. Every phone is a joystick that walks one farmer, and the crew herds the turkeys
// up into the pen before the dinner bell. Pure game logic, no React; the TV ticks it every frame.

export const YARD = { x1: 70, x2: 1850, y1: 330, y2: 1000 };
// The pen sits against the back fence. Turkeys only get in through the open front (the bottom edge).
export const PEN = { x1: 780, x2: 1140, y1: 250, y2: 470 };
export const INTRO_MS = 4500;
export const DONE_MS = 6500;
export const ACTIVE_MS = 30000;
export const FARMER_SPEED = 430;
const SCARE_R = 250;
const WANDER = 105;
const FLEE = 330;

export const ROUNDS = [
  { title: 'Before the Parade', turkeys: 6, goal: 4, ms: 75000, speed: 1 },
  { title: 'Pie Is in the Oven', turkeys: 8, goal: 5, ms: 80000, speed: 1.12 },
  { title: 'Dinner Bell!', turkeys: 10, goal: 7, ms: 90000, speed: 1.25, golden: true },
];

export const FARMER_COLORS = ['#ff5a4e', '#ffd23f', '#3ddc97', '#4ea8ff', '#c77dff', '#ff8fd0', '#ff9f1c', '#9bf6ff', '#b8f35a', '#ffffff', '#ff4fa3', '#7ae582'];
export const COLOR_NAMES = ['red', 'yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'sky blue', 'lime', 'white', 'hot pink', 'mint'];

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
const inPen = (x, y) => x > PEN.x1 && x < PEN.x2 && y > PEN.y1 && y < PEN.y2;
const len = (x, y) => Math.sqrt(x * x + y * y) || 1;

// Where a penned turkey stands inside the pen, so they fill it up in neat rows.
export const penSpot = (i) => ({ x: PEN.x1 + 60 + (i % 6) * 48 + (Math.floor(i / 6) % 2) * 22, y: PEN.y1 + 100 + Math.floor(i / 6) * 50 });

const spawnFarmer = (s, p, i, count) => {
  const x = YARD.x1 + 200 + ((i + 0.5) / Math.max(1, count)) * (YARD.x2 - YARD.x1 - 400);
  s.farmers[p.cid] = { x, y: YARD.y2 - 40, dx: 0, dy: 0, facing: 1, color: FARMER_COLORS[i % FARMER_COLORS.length], colorName: COLOR_NAMES[i % COLOR_NAMES.length], walk: 0 };
};

const startRound = (s, now) => {
  const plan = ROUNDS[s.round];
  s.turkeys = [];
  for (let i = 0; i < plan.turkeys; i += 1) {
    const golden = plan.golden && i === plan.turkeys - 1;
    s.turkeys.push({
      id: s.round * 100 + i,
      x: YARD.x1 + 120 + s.rand() * (YARD.x2 - YARD.x1 - 240),
      y: 560 + s.rand() * 300,
      vx: 0,
      vy: 0,
      heading: s.rand() * Math.PI * 2,
      turnAt: now + s.rand() * 1500,
      peck: false,
      golden,
      penned: false,
      scared: false,
      step: s.rand() * 10,
    });
  }
  s.penned = 0;
  s.players.forEach((p, i) => spawnFarmer(s, p, i, s.players.length));
  setPhase(s, 'intro', now);
  emit(s, 'round', { round: s.round });
};

/** A new game. players: [{ cid, name }]. */
export function createTrot(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    round: 0,
    phase: 'intro',
    phaseAt: now,
    lastTick: now,
    farmers: {},
    turkeys: [],
    penned: 0,
    score: 0,
    saved: [],
    fx: [],
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.stats[p.cid] = { herded: 0, golden: 0, steps: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

export const roundMs = (s) => ROUNDS[s.round].ms;
export const timeLeft = (s, now) => (s.phase === 'play' ? Math.max(0, roundMs(s) - (now - s.phaseAt)) : s.phase === 'intro' ? roundMs(s) : 0);

const pen = (s, t, now) => {
  t.penned = true;
  t.slot = s.penned;
  s.penned += 1;
  // The farmer closest to the turkey when it went in gets the credit.
  let best = null;
  Object.entries(s.farmers).forEach(([cid, f]) => {
    const d = len(f.x - t.x, f.y - t.y);
    if (d < 450 && (!best || d < best.d)) best = { cid, d };
  });
  const points = t.golden ? 300 : 100;
  s.score += points;
  if (best && s.stats[best.cid]) {
    s.stats[best.cid].herded += 1;
    if (t.golden) s.stats[best.cid].golden += 1;
  }
  s.fx.push({ kind: 'pen', x: t.x, y: PEN.y2 - 30, at: now, text: `+${points}`, golden: t.golden });
  if (s.fx.length > 30) s.fx.splice(0, s.fx.length - 30);
  emit(s, t.golden ? 'golden' : 'penned', { by: best?.cid || null });
};

const endRound = (s, now) => {
  const plan = ROUNDS[s.round];
  const left = Math.max(0, plan.ms - (now - s.phaseAt));
  const saved = s.penned >= plan.goal;
  if (saved) s.score += 200 + Math.round(left / 100);
  s.saved.push({ penned: s.penned, goal: plan.goal, saved, all: s.penned === plan.turkeys });
  setPhase(s, 'done', now);
  emit(s, saved ? 'saved' : 'missed', { round: s.round });
};

const moveTurkey = (s, t, dt, now, speed) => {
  if (t.penned) {
    // Penned turkeys shuffle about in their spot.
    const home = penSpot(t.slot);
    t.x += (home.x + Math.sin(now / 700 + t.id) * 10 - t.x) * Math.min(1, dt * 3);
    t.y += (home.y - t.y) * Math.min(1, dt * 3);
    t.vx = Math.cos(now / 900 + t.id) * 20;
    t.vy = 0;
    return;
  }
  let near = null;
  Object.values(s.farmers).forEach((f) => {
    const d = len(t.x - f.x, t.y - f.y);
    if (d < SCARE_R && (!near || d < near.d)) near = { f, d };
  });
  let want;
  if (near) {
    // Run away, zigzagging a little so they're not too easy to steer.
    const away = Math.atan2(t.y - near.f.y, t.x - near.f.x) + Math.sin(now / 170 + t.id * 1.7) * 0.55;
    const k = FLEE * speed * (t.golden ? 1.15 : 1) * (0.75 + 0.25 * (1 - near.d / SCARE_R));
    want = { x: Math.cos(away) * k, y: Math.sin(away) * k };
    if (!t.scared) { emit(s, 'gobble', { id: t.id }); t.scaredAt = now; }
    t.scared = true;
    t.peck = false;
  } else {
    t.scared = false;
    if (now >= t.turnAt) {
      t.heading += (s.rand() - 0.5) * 2.4;
      t.peck = s.rand() < 0.3;
      t.turnAt = now + 700 + s.rand() * 1600;
    }
    const k = t.peck ? 0 : WANDER * speed;
    want = { x: Math.cos(t.heading) * k, y: Math.sin(t.heading) * k };
  }
  const grip = Math.min(1, dt * 7);
  t.vx += (want.x - t.vx) * grip;
  t.vy += (want.y - t.vy) * grip;
  const px = t.x;
  const py = t.y;
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  // The pen: straight in through the front counts. Anything else bounces off the fence.
  if (inPen(t.x, t.y)) {
    if (py >= PEN.y2 - 2 && px > PEN.x1 + 8 && px < PEN.x2 - 8) {
      pen(s, t, now);
      return;
    }
    t.x = px;
    t.y = py;
    t.vx *= -0.6;
    t.heading = Math.PI - t.heading;
  }
  // Inside the pen's back corner, the yard fence is the pen's own back.
  const top = t.x > PEN.x1 && t.x < PEN.x2 ? PEN.y1 : YARD.y1;
  if (t.x < YARD.x1 + 30) { t.x = YARD.x1 + 30; t.vx = Math.abs(t.vx) * 0.4; t.heading = 0; }
  if (t.x > YARD.x2 - 30) { t.x = YARD.x2 - 30; t.vx = -Math.abs(t.vx) * 0.4; t.heading = Math.PI; }
  if (t.y < top + 40) { t.y = top + 40; t.vy = Math.abs(t.vy) * 0.4; t.heading = Math.PI / 2; }
  if (t.y > YARD.y2) { t.y = YARD.y2; t.vy = -Math.abs(t.vy) * 0.4; t.heading = -Math.PI / 2; }
  t.step += len(t.vx, t.vy) * dt * 0.06;
};

const moveFarmer = (s, cid, f, dt) => {
  const moving = f.dx || f.dy;
  if (!moving) return;
  const px = f.x;
  const py = f.y;
  f.x = Math.max(YARD.x1 + 20, Math.min(YARD.x2 - 20, f.x + f.dx * FARMER_SPEED * dt));
  f.y = Math.max(YARD.y1 + 60, Math.min(YARD.y2 + 10, f.y + f.dy * FARMER_SPEED * dt));
  if (inPen(f.x, f.y)) { f.x = px; f.y = py; }
  if (f.dx) f.facing = f.dx > 0 ? 1 : -1;
  f.walk += dt * 9;
  if (s.stats[cid]) s.stats[cid].steps += len(f.x - px, f.y - py);
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const dt = Math.min(0.05, Math.max(0, (now - s.lastTick) / 1000));
  s.lastTick = now;
  const elapsed = now - s.phaseAt;
  const plan = ROUNDS[s.round];
  if (s.phase === 'intro') {
    if (elapsed >= INTRO_MS) { setPhase(s, 'play', now); emit(s, 'go'); }
    s.turkeys.forEach((t) => moveTurkey(s, t, dt * 0.5, now, plan.speed));
  } else if (s.phase === 'play') {
    Object.entries(s.farmers).forEach(([cid, f]) => moveFarmer(s, cid, f, dt));
    s.turkeys.forEach((t) => moveTurkey(s, t, dt, now, plan.speed));
    const left = plan.ms - elapsed;
    if (left <= 10000 && !s.warned) { s.warned = true; emit(s, 'hurry'); }
    if (left <= 0 || s.penned >= plan.turkeys) endRound(s, now);
  } else if (s.phase === 'done') {
    s.turkeys.forEach((t) => moveTurkey(s, t, dt, now, plan.speed * 0.5));
    if (elapsed >= DONE_MS) {
      s.warned = false;
      if (s.round + 1 >= ROUNDS.length) {
        setPhase(s, 'over', now);
        emit(s, 'over');
      } else {
        s.round += 1;
        startRound(s, now);
      }
    }
  }
  return s;
}

/** A phone's joystick: dx, dy from -1 to 1 (0, 0 stops). */
export function steer(s, cid, dx, dy) {
  const f = s.farmers[cid];
  if (!f) return false;
  let x = Number(dx) || 0;
  let y = Number(dy) || 0;
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  const l = Math.sqrt(x * x + y * y);
  if (l > 1) { x /= l; y /= l; }
  f.dx = x;
  f.dy = y;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.stats[cid] = { herded: 0, golden: 0, steps: 0 };
  s.lastSeen[cid] = now;
  spawnFarmer(s, { cid }, s.players.length - 1, s.players.length);
}

export const isOver = (s) => s.phase === 'over';

/** What one phone needs to show. Kept to whole seconds so phones only get a new screen once a second. */
export function phoneView(s, cid, now) {
  const f = s.farmers[cid];
  const plan = ROUNDS[s.round];
  return {
    phase: s.phase,
    round: s.round + 1,
    rounds: ROUNDS.length,
    title: plan.title,
    penned: s.penned,
    goal: plan.goal,
    turkeys: plan.turkeys,
    golden: Boolean(plan.golden),
    left: Math.ceil(timeLeft(s, now) / 1000),
    color: f?.color,
    colorName: f?.colorName,
    mine: s.stats[cid]?.herded || 0,
    score: s.score,
    saved: s.phase === 'done' ? s.saved[s.round]?.saved : null,
  };
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (pick) => {
    let top = null;
    s.players.forEach((p) => {
      const v = pick(s.stats[p.cid] || { herded: 0, golden: 0, steps: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.herded, 'Top Wrangler', (v) => `Herded ${v} turkey${v === 1 ? '' : 's'} into the pen`);
  add((st) => st.golden, 'Golden Gobbler', () => 'Caught the golden turkey');
  add((st) => Math.round(st.steps / 100), 'Marathon Farmer', (v) => `Ran ${v.toLocaleString()} yards`);
  return list;
}

export const totalPenned = (s) => s.saved.reduce((a, r) => a + r.penned, 0);
export const dinnersSaved = (s) => s.saved.filter((r) => r.saved).length;
