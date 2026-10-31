// Last Candle: a cooperative Halloween game for 1 to 12 players. Runs on the TV (the host); phones only
// send taps. Monsters walk up the lanes toward the house. Each one needs a set of charms to banish it,
// shown over its head on the TV. Every phone holds three different charms, so the crew has to shout
// out who has what. Throwing a charm nobody needs spooks you for a moment.
//
// Night 1: Trick or Treat. Night 2: Fog Night (some monsters hide what they need; one player's phone
// sees it and has to call it out). Night 3: Midnight, with the Pumpkin King, who also needs every
// player to tap their Soul charm within a few seconds of each other.
//
// Pure and deterministic given the seed and the calls, so it is testable in Node.

export const CHARMS = [
  { id: 'garlic', name: 'Garlic', icon: '🧄', color: '#f1ead2' },
  { id: 'salt', name: 'Salt', icon: '🧂', color: '#9ed3ff' },
  { id: 'bell', name: 'Bell', icon: '🔔', color: '#f5c542' },
  { id: 'candy', name: 'Candy', icon: '🍬', color: '#ff8bd0' },
  { id: 'crystal', name: 'Crystal', icon: '🔮', color: '#b48cff' },
  { id: 'bone', name: 'Bone', icon: '🦴', color: '#e9e3d0' },
  { id: 'herb', name: 'Herb', icon: '🌿', color: '#6fdc8c' },
  { id: 'star', name: 'Star', icon: '⭐', color: '#ffd84a' },
];
export const CHARM = Object.fromEntries(CHARMS.map((c) => [c.id, c]));

export const NIGHTS = [
  { n: 1, title: 'Trick or Treat', blurb: 'Monsters are coming up the paths. Shout out what they need and throw the right charms!', length: 100000, charms: 5, fog: 0 },
  { n: 2, title: 'Fog Night', blurb: 'Foggy monsters hide what they need. One of you sees it on your phone. Call it out!', length: 110000, charms: 6, fog: 0.4 },
  { n: 3, title: 'Midnight', blurb: 'The Pumpkin King is coming. When he shows up, everyone hit SOUL at the same time!', length: 0, charms: 8, fog: 0.25 },
];

export const MONSTER_KINDS = ['ghost', 'bat', 'skeleton', 'zombie', 'spider', 'witch'];
export const MONSTER_NAMES = { ghost: 'Ghost', bat: 'Bat', skeleton: 'Skeleton', zombie: 'Zombie', spider: 'Spider', witch: 'Witch', king: 'Pumpkin King' };
export const LANES = 4;
export const HAND = 3;
export const REFILL_MS = 1200;
export const SPOOK_MS = 2500;
export const SOUL_WINDOW_MS = 4000;
export const BREAK_MS = 12000;
export const INTRO_MS = 9000;
export const ACTIVE_MS = 30000;
const TAGS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// mulberry32
const nextRand = (state) => {
  state.r = (state.r + 0x6D2B79F5) | 0;
  let t = state.r;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (s, list) => list[Math.floor(nextRand(s) * list.length)];

export const maxCandlesFor = (count) => 5 + Math.floor(count / 4);

/** A new game. players: [{ cid, name }]. */
export function createGame(players, seed = Date.now(), now = 0) {
  const s = {
    r: seed | 0,
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    phase: 'intro',
    night: 1,
    phaseAt: now,
    candles: maxCandlesFor(players.length),
    maxCandles: maxCandlesFor(players.length),
    monsters: [],
    nextId: 1,
    nextTag: 0,
    nextSpawnAt: now + INTRO_MS + 1500,
    bossAt: null,
    hands: {},
    refillAt: {},
    spookedUntil: {},
    lastSeen: {},
    stats: {},
    score: 0,
    soul: null,
    seerTurn: 0,
    events: [],
    eventId: 0,
    endedAt: null,
  };
  s.players.forEach((p) => {
    s.hands[p.cid] = [];
    s.refillAt[p.cid] = [0, 0, 0];
    s.lastSeen[p.cid] = now;
    s.stats[p.cid] = { landed: 0, banished: 0, fizzles: 0, seer: 0, souls: 0 };
  });
  dealAll(s);
  return s;
}

const nightOf = (s) => NIGHTS[s.night - 1];
const pool = (s) => CHARMS.slice(0, nightOf(s).charms).map((c) => c.id);
const emit = (s, type, data) => {
  s.eventId += 1;
  s.events.push({ id: s.eventId, type, ...data });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
};

/** Charms some monster on the board still needs. */
const needed = (s) => s.monsters.flatMap((m) => m.need);

const drawCharm = (s, hand) => {
  const want = needed(s).filter((c) => !hand.includes(c));
  if (want.length && nextRand(s) < 0.6) return pick(s, want);
  const options = pool(s).filter((c) => !hand.includes(c));
  return pick(s, options.length ? options : pool(s));
};

const dealAll = (s) => {
  const ids = pool(s);
  s.players.forEach((p, i) => {
    // Spread the pool around the table so the crew holds every charm between them.
    const hand = [];
    for (let k = 0; k < HAND; k += 1) {
      const c = ids[(i * HAND + k + Math.floor(nextRand(s) * 2)) % ids.length];
      hand.push(hand.includes(c) ? drawCharm(s, hand) : c);
    }
    s.hands[p.cid] = hand;
    s.refillAt[p.cid] = [0, 0, 0];
  });
};

const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -Infinity) <= ACTIVE_MS);

const recipeLength = (s, kind) => {
  const n = s.players.length;
  if (kind === 'bat') return 2;
  const base = s.night === 1 ? 2 : 2 + Math.floor(nextRand(s) * 2);
  const extra = s.night === 3 && nextRand(s) < 0.35 ? 1 : 0;
  const crowd = n >= 9 ? 1 + (nextRand(s) < 0.5 ? 1 : 0) : n >= 4 ? (nextRand(s) < 0.6 ? 1 : 0) : 0;
  return Math.min(6, base + extra + crowd);
};

const spawn = (s, now, boss = false) => {
  const kind = boss ? 'king' : pick(s, s.night === 1 ? MONSTER_KINDS.slice(0, 4) : MONSTER_KINDS);
  const ids = pool(s);
  const length = boss ? Math.min(14, s.players.length + 4) : recipeLength(s, kind);
  const recipe = [];
  for (let k = 0; k < length; k += 1) recipe.push(pick(s, ids));
  recipe.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
  const busy = new Set(s.monsters.filter((m) => m.x < 0.25).map((m) => m.lane));
  const lanes = [...Array(LANES).keys()].filter((l) => !busy.has(l));
  const lane = boss ? 1.5 : pick(s, lanes.length ? lanes : [...Array(LANES).keys()]);
  const baseSeconds = [24, 21, 19][s.night - 1] - Math.min(4, s.players.length * 0.25);
  const seconds = boss ? 75 + s.players.length * 2 : kind === 'bat' ? baseSeconds * 0.6 : kind === 'zombie' ? baseSeconds * 1.25 : baseSeconds;
  const players = activePlayers(s, now);
  const fog = !boss && s.players.length > 1 && nextRand(s) < nightOf(s).fog;
  let seer = null;
  if (fog && players.length) {
    seer = players[s.seerTurn % players.length].cid;
    s.seerTurn += 1;
  }
  const m = {
    id: s.nextId,
    tag: boss ? '👑' : TAGS[s.nextTag % TAGS.length],
    kind,
    lane,
    x: 0,
    speed: 1 / (seconds * 1000),
    recipe,
    need: [...recipe],
    fog,
    seer,
    boss,
    bornAt: now,
    hitAt: 0,
  };
  s.nextId += 1;
  if (!boss) s.nextTag += 1;
  s.monsters.push(m);
  emit(s, boss ? 'boss' : 'spawn', { monster: m.id });
};

const spawnGap = (s) => {
  const n = s.players.length;
  const base = (14 / (n + 1.3)) * [1, 0.85, 0.75][s.night - 1];
  return (s.night === 3 && s.monsters.some((m) => m.boss) ? base * 1.6 : base) * 1000;
};
const maxAlive = (s) => Math.min(12, 2 + Math.ceil(s.players.length * 0.75) + (s.night - 1));

const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
  s.lastTick = now;
};

const startNight = (s, night, now) => {
  s.night = night;
  s.monsters = [];
  s.soul = null;
  s.nextSpawnAt = now + INTRO_MS + 1200;
  s.bossAt = night === 3 ? now + INTRO_MS + 14000 : null;
  dealAll(s);
  Object.keys(s.spookedUntil).forEach((cid) => { s.spookedUntil[cid] = 0; });
  setPhase(s, 'intro', now);
  emit(s, 'night', { night });
};

/** Jumps straight to a night (for trying out later nights with ?night=3 on the TV page). */
export function skipToNight(s, night, now) {
  if (night >= 2 && night <= NIGHTS.length) startNight(s, night, now);
}

/** Advances the game to `now` (ms). Call it many times a second. */
export function tick(s, now) {
  if (s.phase === 'won' || s.phase === 'lost') return s;
  if (s.phase === 'intro') {
    if (now - s.phaseAt >= INTRO_MS) setPhase(s, 'night', now);
    return s;
  }
  if (s.phase === 'break') {
    if (now - s.phaseAt >= BREAK_MS) startNight(s, s.night + 1, now);
    return s;
  }
  const night = nightOf(s);
  const elapsed = now - s.phaseAt;
  const dt = Math.max(0, Math.min(250, now - (s.lastTick ?? now)));
  s.lastTick = now;

  // Refill empty hand slots
  s.players.forEach((p) => {
    const hand = s.hands[p.cid];
    for (let k = 0; k < HAND; k += 1) {
      if (hand[k] == null && now >= s.refillAt[p.cid][k]) hand[k] = drawCharm(s, hand);
    }
  });

  // Move monsters
  for (const m of [...s.monsters]) {
    const slowed = now - m.hitAt < 600 ? 0.25 : 1;
    m.x += m.speed * dt * slowed;
    if (m.x >= 1) {
      s.monsters = s.monsters.filter((o) => o !== m);
      if (m.boss) {
        s.candles = 0;
      } else {
        s.candles = Math.max(0, s.candles - 1);
      }
      emit(s, 'candle', { monster: m.id, kind: m.kind, lane: m.lane, boss: m.boss });
      if (s.candles <= 0) {
        setPhase(s, 'lost', now);
        s.endedAt = now;
        emit(s, 'lost', {});
        return s;
      }
    }
  }

  // Soul window
  if (s.soul && now - s.soul.startedAt > SOUL_WINDOW_MS && !s.soul.done) {
    s.soul = null;
    emit(s, 'soulFail', {});
  }

  // Spawning
  const timeUp = night.length && elapsed >= night.length;
  if (!timeUp && now >= s.nextSpawnAt) {
    if (s.monsters.filter((m) => !m.boss).length < maxAlive(s)) spawn(s, now);
    s.nextSpawnAt = now + spawnGap(s);
  }
  if (s.bossAt != null && now >= s.bossAt) {
    s.bossAt = null;
    spawn(s, now, true);
  }

  if (timeUp) {
    // Dawn: whatever is left fades away.
    if (s.monsters.length) emit(s, 'dawn', { count: s.monsters.length });
    s.monsters = [];
    s.score += s.candles * 25;
    setPhase(s, 'break', now);
    emit(s, 'survived', { night: s.night });
  }
  return s;
}

const banish = (s, m, cid, now) => {
  s.monsters = s.monsters.filter((o) => o !== m);
  s.score += m.boss ? 500 : m.recipe.length * 10 + (m.fog ? 15 : 0);
  if (s.stats[cid]) s.stats[cid].banished += 1;
  if (m.fog && m.seer && s.stats[m.seer]) s.stats[m.seer].seer += 1;
  emit(s, 'banish', { monster: m.id, kind: m.kind, lane: m.lane, x: m.x, by: cid, boss: m.boss });
  if (m.boss) {
    s.monsters.forEach((o) => emit(s, 'banish', { monster: o.id, kind: o.kind, lane: o.lane, x: o.x, by: null }));
    s.monsters = [];
    s.score += s.candles * 50;
    setPhase(s, 'won', now);
    s.endedAt = now;
    emit(s, 'won', {});
  }
};

/** A phone tapped a charm in hand slot `slot`. Returns 'hit', 'banish', 'fizzle' or null. */
export function play(s, cid, slot, now) {
  s.lastSeen[cid] = now;
  if (s.phase !== 'night') return null;
  const hand = s.hands[cid];
  if (!hand || hand[slot] == null) return null;
  if ((s.spookedUntil[cid] || 0) > now) return null;
  const charm = hand[slot];
  hand[slot] = null;
  s.refillAt[cid][slot] = now + REFILL_MS;
  // The monster closest to the house that still needs it
  const target = s.monsters.filter((m) => m.need.includes(charm)).sort((a, b) => b.x - a.x)[0];
  if (!target) {
    s.spookedUntil[cid] = now + SPOOK_MS;
    s.stats[cid].fizzles += 1;
    emit(s, 'fizzle', { by: cid, charm });
    return 'fizzle';
  }
  target.need.splice(target.need.indexOf(charm), 1);
  target.hitAt = now;
  s.stats[cid].landed += 1;
  emit(s, 'throw', { by: cid, charm, monster: target.id });
  if (!target.need.length && (!target.boss || s.soul?.done)) {
    banish(s, target, cid, now);
    return 'banish';
  }
  return 'hit';
}

/** A phone tapped SOUL (only while the Pumpkin King is out). */
export function soul(s, cid, now) {
  s.lastSeen[cid] = now;
  const king = s.monsters.find((m) => m.boss);
  if (s.phase !== 'night' || !king) return null;
  if (s.soul?.done) return null;
  if (!s.soul) {
    s.soul = { startedAt: now, by: [], done: false };
    emit(s, 'soulStart', { by: cid });
  }
  if (!s.soul.by.includes(cid)) {
    s.soul.by.push(cid);
    s.stats[cid].souls += 1;
  }
  const needs = activePlayers(s, now).map((p) => p.cid);
  if (needs.every((c) => s.soul.by.includes(c))) {
    s.soul.done = true;
    emit(s, 'soulDone', {});
    if (!king.need.length) banish(s, king, cid, now);
  }
  return s.soul.done ? 'done' : 'waiting';
}

/** Any sign of life from a phone. */
export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** Adds a late player (between nights or mid-game) with a fresh hand. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.hands[cid] = [];
  s.refillAt[cid] = [0, 0, 0];
  for (let k = 0; k < HAND; k += 1) s.hands[cid].push(drawCharm(s, s.hands[cid]));
  s.lastSeen[cid] = now;
  s.stats[cid] = { landed: 0, banished: 0, fizzles: 0, seer: 0, souls: 0 };
}

/** What one phone needs to show. Small and JSON-friendly. */
export function phoneView(s, cid, now) {
  const hand = s.hands[cid] || [];
  const king = s.monsters.find((m) => m.boss);
  return {
    phase: s.phase,
    night: s.night,
    hand: hand.map((c) => c || null),
    spooked: Math.max(0, (s.spookedUntil[cid] || 0) - now) > 0,
    secrets: s.monsters.filter((m) => m.fog && m.seer === cid).map((m) => ({ tag: m.tag, kind: m.kind, need: m.need })),
    soul: king && !s.soul?.done ? { pressed: Boolean(s.soul?.by.includes(cid)), count: s.soul?.by.length || 0, total: activePlayers(s, now).length } : null,
    candles: s.candles,
    maxCandles: s.maxCandles,
    score: s.score,
  };
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (key) => {
    let top = null;
    s.players.forEach((p) => {
      const v = s.stats[p.cid]?.[key] || 0;
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (key, title, blurb) => { const b = best(key); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add('banished', 'Monster Masher', (v) => `Landed the final charm on ${v} monster${v === 1 ? '' : 's'}`);
  add('landed', 'Charm Slinger', (v) => `${v} charms thrown on target`);
  add('seer', 'Fog Whisperer', (v) => `Called out ${v} foggy monster${v === 1 ? '' : 's'}`);
  add('fizzles', 'Butterfingers', (v) => `Threw ${v} charm${v === 1 ? '' : 's'} at nothing`);
  return list;
}
