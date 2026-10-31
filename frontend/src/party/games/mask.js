// Who's Behind the Mask?: everyone gets a secret Halloween word on their phone except the vampires,
// who only get the category. Everyone writes a one-word clue, the room talks it out, then votes.
// Catch the vampires and the humans score; vampires score by escaping, framing a human, or
// guessing the word once they're caught. Pure game logic, no React. The TV owns the state.

import { clean } from '../mashPrompts.js';
import { CATEGORIES } from '../maskWords.js';

export const MIN_PLAYERS = 3;
export const ROUNDS = 3;
export const ROLE_MS = 9000;
export const CLUE_MS = 50000;
export const SHOW_EACH_MS = 1300;
export const TALK_MS = 50000;
export const VOTE_MS = 30000;
export const UNMASK_EACH_MS = 4000;
export const BITE_MS = 20000;
export const RESULT_MS = 9000;
export const SCORES_MS = 8000;
export const CLOSE_MS = 1500;
export const ACTIVE_MS = 30000;
export const CLUE_MAX = 24;

export const CATCH_TEAM = 200;
export const CATCH_VOTE = 100;
export const ESCAPE = 400;
export const FRAME = 150;
export const BITE = 300;

/** How many vampires for this many players: 1 up to 6, 2 up to 10, 3 for 11 or 12. */
export const vampireCount = (n) => (n <= 6 ? 1 : n <= 10 ? 2 : 3);

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
const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
  s.closeAt = null;
};
const freshStats = () => ({ caught: 0, escaped: 0, framed: 0, bites: 0, rightVotes: 0, vampire: 0 });
const nameOf = (s, cid) => s.players.find((p) => p.cid === cid)?.name || '?';

export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);
const inRound = (s, cid) => s.cast.includes(cid);
const activeCast = (s, now) => activePlayers(s, now).filter((p) => inRound(s, p.cid));
export const isVampire = (s, cid) => s.vampires.includes(cid);
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');

/** How long the clue-by-clue reveal takes. */
export const showMs = (s) => s.order.length * SHOW_EACH_MS + 2500;
const unmaskMs = (s) => Math.max(1, s.unmasked.length) * UNMASK_EACH_MS + 1000;

function startRound(s, now) {
  s.cast = s.players.map((p) => p.cid);
  const n = s.cast.length;
  const k = Math.min(vampireCount(n), Math.max(1, n - 2));
  // Prefer people who haven't been a vampire yet, then whoever's been one least.
  const pool = shuffle(s.rand, s.cast).sort((a, b) => (s.stats[a]?.vampire || 0) - (s.stats[b]?.vampire || 0));
  s.vampires = pool.slice(0, k);
  s.vampires.forEach((cid) => { s.stats[cid].vampire += 1; });
  const cat = s.categories[s.round % s.categories.length];
  s.category = cat.name;
  s.word = cat.words[Math.floor(s.rand() * cat.words.length)];
  s.options = shuffle(s.rand, cat.words);
  s.clues = {};
  s.rejected = {};
  s.order = [];
  s.ready = {};
  s.votes = {};
  s.counts = {};
  s.unmasked = [];
  s.bite = null;
  s.gains = {};
  setPhase(s, 'role', now);
  emit(s, 'round', { round: s.round });
}

/** A new game. players: [{ cid, name }]. */
export function createMask(players, seed = Date.now(), now = 0) {
  const rand = mulberry(seed);
  const s = {
    rand,
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    categories: shuffle(rand, CATEGORIES),
    round: 0,
    phase: 'role',
    phaseAt: now,
    closeAt: null,
    cast: [],
    vampires: [],
    category: '',
    word: '',
    options: [],
    clues: {},
    rejected: {},
    order: [],
    ready: {},
    votes: {},
    counts: {},
    unmasked: [],
    bite: null,
    gains: {},
    history: [],
    scores: {},
    stats: {},
    lastSeen: {},
    prevRanks: {},
    events: [],
    eventId: 0,
  };
  s.players.forEach((p) => {
    s.scores[p.cid] = 0;
    s.stats[p.cid] = freshStats();
    s.lastSeen[p.cid] = now;
  });
  startRound(s, now);
  return s;
}

export function ranking(s) {
  const list = s.players.map((p, i) => ({ cid: p.cid, name: p.name, score: s.scores[p.cid] || 0, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  let rank = 0;
  return list.map((p, i) => {
    if (i === 0 || p.score !== list[i - 1].score) rank = i + 1;
    return { cid: p.cid, name: p.name, score: p.score, rank };
  });
}

/** Votes per player, and who gets unmasked: the top vote-getters, one per vampire. Ties go to whoever was voted for first. */
export function tally(s) {
  const counts = {};
  const first = {};
  Object.values(s.votes).forEach((v) => {
    counts[v.target] = (counts[v.target] || 0) + 1;
    first[v.target] = Math.min(first[v.target] ?? Infinity, v.at);
  });
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || first[a] - first[b]);
  return { counts, unmasked: ranked.slice(0, s.vampires.length) };
}

const add = (s, cid, points, why) => {
  if (!points || !(cid in s.scores)) return;
  s.scores[cid] += points;
  if (!s.gains[cid]) s.gains[cid] = { gain: 0, why: [] };
  s.gains[cid].gain += points;
  s.gains[cid].why.push(why);
};

function score(s) {
  const humans = s.cast.filter((cid) => !isVampire(s, cid));
  const caught = s.unmasked.filter((cid) => isVampire(s, cid));
  const framed = s.unmasked.filter((cid) => !isVampire(s, cid));
  caught.forEach((v) => {
    s.stats[v].caught += 1;
    humans.forEach((h) => add(s, h, CATCH_TEAM, 'Caught a vampire'));
    Object.entries(s.votes).forEach(([cid, vote]) => {
      if (vote.target === v && !isVampire(s, cid)) {
        add(s, cid, CATCH_VOTE, 'Voted for a vampire');
        s.stats[cid].rightVotes += 1;
      }
    });
  });
  s.vampires.filter((v) => !caught.includes(v)).forEach((v) => {
    add(s, v, ESCAPE, 'Escaped');
    s.stats[v].escaped += 1;
  });
  framed.forEach(() => s.vampires.forEach((v) => {
    add(s, v, FRAME, 'A human got the blame');
    s.stats[v].framed += 1;
  }));
  if (s.bite?.right) s.vampires.forEach((v) => { add(s, v, BITE, 'Guessed the word'); s.stats[v].bites += 1; });
  s.history.push({ round: s.round, word: s.word, vampires: [...s.vampires], caught, bite: s.bite?.right || false });
}

function openVotes(s, now) {
  const { counts, unmasked } = tally(s);
  s.counts = counts;
  s.unmasked = unmasked;
  setPhase(s, 'unmask', now);
  emit(s, 'unmask', { unmasked });
}

function afterUnmask(s, now) {
  if (s.unmasked.some((cid) => isVampire(s, cid))) {
    setPhase(s, 'bite', now);
    emit(s, 'bite');
  } else {
    finishRound(s, now);
  }
}

function finishRound(s, now) {
  s.prevRanks = Object.fromEntries(ranking(s).map((r) => [r.cid, r.rank]));
  score(s);
  setPhase(s, 'result', now);
  emit(s, 'result', { caught: s.unmasked.filter((cid) => isVampire(s, cid)).length });
}

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  const closing = s.closeAt != null && now >= s.closeAt;
  switch (s.phase) {
    case 'role':
      if (elapsed >= ROLE_MS) { setPhase(s, 'clue', now); emit(s, 'clue'); }
      break;
    case 'clue':
      if (elapsed >= CLUE_MS || closing) {
        s.order = shuffle(s.rand, s.cast.filter((cid) => s.clues[cid]));
        setPhase(s, 'show', now);
        emit(s, 'show');
      }
      break;
    case 'show':
      if (elapsed >= showMs(s)) { setPhase(s, 'talk', now); emit(s, 'talk'); }
      break;
    case 'talk':
      if (elapsed >= TALK_MS || closing) { setPhase(s, 'vote', now); emit(s, 'vote'); }
      break;
    case 'vote':
      if (elapsed >= VOTE_MS || closing) openVotes(s, now);
      break;
    case 'unmask':
      if (elapsed >= unmaskMs(s)) afterUnmask(s, now);
      break;
    case 'bite':
      if (elapsed >= BITE_MS || closing) finishRound(s, now);
      break;
    case 'result':
      if (elapsed >= RESULT_MS) {
        if (s.round >= ROUNDS - 1) {
          setPhase(s, 'final', now);
          emit(s, 'final');
        } else {
          setPhase(s, 'scores', now);
          emit(s, 'scores');
        }
      }
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) {
        s.round += 1;
        startRound(s, now);
      }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's clue. Returns 'ok', 'word' (it gave away the secret word) or false. */
export function clue(s, cid, text, now) {
  if (s.phase !== 'clue' || !inRound(s, cid) || s.clues[cid]) return false;
  const t = clean(String(text || '').trim().slice(0, CLUE_MAX));
  if (!t) return false;
  if (!isVampire(s, cid) && norm(s.word).length > 2 && norm(t).includes(norm(s.word))) {
    s.rejected[cid] = true;
    return 'word';
  }
  s.clues[cid] = t;
  s.rejected[cid] = false;
  emit(s, 'clued', { by: cid });
  const waiting = activeCast(s, now).some((p) => !s.clues[p.cid]);
  if (!waiting) s.closeAt = now + CLOSE_MS;
  return 'ok';
}

/** "Ready to vote" during the talk. Once most of the room is ready, voting starts. */
export function ready(s, cid, now) {
  if (s.phase !== 'talk' || !inRound(s, cid)) return false;
  s.ready[cid] = true;
  emit(s, 'ready', { by: cid });
  const room = activeCast(s, now);
  const count = room.filter((p) => s.ready[p.cid]).length;
  if (count >= Math.max(2, Math.ceil(room.length * 0.6))) s.closeAt = now + CLOSE_MS;
  return true;
}

/** A phone's vote for who's behind the mask. Players can change their mind until it closes. */
export function vote(s, cid, target, now) {
  if (s.phase !== 'vote' || !inRound(s, cid) || !inRound(s, target) || cid === target) return false;
  const prev = s.votes[cid];
  s.votes[cid] = { target, at: prev && prev.target === target ? prev.at : now };
  emit(s, 'voted', { by: cid });
  const waiting = activeCast(s, now).some((p) => !s.votes[p.cid]);
  s.closeAt = waiting ? null : now + CLOSE_MS;
  return true;
}

/** A vampire's guess at the secret word. The first guess counts for the whole coven. */
export function bite(s, cid, guess, now) {
  if (s.phase !== 'bite' || !isVampire(s, cid) || s.bite) return false;
  if (!s.options.includes(guess)) return false;
  s.bite = { by: cid, guess, right: guess === s.word };
  emit(s, 'bit', { right: s.bite.right });
  s.closeAt = now + 2500;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** A late joiner watches this round and plays from the next one. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = freshStats();
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'final';

const clueList = (s) => s.order.map((cid) => ({ cid, name: nameOf(s, cid), text: s.clues[cid] }));

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const me = ranking(s).find((r) => r.cid === cid);
  const playing = inRound(s, cid);
  const vamp = isVampire(s, cid);
  const elapsed = now - s.phaseAt;
  const view = {
    phase: s.phase,
    round: s.round,
    rounds: ROUNDS,
    score: me ? me.score : 0,
    rank: me ? me.rank : null,
    role: !playing ? 'watch' : vamp ? 'vampire' : 'human',
    category: s.category,
    vampireCount: s.vampires.length,
  };
  if (playing && !vamp) view.word = s.word;
  if (vamp) view.team = s.vampires.filter((v) => v !== cid).map((v) => nameOf(s, v));
  view.myClue = s.clues[cid] || null;
  if (s.rejected[cid]) view.rejected = true;
  if (s.phase === 'clue') view.left = Math.max(0, CLUE_MS - elapsed);
  if (['talk', 'vote'].includes(s.phase)) view.clues = clueList(s);
  if (s.phase === 'talk') {
    view.left = Math.max(0, TALK_MS - elapsed);
    view.ready = !!s.ready[cid];
  }
  if (s.phase === 'vote') {
    view.left = Math.max(0, VOTE_MS - elapsed);
    view.targets = s.cast.filter((x) => x !== cid).map((x) => ({ cid: x, name: nameOf(s, x), clue: s.clues[x] || '' }));
    view.voted = s.votes[cid]?.target || null;
  }
  if (s.phase === 'bite') {
    view.left = Math.max(0, BITE_MS - elapsed);
    if (vamp && !s.bite) view.options = s.options;
    view.bite = s.bite ? { by: nameOf(s, s.bite.by), right: s.bite.right } : null;
  }
  if (['result', 'scores', 'final'].includes(s.phase)) {
    view.result = {
      word: s.word,
      vampires: s.vampires.map((v) => nameOf(s, v)),
      caught: s.unmasked.filter((x) => isVampire(s, x)).map((x) => nameOf(s, x)),
      gain: s.gains[cid]?.gain || 0,
      why: s.gains[cid]?.why || [],
      bite: s.bite ? s.bite.right : null,
    };
  }
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const best = (pick) => {
    let top = null;
    s.players.forEach((p) => {
      const v = pick(s.stats[p.cid] || freshStats());
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const addAward = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  addAward((st) => st.escaped, 'Master of Disguise', (v) => `Escaped as a vampire ${v} time${v === 1 ? '' : 's'}`);
  addAward((st) => st.rightVotes, 'Vampire Hunter', (v) => `Voted for a vampire ${v} time${v === 1 ? '' : 's'}`);
  addAward((st) => st.bites, 'Sharpest Fangs', (v) => `Guessed the secret word ${v} time${v === 1 ? '' : 's'}`);
  addAward((st) => st.framed, 'Smooth Talker', (v) => `Got a human blamed ${v} time${v === 1 ? '' : 's'}`);
  return list;
}
