// Secret Admirer (Valentine's only): everyone secretly writes a sweet note to someone else in the room.
// Then the notes are read out one by one and everyone guesses who wrote each. Guess right to score, and
// fool the room with your own note to score more. Pure game logic, no React; the TV ticks it.
import { clean } from '../mashPrompts.js';

export const WRITE_MS = 75000;
export const GUESS_MS = 25000;
export const REVEAL_MS = 7500;
export const SCORES_MS = 6000;
export const CLOSE_MS = 2500;
export const ACTIVE_MS = 30000;
export const MIN_PLAYERS = 3;
export const MAX_NOTE = 60;

export const STARTERS = ['I love how you', 'You always', 'Nobody else can', 'Roses are red,', 'My favorite thing about you is', 'You make me laugh when'];
const BACKUP = [
  'You light up every room you walk into!',
  'You give the best hugs, no contest.',
  'Your laugh is my favorite sound.',
  'You make every game night better.',
  'You are cooler than you think you are.',
  'Thanks for always having my back.',
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
export const nameOf = (s, cid) => s.players.find((p) => p.cid === cid)?.name || '?';

/** Who writes to whom this round: a shuffled ring, so nobody writes to themselves. */
export function pairUp(rand, cids, round) {
  const order = shuffle(rand, cids);
  const n = order.length;
  const k = 1 + (round % Math.max(1, n - 1));
  const out = {};
  order.forEach((cid, i) => { out[cid] = order[(i + k) % n]; });
  return out;
}

const startRound = (s, now) => {
  const cids = s.players.map((p) => p.cid);
  s.targets = pairUp(s.rand, cids, s.round);
  s.notes = [];
  s.written = {};
  s.current = -1;
  setPhase(s, 'write', now);
  emit(s, 'write', { round: s.round });
};

/** A new game. players: [{ cid, name }] (at least 3). */
export function createAdmirer(players, seed = Date.now(), now = 0) {
  const s = {
    rand: mulberry(seed),
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    rounds: players.length <= 5 ? 2 : 1,
    round: 0,
    targets: {},
    written: {},
    notes: [],
    current: -1,
    guesses: {},
    hearts: {},
    scores: {},
    gains: {},
    phase: 'write',
    phaseAt: now,
    closeAt: null,
    stats: {},
    lastSeen: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = { right: 0, fooled: 0, hearts: 0 };
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

/** A phone's note for its secret valentine. */
export function write(s, cid, text, now) {
  if (s.phase !== 'write' || !s.targets[cid] || s.written[cid]) return false;
  const note = clean(String(text || '').slice(0, MAX_NOTE));
  if (!note) return false;
  s.written[cid] = note;
  emit(s, 'note', { by: cid });
  const waiting = activePlayers(s, now).some((p) => s.targets[p.cid] && !s.written[p.cid]);
  if (!waiting) s.closeAt = now + CLOSE_MS;
  return true;
}

const startGuess = (s, now) => {
  s.current += 1;
  s.guesses = {};
  s.hearts = {};
  setPhase(s, 'guess', now);
  emit(s, 'letter', { index: s.current });
};

const closeWriting = (s, now) => {
  // Anyone who didn't finish gets a sweet backup note, so every valentine gets a letter.
  let b = Math.floor(s.rand() * BACKUP.length);
  Object.keys(s.targets).forEach((cid) => {
    if (!s.written[cid]) { s.written[cid] = BACKUP[b % BACKUP.length]; b += 1; }
  });
  s.notes = shuffle(s.rand, Object.keys(s.targets)).map((by) => ({ by, to: s.targets[by], text: s.written[by] }));
  startGuess(s, now);
};

/** Who can be picked as the writer by this voter: anyone but themselves and the note's recipient. */
export const suspects = (s, note, cid) => s.players.filter((p) => p.cid !== cid && p.cid !== note.to).map((p) => p.cid);

const reveal = (s, now) => {
  const note = s.notes[s.current];
  const gains = {};
  const add = (cid, n) => { gains[cid] = (gains[cid] || 0) + n; s.scores[cid] = (s.scores[cid] || 0) + n; };
  let fooled = 0;
  Object.entries(s.guesses).forEach(([cid, pick]) => {
    if (pick === note.by) {
      add(cid, cid === note.to ? 150 : 100);
      if (s.stats[cid]) s.stats[cid].right += 1;
    } else fooled += 1;
  });
  const hearts = Object.keys(s.hearts).length;
  if (fooled) add(note.by, fooled * 60);
  if (hearts) add(note.by, hearts * 30);
  if (s.stats[note.by]) { s.stats[note.by].fooled += fooled; s.stats[note.by].hearts += hearts; }
  note.guesses = { ...s.guesses };
  note.hearts = hearts;
  note.fooled = fooled;
  s.gains = Object.fromEntries(Object.entries(gains).map(([cid, gain]) => [cid, { gain }]));
  setPhase(s, 'reveal', now);
  emit(s, 'reveal', { by: note.by, fooled });
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  switch (s.phase) {
    case 'write':
      if (elapsed >= WRITE_MS || (s.closeAt != null && now >= s.closeAt)) closeWriting(s, now);
      break;
    case 'guess':
      if (elapsed >= GUESS_MS || (s.closeAt != null && now >= s.closeAt)) reveal(s, now);
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS) {
        if (s.current + 1 < s.notes.length) startGuess(s, now);
        else if (s.round + 1 < s.rounds) { setPhase(s, 'scores', now); emit(s, 'scores'); } else { setPhase(s, 'over', now); emit(s, 'over'); }
      }
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) { s.round += 1; startRound(s, now); }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's guess at who wrote the note on screen. Can be changed until the reveal. */
export function guess(s, cid, pick, now) {
  if (s.phase !== 'guess') return false;
  const note = s.notes[s.current];
  if (!note || cid === note.by || !suspects(s, note, cid).includes(pick)) return false;
  s.guesses[cid] = pick;
  emit(s, 'guessed', { by: cid });
  const waiting = activePlayers(s, now).some((p) => p.cid !== note.by && !s.guesses[p.cid]);
  if (waiting) s.closeAt = null; else if (s.closeAt == null) s.closeAt = now + CLOSE_MS;
  return true;
}

/** A phone's "aww" for the note on screen (toggles). */
export function heart(s, cid) {
  if (s.phase !== 'guess') return false;
  const note = s.notes[s.current];
  if (!note || cid === note.by) return false;
  if (s.hearts[cid]) delete s.hearts[cid]; else { s.hearts[cid] = true; emit(s, 'heart', { by: cid }); }
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** Latecomers can guess (and get a valentine next round) but don't write until the next round. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = { right: 0, fooled: 0, hearts: 0 };
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'over';

export const ranking = (s) => {
  const list = s.players.map((p) => ({ cid: p.cid, score: s.scores[p.cid] || 0 })).sort((a, b) => b.score - a.score);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
  return list;
};

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const view = { phase: s.phase, round: s.round + 1, rounds: s.rounds, score: s.scores[cid] || 0 };
  if (s.phase === 'write') {
    view.to = s.targets[cid] ? nameOf(s, s.targets[cid]) : null;
    view.done = Boolean(s.written[cid]);
    view.left = Math.ceil(Math.max(0, WRITE_MS - (now - s.phaseAt)) / 1000);
  }
  const note = s.notes[s.current];
  if ((s.phase === 'guess' || s.phase === 'reveal') && note) {
    view.index = s.current + 1;
    view.count = s.notes.length;
    view.to = nameOf(s, note.to);
    view.forMe = note.to === cid;
    view.text = note.text;
    view.mine = note.by === cid;
    view.pick = s.guesses[cid] || null;
    view.hearted = Boolean(s.hearts[cid]);
    if (s.phase === 'guess' && !view.mine) view.suspects = suspects(s, note, cid).map((c) => ({ cid: c, name: nameOf(s, c) }));
    if (s.phase === 'reveal') {
      view.by = nameOf(s, note.by);
      view.right = note.guesses?.[cid] === note.by;
      view.fooled = note.fooled;
      view.gain = s.gains[cid]?.gain || 0;
    }
  }
  if (s.phase === 'scores') view.rank = ranking(s).find((r) => r.cid === cid)?.rank;
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (score) => {
    let top = null;
    s.players.forEach((p) => {
      const v = score(s.stats[p.cid] || { right: 0, fooled: 0, hearts: 0 });
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (score, title, blurb) => { const b = best(score); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.hearts, 'Sweetest Note', (v) => `Got ${v} heart${v === 1 ? '' : 's'} from the room`);
  add((st) => st.fooled, 'Mystery Admirer', (v) => `Fooled ${v} guess${v === 1 ? '' : 'es'}`);
  add((st) => st.right, 'Love Detective', (v) => `Guessed ${v} writer${v === 1 ? '' : 's'} right`);
  return list;
}
