// Egg Hunt (Easter only): the Easter Bunny hops around the garden on the TV and hides one egg for each
// player (in their own color) plus a golden egg. Watch closely! Then race to tap the right hiding spot on
// your phone. Wrong spots freeze you for a moment. Pure game logic, no React; the TV ticks it.

export const ROUNDS = 6;
export const START_MS = 2600;
export const HUNT_MS = 22000;
export const REVEAL_MS = 7000;
export const LAST_CHANCE_MS = 2500;
export const LOCK_MS = 1400;
export const ACTIVE_MS = 30000;
export const GOLDEN = 150;
export const COLS = 5;
export const ROWS = 4;

/** The hiding spots, back row first, left to right. The phone shows the same grid. */
export const SPOTS = [
  { icon: '🌲', name: 'Pine' }, { icon: '🛖', name: 'Shed' }, { icon: '⛲', name: 'Fountain' }, { icon: '🌳', name: 'Tree' }, { icon: '🐦', name: 'Birdie' },
  { icon: '🌻', name: 'Sunflower' }, { icon: '🪵', name: 'Log' }, { icon: '🦆', name: 'Duck' }, { icon: '🍯', name: 'Honey' }, { icon: '🌹', name: 'Rose' },
  { icon: '🪴', name: 'Plant' }, { icon: '🐸', name: 'Frog' }, { icon: '🥬', name: 'Cabbage' }, { icon: '🪨', name: 'Rock' }, { icon: '🧺', name: 'Basket' },
  { icon: '🍄', name: 'Mushroom' }, { icon: '🥕', name: 'Carrots' }, { icon: '🪣', name: 'Bucket' }, { icon: '🐌', name: 'Snail' }, { icon: '🌷', name: 'Tulips' },
];

export const COLORS = [
  { name: 'Pink', fill: '#ff6fae' }, { name: 'Blue', fill: '#4fc3f7' }, { name: 'Green', fill: '#3ddc84' }, { name: 'Black', fill: '#3a3352' },
  { name: 'Purple', fill: '#b388ff' }, { name: 'Orange', fill: '#ff9f43' }, { name: 'Red', fill: '#ff4d4d' }, { name: 'Teal', fill: '#14b8a6' },
  { name: 'Navy', fill: '#3b5bdb' }, { name: 'Lime', fill: '#b5e61d' }, { name: 'White', fill: '#f4f1ea' }, { name: 'Brown', fill: '#a8673a' },
];

// Each round the bunny hops faster and fakes more stops (decoys: a pause with no egg).
const HOP_MS = [1300, 1150, 1000, 900, 800, 720];
const DECOYS = [0, 1, 2, 3, 4, 5];

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
export const hopMs = (s) => HOP_MS[Math.min(s.round, HOP_MS.length - 1)];
/** How long the bunny takes to hide everything this round. */
export const hideMs = (s) => s.hops.length * hopMs(s) + 900;

/** Spreads the eggs out (different spots) and mixes the decoy stops in. */
export function planHops(rand, eggs, decoys) {
  const spots = shuffle(rand, SPOTS.map((_, i) => i));
  const hops = eggs.map((egg, i) => ({ spot: spots[i], egg }));
  for (let d = 0; d < decoys; d += 1) hops.push({ spot: spots[(eggs.length + d) % spots.length], egg: null });
  // Hop roughly back to front so the bunny path reads well, but keep a little chaos.
  return shuffle(rand, hops).map((h) => ({ h, key: Math.floor(h.spot / COLS) + rand() * 1.6 })).sort((a, b) => a.key - b.key).map((x) => x.h);
}

const startRound = (s, now) => {
  s.colors = {};
  s.players.forEach((p, i) => { s.colors[p.cid] = i % COLORS.length; });
  const eggs = [...s.players.map((p) => p.cid), 'golden'];
  s.hops = planHops(s.rand, eggs, DECOYS[Math.min(s.round, DECOYS.length - 1)]);
  s.eggs = {};
  s.hops.forEach((h) => { if (h.egg) s.eggs[h.spot] = h.egg; });
  s.found = {};
  s.golden = null;
  s.misses = {};
  s.lock = {};
  s.last = {};
  s.gains = {};
  setPhase(s, 'start', now);
  emit(s, 'round', { round: s.round });
};

/** A new game. players: [{ cid, name }]. */
export function createEggHunt(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    round: 0,
    colors: {},
    hops: [],
    hopSeen: -1,
    eggs: {},
    found: {},
    golden: null,
    misses: {},
    lock: {},
    last: {},
    gains: {},
    scores: {},
    phase: 'start',
    phaseAt: now,
    closeAt: null,
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = { firstTry: 0, golden: 0, fastest: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

const spotOfEgg = (s, egg) => Number(Object.keys(s.eggs).find((k) => s.eggs[k] === egg));

const checkDone = (s, now) => {
  const hunting = activePlayers(s, now).filter((p) => s.colors[p.cid] != null);
  if (hunting.every((p) => s.found[p.cid])) {
    const at = now + (s.golden ? 600 : LAST_CHANCE_MS);
    if (s.closeAt == null || at < s.closeAt) s.closeAt = at;
  }
};

/** A phone taps a hiding spot. */
export function tap(s, cid, spot, now) {
  if (s.phase !== 'hunt' || s.colors[cid] == null || !(spot >= 0 && spot < SPOTS.length)) return false;
  if ((s.lock[cid] || 0) > now) return false;
  const mine = s.misses[cid] || (s.misses[cid] = []);
  if (mine.includes(spot)) return false;
  const egg = s.eggs[spot];
  const add = (n) => { s.scores[cid] = (s.scores[cid] || 0) + n; s.gains[cid] = (s.gains[cid] || 0) + n; };
  if (egg === cid && !s.found[cid]) {
    const t = now - s.phaseAt;
    const pts = 100 + Math.round((100 * Math.max(0, 1 - t / HUNT_MS)) / 10) * 10;
    add(pts);
    s.found[cid] = { at: t, misses: mine.length, pts };
    const st = s.stats[cid];
    if (st) {
      if (!mine.length) st.firstTry += 1;
      if (!st.fastest || t < st.fastest) st.fastest = t;
    }
    s.last[cid] = { spot, result: 'mine' };
    emit(s, 'found', { by: cid, spot });
  } else if (egg === 'golden' && !s.golden) {
    add(GOLDEN);
    s.golden = { by: cid, at: now - s.phaseAt };
    if (s.stats[cid]) s.stats[cid].golden += 1;
    s.last[cid] = { spot, result: 'golden' };
    emit(s, 'golden', { by: cid, spot });
  } else if (egg === cid || (egg === 'golden' && s.golden)) {
    return false;
  } else {
    mine.push(spot);
    s.lock[cid] = now + LOCK_MS;
    s.last[cid] = { spot, result: egg ? 'other' : 'miss', who: egg || null };
    emit(s, 'miss', { by: cid, spot });
  }
  checkDone(s, now);
  return true;
}

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'start':
      if (elapsed >= START_MS) { setPhase(s, 'hide', now); emit(s, 'hide'); }
      break;
    case 'hide': {
      const hop = Math.floor(elapsed / hopMs(s));
      if (hop > (s.hopSeen ?? -1) && hop < s.hops.length) { s.hopSeen = hop; emit(s, s.hops[hop].egg ? 'drop' : 'fake', { hop }); }
      if (elapsed >= hideMs(s)) { s.hopSeen = -1; setPhase(s, 'hunt', now); emit(s, 'hunt'); }
      break;
    }
    case 'hunt':
      if (elapsed >= HUNT_MS || (s.closeAt != null && now >= s.closeAt)) { setPhase(s, 'reveal', now); emit(s, 'reveal'); }
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS) {
        if (s.round + 1 >= ROUNDS) { setPhase(s, 'over', now); emit(s, 'over'); } else { s.round += 1; startRound(s, now); }
      }
      break;
    default:
      break;
  }
  return s;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** Latecomers get their own egg from the next round on. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = { firstTry: 0, golden: 0, fastest: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'over';

export const ranking = (s) => {
  const list = s.players.map((p) => ({ cid: p.cid, score: s.scores[p.cid] || 0 })).sort((a, b) => b.score - a.score);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
  return list;
};

/** What one phone needs to show. Kept to whole seconds so it only changes when something happens. */
export function phoneView(s, cid, now) {
  const c = s.colors[cid];
  const view = {
    phase: s.phase,
    round: s.round + 1,
    rounds: ROUNDS,
    score: s.scores[cid] || 0,
    color: c == null ? null : c,
  };
  if (s.phase === 'hunt') {
    view.left = Math.ceil(Math.max(0, HUNT_MS - (now - s.phaseAt)) / 1000);
    view.misses = s.misses[cid] || [];
    view.locked = (s.lock[cid] || 0) > now;
    view.golden = s.golden ? (s.golden.by === cid ? 'me' : 'taken') : null;
    view.goldenSpot = s.golden ? spotOfEgg(s, 'golden') : null;
  }
  if (s.phase === 'hunt' || s.phase === 'reveal') {
    view.found = s.found[cid] ? spotOfEgg(s, cid) : null;
    const last = s.last[cid];
    if (last) view.last = { ...last, who: last.who && last.who !== 'golden' ? s.players.find((p) => p.cid === last.who)?.name || null : null };
  }
  if (s.phase === 'reveal') {
    view.mine = c == null ? null : spotOfEgg(s, cid);
    view.gain = s.gains[cid] || 0;
    view.rank = ranking(s).find((r) => r.cid === cid)?.rank;
  }
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (score) => {
    let top = null;
    s.players.forEach((p) => {
      const v = score(s.stats[p.cid] || { firstTry: 0, golden: 0, fastest: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.golden, 'Golden Touch', (v) => `Grabbed ${v} golden egg${v === 1 ? '' : 's'}`);
  add((st) => st.firstTry, 'Eagle Eye', (v) => `Found ${v} egg${v === 1 ? '' : 's'} on the first try`);
  add((st) => (st.fastest ? 100000 - st.fastest : 0), 'Speedy Bunny', (v) => `Found an egg in ${((100000 - v) / 1000).toFixed(1)}s`);
  return list;
}
