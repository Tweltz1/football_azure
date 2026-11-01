// Monster Mash-up: everyone writes funny answers to Halloween prompts, then votes on anonymous
// head-to-head matchups. Pure game logic, no React. The TV owns the state and ticks it.

import { clean, FINAL_PROMPTS, PROMPTS } from '../mashPrompts.js';

export const MIN_PLAYERS = 3;
export const ROUND_MS = 6000;
export const WRITE_MS = 80000;
export const FINAL_WRITE_MS = 60000;
export const VOTE_MS = 15000;
export const FINAL_VOTE_MS = 25000;
export const REVEAL_MS = 7000;
export const SKIP_MS = 3000;
export const SCORES_MS = 8000;
export const CLOSE_MS = 1000;
export const VOTE_POINTS = 100;
export const MASH_BONUS = 250;
export const ACTIVE_MS = 30000;

export const ROUNDS = [
  { title: 'Round 1', blurb: 'Answer two prompts on your phone. Then vote for the funniest answer in each matchup.' },
  { title: 'Round 2', blurb: 'Same again, but every vote is worth double!' },
  { title: 'The Final Fright', blurb: 'Everyone answers the same prompt. Votes are worth triple. Anyone can still win!' },
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
const setPhase = (s, phase, now) => {
  s.phase = phase;
  s.phaseAt = now;
  s.closeAt = null;
};
const freshStats = () => ({ votes: 0, mashups: 0, won: 0, written: 0 });

export const isFinalRound = (s) => s.round === ROUNDS.length - 1;
export const pointsPerVote = (round) => VOTE_POINTS * (round + 1);
export const activePlayers = (s, now) => s.players.filter((p) => now - (s.lastSeen[p.cid] ?? -1e9) <= ACTIVE_MS);

/** Who answers what this round: each matchup has 2 (sometimes 3) authors, or everyone in the final. */
function deal(s) {
  const order = shuffle(s.rand, s.players.map((p) => p.cid));
  const n = order.length;
  const groups = [];
  if (isFinalRound(s)) {
    groups.push(order);
  } else if (n <= 6) {
    for (let k = 0; k < n; k += 1) groups.push([order[k], order[(k + 1) % n]]);
    // Small groups get a second lap so a round still has enough matchups.
    if (n <= 4) for (let k = 0; k < n; k += 1) groups.push([order[k], order[(k + 2) % n]]);
  } else {
    for (let k = 0; k + 1 < n; k += 2) groups.push([order[k], order[k + 1]]);
    if (n % 2) groups[groups.length - 1].push(order[n - 1]);
  }
  s.matchups = groups.map((authors) => {
    const pool = isFinalRound(s) ? s.finalPool : s.pool;
    const prompt = pool.shift() || 'Write anything spooky';
    return { prompt, authors, answers: {}, votes: {}, result: null };
  });
  s.current = 0;
}

/** A new game. players: [{ cid, name }]. */
export function createMash(players, seed = Date.now(), now = 0) {
  const rand = mulberry(seed);
  const s = {
    rand,
    players: players.map((p) => ({ cid: p.cid, name: p.name })),
    pool: shuffle(rand, PROMPTS),
    finalPool: shuffle(rand, FINAL_PROMPTS),
    round: 0,
    phase: 'round',
    phaseAt: now,
    closeAt: null,
    matchups: [],
    current: 0,
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
  deal(s);
  emit(s, 'round', { round: 0 });
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

/** The prompts a player still has to answer this round, in order. */
export const todo = (s, cid) => s.matchups.filter((m) => m.authors.includes(cid) && m.answers[cid] == null);

/** Answers in a matchup that can be voted for: [{ cid, text }]. */
export const options = (m) => m.authors.filter((cid) => m.answers[cid]).map((cid) => ({ cid, text: m.answers[cid] }));

/** Who may vote on a matchup: everyone except its authors (in the final, everyone, but not for themselves). */
export const voters = (s, m, now) => activePlayers(s, now).filter((p) => isFinalRound(s) || !m.authors.includes(p.cid));

const startVote = (s, now) => {
  const m = s.matchups[s.current];
  if (options(m).length < 2) {
    m.result = { skipped: true, gains: {}, counts: {} };
    setPhase(s, 'skip', now);
    emit(s, 'skip', { index: s.current });
    return;
  }
  setPhase(s, 'vote', now);
  emit(s, 'vote', { index: s.current });
};

const score = (s, now) => {
  const m = s.matchups[s.current];
  s.prevRanks = Object.fromEntries(ranking(s).map((r) => [r.cid, r.rank]));
  const counts = {};
  options(m).forEach((o) => { counts[o.cid] = 0; });
  Object.values(m.votes).forEach((cid) => { if (counts[cid] != null) counts[cid] += 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const per = pointsPerVote(s.round);
  const top = Math.max(0, ...Object.values(counts));
  const gains = {};
  Object.entries(counts).forEach(([cid, c]) => {
    const mashup = !isFinalRound(s) && total >= 2 && c === total;
    const gain = c * per + (mashup ? MASH_BONUS * (s.round + 1) : 0);
    gains[cid] = { votes: c, gain, mashup, winner: c > 0 && c === top };
    s.scores[cid] = (s.scores[cid] || 0) + gain;
    const st = s.stats[cid];
    if (st) {
      st.votes += c;
      if (mashup) st.mashups += 1;
      if (c > 0 && c === top) st.won += 1;
    }
  });
  m.result = { gains, counts, total };
  setPhase(s, 'reveal', now);
  emit(s, 'reveal', { index: s.current, mashup: Object.values(gains).some((g) => g.mashup) });
};

const nextMatchup = (s, now) => {
  if (s.current < s.matchups.length - 1) {
    s.current += 1;
    startVote(s, now);
    return;
  }
  if (isFinalRound(s)) {
    s.prevRanks = Object.fromEntries(ranking(s).map((r) => [r.cid, r.rank]));
    setPhase(s, 'final', now);
    emit(s, 'final');
    return;
  }
  setPhase(s, 'scores', now);
  emit(s, 'scores');
};

/** Advances the game to `now` (ms). */
export function tick(s, now) {
  const elapsed = now - s.phaseAt;
  const closed = s.closeAt != null && now >= s.closeAt;
  switch (s.phase) {
    case 'round':
      if (elapsed >= ROUND_MS) { setPhase(s, 'write', now); emit(s, 'write'); }
      break;
    case 'write':
      if (elapsed >= (isFinalRound(s) ? FINAL_WRITE_MS : WRITE_MS) || closed) {
        s.current = 0;
        startVote(s, now);
      }
      break;
    case 'vote':
      if (elapsed >= (isFinalRound(s) ? FINAL_VOTE_MS : VOTE_MS) || closed) score(s, now);
      break;
    case 'skip':
      if (elapsed >= SKIP_MS) nextMatchup(s, now);
      break;
    case 'reveal':
      if (elapsed >= REVEAL_MS + (isFinalRound(s) ? 4000 : 0)) nextMatchup(s, now);
      break;
    case 'scores':
      if (elapsed >= SCORES_MS) {
        s.round += 1;
        deal(s);
        setPhase(s, 'round', now);
        emit(s, 'round', { round: s.round });
      }
      break;
    default:
      break;
  }
  return s;
}

/** A phone's answer to its next prompt. Returns true if taken. */
export function write(s, cid, text, now) {
  if (s.phase !== 'write') return false;
  const next = todo(s, cid)[0];
  const answer = clean(text);
  if (!next || !answer) return false;
  next.answers[cid] = answer;
  if (s.stats[cid]) s.stats[cid].written += 1;
  emit(s, 'wrote', { by: cid });
  const waiting = activePlayers(s, now).some((p) => todo(s, p.cid).length > 0);
  if (!waiting) s.closeAt = now + CLOSE_MS;
  return true;
}

/** A phone's vote for the answer written by `pick` (an author's cid). Returns true if taken. */
export function vote(s, cid, pick, now) {
  if (s.phase !== 'vote') return false;
  const m = s.matchups[s.current];
  if (m.votes[cid] || pick === cid || !m.answers[pick]) return false;
  if (!isFinalRound(s) && m.authors.includes(cid)) return false;
  if (!s.players.some((p) => p.cid === cid)) return false;
  m.votes[cid] = pick;
  emit(s, 'voted', { by: cid });
  const waiting = voters(s, m, now).some((p) => !m.votes[p.cid]);
  if (!waiting) s.closeAt = now + CLOSE_MS;
  return true;
}

export function seen(s, cid, now) {
  if (s.lastSeen[cid] != null) s.lastSeen[cid] = now;
}

/** A late joiner can vote right away and gets prompts from the next round. */
export function addPlayer(s, cid, name, now) {
  if (s.players.some((p) => p.cid === cid)) return;
  s.players.push({ cid, name });
  s.scores[cid] = 0;
  s.stats[cid] = freshStats();
  s.lastSeen[cid] = now;
}

export const isOver = (s) => s.phase === 'final';

/** What one phone needs to show. */
export function phoneView(s, cid, now) {
  const me = ranking(s).find((r) => r.cid === cid);
  const view = {
    phase: s.phase,
    round: s.round,
    final: isFinalRound(s),
    score: me ? me.score : 0,
    rank: me ? me.rank : null,
  };
  const m = s.matchups[s.current];
  if (s.phase === 'write') {
    const next = todo(s, cid);
    const mine = s.matchups.filter((x) => x.authors.includes(cid));
    view.prompt = next[0] ? next[0].prompt : null;
    view.step = mine.length - next.length + 1;
    view.steps = mine.length;
    view.left = Math.max(0, (isFinalRound(s) ? FINAL_WRITE_MS : WRITE_MS) - (now - s.phaseAt));
  }
  if (s.phase === 'vote' && m) {
    view.prompt = m.prompt;
    view.author = m.authors.includes(cid) && !isFinalRound(s);
    view.options = options(m).filter((o) => o.cid !== cid).map((o) => ({ id: o.cid, text: o.text }));
    view.voted = m.votes[cid] || null;
    view.left = Math.max(0, (isFinalRound(s) ? FINAL_VOTE_MS : VOTE_MS) - (now - s.phaseAt));
  }
  if (s.phase === 'reveal' && m?.result) {
    const g = m.result.gains[cid];
    view.prompt = m.prompt;
    view.mine = g ? { votes: g.votes, gain: g.gain, mashup: g.mashup, winner: g.winner } : null;
  }
  return view;
}

/** End-of-game awards: [{ title, cid, value, blurb }]. */
export function awards(s) {
  const list = [];
  const ranks = ranking(s);
  if (ranks[0] && ranks[0].score > 0) list.push({ title: 'Monster Mash Champ', cid: ranks[0].cid, value: ranks[0].score, blurb: `${ranks[0].score.toLocaleString()} points` });
  const best = (pick) => {
    let top = null;
    s.players.forEach((p) => {
      const v = pick(s.stats[p.cid] || freshStats());
      if (v > 0 && (!top || v > top.value)) top = { cid: p.cid, value: v };
    });
    return top;
  };
  const add = (pick, title, blurb) => { const b = best(pick); if (b) list.push({ title, blurb: blurb(b.value), ...b }); };
  add((st) => st.mashups, 'Total Mash-up', (v) => `Won every vote ${v} time${v === 1 ? '' : 's'}`);
  add((st) => st.votes, 'Crowd Pleaser', (v) => `${v} vote${v === 1 ? '' : 's'} in all`);
  add((st) => st.won, 'Matchup Master', (v) => `Won ${v} matchup${v === 1 ? '' : 's'}`);
  return list;
}
