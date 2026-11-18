// Fireworks Show (July 4 only): a rhythm game. Every player has a launch tube on the TV. Rockets rise in
// time with the beat toward a ring in the sky; tap BOOM on your phone right as YOUR rocket hits its ring.
// Perfect timing makes the biggest burst. Five shows, each faster, ending in a grand finale where everyone
// fires together. Timing is measured on the phone (like Countdown Chaos) so the network can't spoil it.
// Pure game logic, no React; the TV ticks it.

export const READY_MS = 3200;
export const LEAD_MS = 2400;
export const RISE_MS = 1600;
export const TAIL_MS = 2200;
export const SCORES_MS = 6000;
export const MISS_AFTER_MS = 1100;
export const ACTIVE_MS = 30000;
export const FINALE_BONUS = 200;

// d = tap - peak, in ms. Early taps get a little extra room, since people watching the TV see it a hair sooner.
export const WINDOWS = [
  { grade: 'perfect', early: -110, late: 80, pts: 100 },
  { grade: 'great', early: -200, late: 160, pts: 60 },
  { grade: 'good', early: -290, late: 250, pts: 30 },
];
export const STRAY = 20;

export const SHOWS = [
  { name: 'Sparklers', bpm: 96, beats: 52, p: 0.2, gap: 2, halves: 0 },
  { name: 'Roman Candles', bpm: 106, beats: 56, p: 0.26, gap: 2, halves: 0 },
  { name: 'Double Trouble', bpm: 116, beats: 60, p: 0.3, gap: 1, halves: 0.18 },
  { name: 'Rockets’ Red Glare', bpm: 124, beats: 60, p: 0.34, gap: 1, halves: 0.22 },
  { name: 'Grand Finale', bpm: 132, beats: 64, p: 0.34, gap: 1, halves: 0.25, finale: true },
];

export const COLORS = [
  { name: 'Red', fill: '#ff4d4d' }, { name: 'Blue', fill: '#4f8bff' }, { name: 'Gold', fill: '#ffd23f' }, { name: 'Green', fill: '#3ddc84' },
  { name: 'Pink', fill: '#ff6fae' }, { name: 'Purple', fill: '#b388ff' }, { name: 'Cyan', fill: '#4fe3ff' }, { name: 'Orange', fill: '#ff9f43' },
  { name: 'White', fill: '#f4f4ff' }, { name: 'Lime', fill: '#b5e61d' }, { name: 'Teal', fill: '#14b8a6' }, { name: 'Magenta', fill: '#ff3df2' },
];
export const SHAPES = ['peony', 'ring', 'willow', 'heart', 'star'];

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
  if (s.events.length > 80) s.events.splice(0, s.events.length - 80);
};
const setPhase = (s, phase, now) => { s.phase = phase; s.phaseAt = now; };
export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);
export const beatMs = (show) => 60000 / show.bpm;
/** How long the show phase lasts: the beats plus the lead-in and a tail for the last bursts. */
export const showMs = (show) => LEAD_MS + show.beats * beatMs(show) + TAIL_MS;

/** The rockets for one show: [{ id, cid, at, beat, shape, tx, ty, finale }] sorted by time. */
export function buildChart(rand, show, cids, idBase = 0) {
  const b = beatMs(show);
  const list = [];
  const lastBeat = show.finale ? show.beats - 10 : show.beats - 2;
  cids.forEach((cid) => {
    let next = 4 + Math.floor(rand() * 3);
    for (let beat = next; beat <= lastBeat; beat += 1) {
      if (beat < next || rand() > show.p) continue;
      list.push({ cid, beat });
      if (show.halves && beat + 0.5 <= lastBeat && rand() < show.halves) list.push({ cid, beat: beat + 0.5 });
      next = beat + show.gap + (rand() < 0.35 ? 1 : 0);
    }
    if (show.finale) [show.beats - 8, show.beats - 6, show.beats - 4, show.beats - 3, show.beats - 2].forEach((beat) => list.push({ cid, beat, finale: true }));
  });
  return list
    .sort((x, y) => x.beat - y.beat)
    .map((r, i) => ({
      id: idBase + i,
      cid: r.cid,
      beat: r.beat,
      at: Math.round(LEAD_MS + r.beat * b),
      shape: SHAPES[Math.floor(rand() * SHAPES.length)],
      tx: Math.round((rand() - 0.5) * 260),
      ty: Math.round(r.finale ? 180 + rand() * 180 : 210 + rand() * 230),
      finale: Boolean(r.finale),
    }));
}

const startShow = (s, now) => {
  const show = SHOWS[s.show];
  s.colors = {};
  s.players.forEach((p, i) => { s.colors[p.cid] = i % COLORS.length; });
  s.rockets = buildChart(s.rand, show, s.players.map((p) => p.cid), s.show * 10000);
  s.judged = {};
  s.combo = {};
  s.lastTap = {};
  s.gains = {};
  s.bonus = false;
  setPhase(s, 'ready', now);
  emit(s, 'ready', { show: s.show });
};

/** A new game. players: [{ cid, name }]. */
export function createFireworks(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    show: 0,
    colors: {},
    rockets: [],
    judged: {},
    combo: {},
    lastTap: {},
    gains: {},
    bonus: false,
    scores: {},
    phase: 'ready',
    phaseAt: now,
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = { perfect: 0, hits: 0, rockets: 0, bestCombo: 0 };
    s.lastSeen[p.cid] = now;
  });
  startShow(s, now);
  return s;
}

const gradeOf = (d) => WINDOWS.find((w) => d >= w.early && d <= w.late) || null;

/** A phone's BOOM. ms: time since the show started, measured on the phone. */
export function boom(s, cid, ms, now) {
  if (s.phase !== 'show' || s.colors[cid] == null) return false;
  const seen = now - s.phaseAt;
  let t = Number(ms);
  if (!Number.isFinite(t)) t = seen;
  t = Math.max(seen - 2500, Math.min(seen + 150, t));
  if (s.lastTap[cid] != null && t - s.lastTap[cid] < 110) return false;
  s.lastTap[cid] = t;
  let best = null;
  s.rockets.forEach((r) => {
    if (r.cid !== cid || s.judged[r.id]) return;
    const d = t - r.at;
    const g = gradeOf(d);
    if (g && (!best || Math.abs(d) < Math.abs(best.d))) best = { r, d, g };
  });
  const st = s.stats[cid];
  if (!best) {
    s.combo[cid] = 0;
    s.scores[cid] = Math.max(0, (s.scores[cid] || 0) - STRAY);
    s.gains[cid] = (s.gains[cid] || 0) - STRAY;
    emit(s, 'stray', { by: cid });
    return true;
  }
  const combo = (s.combo[cid] || 0) + 1;
  s.combo[cid] = combo;
  const pts = Math.round(best.g.pts * (1 + Math.min(combo - 1, 10) * 0.1));
  s.scores[cid] = (s.scores[cid] || 0) + pts;
  s.gains[cid] = (s.gains[cid] || 0) + pts;
  s.judged[best.r.id] = { grade: best.g.grade, d: Math.round(best.d), pts, at: now - s.phaseAt };
  if (st) {
    st.hits += 1;
    if (best.g.grade === 'perfect') st.perfect += 1;
    st.bestCombo = Math.max(st.bestCombo, combo);
  }
  emit(s, 'hit', { rocket: best.r.id, by: cid, grade: best.g.grade, combo });
  return true;
}

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  const show = SHOWS[s.show];
  switch (s.phase) {
    case 'ready':
      if (elapsed >= READY_MS) { setPhase(s, 'show', now); emit(s, 'go'); }
      break;
    case 'show':
      s.rockets.forEach((r) => {
        if (!s.judged[r.id] && elapsed > r.at + MISS_AFTER_MS) {
          s.judged[r.id] = { grade: 'miss', pts: 0, at: elapsed };
          s.combo[r.cid] = 0;
          emit(s, 'dud', { rocket: r.id, by: r.cid });
        }
      });
      if (elapsed >= showMs(show)) {
        s.rockets.forEach((r) => { if (s.stats[r.cid]) s.stats[r.cid].rockets += 1; });
        if (show.finale) {
          const fin = s.rockets.filter((r) => r.finale);
          const hit = fin.filter((r) => s.judged[r.id] && s.judged[r.id].grade !== 'miss').length;
          if (fin.length && hit / fin.length >= 0.7) {
            s.bonus = true;
            s.players.forEach((p) => { s.scores[p.cid] = (s.scores[p.cid] || 0) + FINALE_BONUS; s.gains[p.cid] = (s.gains[p.cid] || 0) + FINALE_BONUS; });
          }
        }
        setPhase(s, 'scores', now);
        emit(s, 'scores', { bonus: s.bonus });
      }
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) {
        if (s.show + 1 >= SHOWS.length) { setPhase(s, 'over', now); emit(s, 'over'); } else { s.show += 1; startShow(s, now); }
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

/** Latecomers get a tube at the next show. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = { perfect: 0, hits: 0, rockets: 0, bestCombo: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'over';

export const ranking = (s) => {
  const list = s.players.map((p) => ({ cid: p.cid, score: s.scores[p.cid] || 0 })).sort((a, b) => b.score - a.score);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
  return list;
};

/** What one phone needs to show. The rocket times only change between shows, so this stays quiet. */
export function phoneView(s, cid) {
  const show = SHOWS[s.show];
  const view = {
    phase: s.phase,
    show: s.show + 1,
    shows: SHOWS.length,
    name: show.name,
    score: s.scores[cid] || 0,
    color: s.colors[cid] == null ? null : s.colors[cid],
  };
  if (s.phase === 'ready' || s.phase === 'show') {
    view.id = s.show;
    view.beat = Math.round(beatMs(show));
    view.len = showMs(show);
    view.rockets = s.rockets.filter((r) => r.cid === cid).map((r) => r.at);
  }
  if (s.phase === 'show') {
    view.combo = s.combo[cid] || 0;
    // The latest result for this phone, so it can flash PERFECT / GREAT / MISS.
    let last = null;
    s.rockets.forEach((r) => { const j = s.judged[r.id]; if (r.cid === cid && j && (!last || j.at > last.at)) last = { id: r.id, grade: j.grade, at: j.at }; });
    view.last = last ? { id: last.id, grade: last.grade } : null;
  }
  if (s.phase === 'scores') {
    const mine = s.rockets.filter((r) => r.cid === cid);
    view.hits = mine.filter((r) => s.judged[r.id] && s.judged[r.id].grade !== 'miss').length;
    view.total = mine.length;
    view.gain = s.gains[cid] || 0;
    view.bonus = s.bonus;
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
      const v = score(s.stats[p.cid] || { perfect: 0, hits: 0, rockets: 0, bestCombo: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.perfect, 'Perfect Pyro', (v) => `${v} perfect booms`);
  add((st) => st.bestCombo, 'On a Roll', (v) => `${v} booms in a row`);
  add((st) => (st.rockets ? Math.round((st.hits / st.rockets) * 100) : 0), 'Steady Hands', (v) => `Hit ${v}% of their rockets`);
  return list;
}
